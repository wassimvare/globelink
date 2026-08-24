$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$ProjectRef = "hzsfocphpynxoykfkfaj"
$ProjectUrl = "https://$ProjectRef.supabase.co"
$ManagementUrl = "https://api.supabase.com/v1/projects/$ProjectRef"
$TemplatePath = Join-Path $PSScriptRoot "supabase\email-templates\confirm-signup.html"
$EnvPath = Join-Path $PSScriptRoot ".env"
$CredentialsPath = Join-Path $PSScriptRoot "IDENTIFIANTS_ADMIN_LOCAL.txt"
$GoogleCallback = "$ProjectUrl/auth/v1/callback"

Add-Type -AssemblyName System.Net.Http

function Read-Secret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Stop-WithMessage([string]$Message) {
  Write-Host ""
  Write-Host "[ERREUR] $Message" -ForegroundColor Red
  Write-Host ""
  Read-Host "Appuie sur Entree pour fermer"
  exit 1
}

# Utilise HttpClient au lieu d'Invoke-RestMethod. Cela evite l'erreur PowerShell
# "Impossible de convertir la valeur en type System.String" rencontree sur
# certaines versions de Windows PowerShell 5.1.
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

function Apply-AuthPatch([string]$Label, [hashtable]$Patch, [hashtable]$Headers) {
  Write-Host "- $Label..." -ForegroundColor Cyan
  try {
    $null = Invoke-Json "PATCH" "$ManagementUrl/config/auth" $Headers $Patch
    Write-Host "  OK" -ForegroundColor Green
  }
  catch {
    Stop-WithMessage "$Label a echoue : $($_.Exception.Message)"
  }
}

function Get-ApiKeyValue($Item) {
  foreach ($name in @("api_key", "value", "key")) {
    if ($Item.PSObject.Properties.Name -contains $name) {
      $value = [string]$Item.$name
      if ($value) { return $value.Trim() }
    }
  }
  return $null
}

function Find-SecretKey($Items) {
  foreach ($item in @($Items)) {
    $name = ([string]$item.name).ToLowerInvariant()
    $type = ([string]$item.type).ToLowerInvariant()
    $value = Get-ApiKeyValue $item
    if (-not $value) { continue }
    if ($value.StartsWith("sb_secret_") -or $name -match "service.?role|secret" -or $type -match "service.?role|secret") {
      return $value
    }
  }
  return $null
}

function Set-EnvValue([string]$Name, [string]$Value) {
  $lines = if (Test-Path $EnvPath) { [System.Collections.Generic.List[string]](Get-Content -LiteralPath $EnvPath) } else { [System.Collections.Generic.List[string]]::new() }
  $prefix = "$Name="
  $updated = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].StartsWith($prefix, [StringComparison]::Ordinal)) {
      $lines[$i] = "$Name=`"$Value`""
      $updated = $true
      break
    }
  }
  if (-not $updated) { $lines.Add("$Name=`"$Value`"") }
  [System.IO.File]::WriteAllLines($EnvPath, $lines, (New-Object System.Text.UTF8Encoding($false)))
}

function New-StrongPassword([int]$Length = 24) {
  $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_"
  $bytes = New-Object byte[] $Length
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $chars = for ($i = 0; $i -lt $Length; $i++) { $alphabet[$bytes[$i] % $alphabet.Length] }
  return -join $chars
}

Clear-Host
Write-Host "========================================================="
Write-Host "  GLOBELINK V10.8.14 - AUTH ET CODE E-MAIL"
Write-Host "========================================================="
Write-Host ""
Write-Host "Projet Supabase : $ProjectRef" -ForegroundColor Cyan
Write-Host "Les secrets saisis ne sont pas affiches et le token Supabase n'est pas sauvegarde." -ForegroundColor DarkGray
Write-Host ""

Write-Host "Un Personal Access Token Supabase est necessaire pour configurer Auth." -ForegroundColor Yellow
Start-Process "https://supabase.com/dashboard/account/tokens"
$Pat = Read-Secret "Personal Access Token Supabase"
if (-not $Pat) { Stop-WithMessage "Token Supabase manquant." }
$MgmtHeaders = @{ Authorization = "Bearer $Pat"; Accept = "application/json" }
try { $null = Invoke-Json "GET" $ManagementUrl $MgmtHeaders }
catch { Stop-WithMessage "Le token ne peut pas administrer le projet $ProjectRef : $($_.Exception.Message)" }
Write-Host "Acces au projet confirme." -ForegroundColor Green

# Configuration generale appliquee separement pour identifier precisement les erreurs.
$BasePatch = @{
  external_email_enabled = $true
  disable_signup = $false
  mailer_autoconfirm = $false
  mailer_allow_unverified_email_sign_ins = $false
  mailer_secure_email_change_enabled = $true
  site_url = "http://localhost:5173"
  uri_allow_list = "http://localhost:5173/**,http://127.0.0.1:5173/**,http://192.168.*.*:5173/**,https://*.trycloudflare.com/**"
}
Apply-AuthPatch "Configuration generale e-mail" $BasePatch $MgmtHeaders

Write-Host ""
$ConfigureSmtp = (Read-Host "Configurer maintenant l'envoi des codes e-mail avec ton SMTP ? (O/N)").Trim().ToUpperInvariant() -eq "O"
if ($ConfigureSmtp) {
  Write-Host "Exemples compatibles : Brevo, Resend SMTP, Mailjet, SendGrid, Postmark." -ForegroundColor DarkGray
  $FromEmail = (Read-Host "Adresse d'envoi verifiee chez le fournisseur SMTP").Trim()
  $SmtpHost = (Read-Host "Serveur SMTP").Trim()
  $SmtpPort = (Read-Host "Port SMTP (souvent 587)").Trim()
  if (-not $SmtpPort) { $SmtpPort = "587" }
  $SmtpUser = (Read-Host "Utilisateur SMTP").Trim()
  $SmtpPass = Read-Secret "Mot de passe / cle SMTP"
  $SenderName = (Read-Host "Nom d'expediteur (defaut GlobeLink)").Trim()
  if (-not $SenderName) { $SenderName = "GlobeLink" }
  if (-not $FromEmail -or -not $SmtpHost -or -not $SmtpUser -or -not $SmtpPass) { Stop-WithMessage "Configuration SMTP incomplete." }
  if ($SmtpPort -notmatch '^\d{2,5}$') { Stop-WithMessage "Le port SMTP doit etre un nombre, par exemple 587." }
  $SmtpPatch = @{
    smtp_admin_email = [string]$FromEmail
    smtp_host = [string]$SmtpHost
    smtp_port = [string]$SmtpPort
    smtp_user = [string]$SmtpUser
    smtp_pass = [string]$SmtpPass
    smtp_sender_name = [string]$SenderName
    smtp_max_frequency = [int]60
  }
  Apply-AuthPatch "Configuration SMTP" $SmtpPatch $MgmtHeaders
}

if (Test-Path $TemplatePath) {
  $TemplateContent = [System.IO.File]::ReadAllText($TemplatePath, [Text.Encoding]::UTF8)
  $TemplatePatch = @{
    mailer_subjects_confirmation = "Ton code GlobeLink : {{ .Token }}"
    mailer_templates_confirmation_content = [string]$TemplateContent
    mailer_otp_length = [int]6
    mailer_otp_exp = [int]600
  }
  Apply-AuthPatch "Modele du code de confirmation" $TemplatePatch $MgmtHeaders
  try {
    $RemoteAuth = Invoke-Json "GET" "$ManagementUrl/config/auth" $MgmtHeaders
    $RemoteSubject = [string]$RemoteAuth.mailer_subjects_confirmation
    $RemoteContent = [string]$RemoteAuth.mailer_templates_confirmation_content
    if ($RemoteSubject -notmatch '\{\{\s*\.Token\s*\}\}') {
      Stop-WithMessage "Le sujet e-mail distant ne contient pas le code OTP. Lance CONFIGURER_CODE_EMAIL.bat."
    }
    if ([string]::IsNullOrWhiteSpace($RemoteContent) -or $RemoteContent -notmatch '\{\{\s*\.Token\s*\}\}') {
      Stop-WithMessage "Le corps e-mail distant ne contient pas le code OTP. Lance CONFIGURER_CODE_EMAIL.bat."
    }
    Write-Host "  Code OTP verifie dans le sujet et le corps du mail." -ForegroundColor Green
  }
  catch {
    Stop-WithMessage "Le modele a ete envoye, mais sa verification a echoue : $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "Pour Google, l'URI de redirection autorisee dans Google Cloud doit etre :" -ForegroundColor Cyan
Write-Host $GoogleCallback -ForegroundColor White
$GoogleCallback | Set-Clipboard
Write-Host "Elle a ete copiee dans le presse-papiers." -ForegroundColor DarkGray
$ConfigureGoogle = (Read-Host "As-tu cree les identifiants OAuth Google avec cette URI ? (O/N)").Trim().ToUpperInvariant() -eq "O"
if ($ConfigureGoogle) {
  $GoogleClientId = (Read-Host "Google Client ID").Trim()
  $GoogleSecret = Read-Secret "Google Client Secret"
  if (-not $GoogleClientId -or -not $GoogleSecret) { Stop-WithMessage "Identifiants Google incomplets." }
  if ($GoogleClientId -notmatch '\.apps\.googleusercontent\.com$') { Stop-WithMessage "Le Google Client ID ne semble pas valide." }
  $GooglePatch = @{
    external_google_enabled = $true
    external_google_client_id = [string]$GoogleClientId
    external_google_secret = [string]$GoogleSecret
  }
  Apply-AuthPatch "Connexion Google" $GooglePatch $MgmtHeaders
  Set-EnvValue "VITE_ENABLE_GOOGLE_AUTH" "true"
} else {
  Write-Host "Google ne sera pas modifie. Tu pourras relancer ce programme plus tard." -ForegroundColor Yellow
}

Write-Host ""
$CreateAdmin = (Read-Host "Creer ou reinitialiser maintenant le compte administrateur ? (O/N)").Trim().ToUpperInvariant() -eq "O"
if ($CreateAdmin) {
  $AdminEmail = (Read-Host "Adresse e-mail du compte administrateur").Trim().ToLowerInvariant()
  if ($AdminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { Stop-WithMessage "Adresse e-mail administrateur invalide." }
  $AdminPassword = New-StrongPassword 24

  Write-Host "Recuperation temporaire de la cle serveur..."
  try { $ApiKeys = Invoke-Json "GET" "$ManagementUrl/api-keys" $MgmtHeaders }
  catch { Stop-WithMessage "Impossible de recuperer les cles API du projet : $($_.Exception.Message)" }
  $KeyItems = if ($ApiKeys -and $ApiKeys.PSObject.Properties.Name -contains "keys") { $ApiKeys.keys } else { $ApiKeys }
  $SecretKey = Find-SecretKey $KeyItems
  if (-not $SecretKey) { Stop-WithMessage "Aucune cle serveur secret/service_role n'a ete trouvee." }
  $ProjectHeaders = @{ apikey = $SecretKey; Accept = "application/json" }
  if (-not $SecretKey.StartsWith("sb_secret_")) { $ProjectHeaders.Authorization = "Bearer $SecretKey" }

  $UserId = $null
  try {
    $Users = Invoke-Json "GET" "$ProjectUrl/auth/v1/admin/users?per_page=1000&page=1" $ProjectHeaders
    $Existing = @($Users.users) | Where-Object { ([string]$_.email).ToLowerInvariant() -eq $AdminEmail } | Select-Object -First 1
    if ($Existing) {
      $UserId = [string]$Existing.id
      $null = Invoke-Json "PUT" "$ProjectUrl/auth/v1/admin/users/$UserId" $ProjectHeaders @{
        password = $AdminPassword
        email_confirm = $true
        user_metadata = @{ username = "globelink_admin"; full_name = "Administrateur GlobeLink" }
      }
    } else {
      $Created = Invoke-Json "POST" "$ProjectUrl/auth/v1/admin/users" $ProjectHeaders @{
        email = $AdminEmail
        password = $AdminPassword
        email_confirm = $true
        user_metadata = @{ username = "globelink_admin"; full_name = "Administrateur GlobeLink" }
      }
      $UserId = [string]$Created.id
    }
  } catch { Stop-WithMessage "Le compte Auth administrateur n'a pas pu etre cree : $($_.Exception.Message)" }
  if (-not $UserId) { Stop-WithMessage "Identifiant utilisateur administrateur introuvable." }

  $RestHeaders = @{ apikey = $SecretKey; Prefer = "resolution=merge-duplicates,return=minimal"; Accept = "application/json" }
  if (-not $SecretKey.StartsWith("sb_secret_")) { $RestHeaders.Authorization = "Bearer $SecretKey" }
  try {
    $null = Invoke-Json "POST" "$ProjectUrl/rest/v1/profiles?on_conflict=id" $RestHeaders @(@{
      id = $UserId
      username = "globelink_admin"
      display_name = "Administrateur GlobeLink"
    })
    try {
      $null = Invoke-Json "PATCH" "$ProjectUrl/rest/v1/profiles?id=eq.$UserId" $RestHeaders @{
        status = "active"
        visibility = "private"
        verified = $true
      }
    } catch {
      Write-Host "Les colonnes optionnelles du profil ne sont pas encore presentes; le compte reste utilisable." -ForegroundColor Yellow
    }
    $null = Invoke-Json "POST" "$ProjectUrl/rest/v1/user_roles?on_conflict=user_id,role" $RestHeaders @(@{
      user_id = $UserId
      role = "admin"
      granted_by = $UserId
    })
  } catch { Stop-WithMessage "Le compte existe mais le role admin n'a pas pu etre enregistre : $($_.Exception.Message)" }

  Set-EnvValue "SUPABASE_SERVICE_ROLE_KEY" $SecretKey
  $credentialText = @"
GLOBELINK - COMPTE ADMINISTRATEUR TEMPORAIRE

Adresse e-mail : $AdminEmail
Mot de passe temporaire : $AdminPassword

IMPORTANT : connecte-toi, puis change ce mot de passe immediatement.
Ce fichier est local et ignore par Git. Supprime-le apres avoir change le mot de passe.
"@
  [System.IO.File]::WriteAllText($CredentialsPath, $credentialText, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ""
  Write-Host "Compte administrateur pret." -ForegroundColor Green
  Write-Host "E-mail : $AdminEmail" -ForegroundColor Cyan
  Write-Host "Mot de passe temporaire : $AdminPassword" -ForegroundColor Yellow
  Write-Host "Une copie locale a ete enregistree dans IDENTIFIANTS_ADMIN_LOCAL.txt." -ForegroundColor DarkGray
}

$GitIgnore = Join-Path $PSScriptRoot ".gitignore"
$IgnoreLine = "IDENTIFIANTS_ADMIN_LOCAL.txt"
if (Test-Path $GitIgnore) {
  $ignore = Get-Content -LiteralPath $GitIgnore -Raw
  if ($ignore -notmatch [regex]::Escape($IgnoreLine)) { Add-Content -LiteralPath $GitIgnore -Value "`n$IgnoreLine" }
}

Write-Host ""
Write-Host "Configuration terminee. Relance completement GlobeLink." -ForegroundColor Green
Write-Host "Pour tester les e-mails, utilise une adresse d'envoi verifiee dans Brevo." -ForegroundColor Green
Read-Host "Appuie sur Entree pour fermer"
