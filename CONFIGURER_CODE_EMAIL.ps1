$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$ProjectRef = "hzsfocphpynxoykfkfaj"
$ManagementUrl = "https://api.supabase.com/v1/projects/$ProjectRef"
$TemplatePath = Join-Path $PSScriptRoot "supabase\email-templates\confirm-signup.html"
$DiagnosticPath = Join-Path $PSScriptRoot "DIAGNOSTIC_CODE_EMAIL.txt"

Add-Type -AssemblyName System.Net.Http

function Read-Secret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Pause-And-Exit([int]$Code = 0) {
  Write-Host ""
  Read-Host "Appuie sur Entree pour fermer"
  exit $Code
}

function Fail([string]$Message) {
  $Message | Set-Content -LiteralPath $DiagnosticPath -Encoding UTF8
  Write-Host ""
  Write-Host "[ERREUR] $Message" -ForegroundColor Red
  Write-Host "Diagnostic : $DiagnosticPath" -ForegroundColor DarkGray
  Pause-And-Exit 1
}

function Invoke-Json([string]$Method, [string]$Uri, [hashtable]$Headers, $Body = $null) {
  $client = [System.Net.Http.HttpClient]::new()
  $request = $null
  $response = $null
  try {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), [Uri]$Uri)
    foreach ($entry in $Headers.GetEnumerator()) {
      [void]$request.Headers.TryAddWithoutValidation([string]$entry.Key, [string]$entry.Value)
    }
    if ($null -ne $Body) {
      $json = $Body | ConvertTo-Json -Depth 30 -Compress
      $request.Content = [System.Net.Http.StringContent]::new([string]$json, [Text.Encoding]::UTF8, "application/json")
    }
    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
      $status = [int]$response.StatusCode
      if (-not $text) { $text = $response.ReasonPhrase }
      throw "HTTP $status - $text"
    }
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    try { return $text | ConvertFrom-Json }
    catch { return $text }
  }
  finally {
    if ($null -ne $response) { $response.Dispose() }
    if ($null -ne $request) { $request.Dispose() }
    $client.Dispose()
  }
}

Clear-Host
Write-Host "========================================================="
Write-Host "  GLOBELINK V10.8.14 - CODE DE CONFIRMATION E-MAIL"
Write-Host "========================================================="
Write-Host ""
Write-Host "Ce programme place le code OTP dans le sujet ET dans le corps du mail." -ForegroundColor Cyan
Write-Host "Le token Supabase est utilise une seule fois et n'est jamais sauvegarde." -ForegroundColor DarkGray
Write-Host ""

if (-not (Test-Path -LiteralPath $TemplatePath)) { Fail "Modele e-mail introuvable : $TemplatePath" }
Start-Process "https://supabase.com/dashboard/account/tokens"
$Pat = Read-Secret "Personal Access Token Supabase (sbp_...)"
if (-not $Pat) { Fail "Token Supabase manquant." }
$Headers = @{ Authorization = "Bearer $Pat"; Accept = "application/json" }

try { $null = Invoke-Json "GET" $ManagementUrl $Headers }
catch { Fail "Le token ne peut pas administrer le projet $ProjectRef : $($_.Exception.Message)" }

$Template = [System.IO.File]::ReadAllText($TemplatePath, [Text.Encoding]::UTF8)
if ($Template -notmatch '\{\{\s*\.Token\s*\}\}') { Fail "Le modele local ne contient pas {{ .Token }}." }

$Patch = @{
  external_email_enabled = $true
  disable_signup = $false
  mailer_autoconfirm = $false
  mailer_allow_unverified_email_sign_ins = $false
  mailer_subjects_confirmation = "Ton code GlobeLink : {{ .Token }}"
  mailer_templates_confirmation_content = [string]$Template
  mailer_otp_length = [int]6
  mailer_otp_exp = [int]600
}

Write-Host "Application du modele OTP..." -ForegroundColor Cyan
try { $null = Invoke-Json "PATCH" "$ManagementUrl/config/auth" $Headers $Patch }
catch { Fail "Supabase a refuse le modele OTP : $($_.Exception.Message)" }

Write-Host "Verification de la configuration distante..." -ForegroundColor Cyan
try { $Config = Invoke-Json "GET" "$ManagementUrl/config/auth" $Headers }
catch { Fail "Le modele a ete envoye, mais sa verification a echoue : $($_.Exception.Message)" }

$RemoteSubject = [string]$Config.mailer_subjects_confirmation
$RemoteContent = [string]$Config.mailer_templates_confirmation_content
$RemoteLength = [int]$Config.mailer_otp_length

if ($RemoteSubject -notmatch '\{\{\s*\.Token\s*\}\}') { Fail "Le sujet distant ne contient pas le code OTP." }
if ([string]::IsNullOrWhiteSpace($RemoteContent) -or $RemoteContent -notmatch '\{\{\s*\.Token\s*\}\}') { Fail "Le corps distant ne contient pas le code OTP." }
if ($RemoteLength -ne 6) { Fail "La longueur OTP distante est $RemoteLength au lieu de 6." }

Remove-Item -LiteralPath $DiagnosticPath -ErrorAction SilentlyContinue
$Pat = $null
Write-Host ""
Write-Host "[OK] Le code a ete active dans le sujet et le corps du mail." -ForegroundColor Green
Write-Host "Cree un NOUVEAU compte avec une adresse jamais utilisee pour tester." -ForegroundColor Yellow
Write-Host "Les anciens e-mails deja recus ne seront pas modifies." -ForegroundColor DarkGray
Pause-And-Exit 0
