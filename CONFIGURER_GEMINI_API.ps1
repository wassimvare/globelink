$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "GlobeLink - Configurer Gemini API"

$EnvPath = Join-Path $PSScriptRoot ".env"

function Stop-WithMessage([string]$Message) {
  Write-Host ""
  Write-Host "[ERREUR] $Message" -ForegroundColor Red
  Write-Host ""
  Read-Host "Appuie sur Entree pour fermer"
  exit 1
}

function Read-ExistingEnv([string]$Path) {
  $Map = [ordered]@{}
  if (-not (Test-Path -LiteralPath $Path)) { return $Map }
  foreach ($Line in Get-Content -LiteralPath $Path) {
    if ($Line -match '^\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)\s*$') {
      $Key = $Matches["key"]
      $Value = $Matches["value"].Trim()
      if (
        ($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
        ($Value.StartsWith("'") -and $Value.EndsWith("'"))
      ) {
        $Value = $Value.Substring(1, [Math]::Max(0, $Value.Length - 2))
      }
      $Map[$Key] = $Value
    }
  }
  return $Map
}

function Save-Env([string]$Path, $Map) {
  $Lines = New-Object System.Collections.Generic.List[string]
  foreach ($Key in $Map.Keys) {
    $Value = [string]$Map[$Key]
    $SafeValue = $Value.Replace('"', '\"')
    $Lines.Add("$Key=`"$SafeValue`"")
  }
  [System.IO.File]::WriteAllText(
    $Path,
    ($Lines -join [Environment]::NewLine) + [Environment]::NewLine,
    (New-Object System.Text.UTF8Encoding($false))
  )
}

function Test-GeminiApi([string]$ApiKey, [string]$Model) {
  $CleanModel = $Model -replace '^models/', ''
  $EncodedModel = [Uri]::EscapeDataString($CleanModel)
  $Uri = "https://generativelanguage.googleapis.com/v1beta/models/${EncodedModel}:generateContent"
  $Payload = @{
    system_instruction = @{
      parts = @(
        @{
          text = "Tu es un test technique. Reponds uniquement OK."
        }
      )
    }
    contents = @(
      @{
        role = "user"
        parts = @(
          @{
            text = "Test GlobeLink Gemini"
          }
        )
      }
    )
    generationConfig = @{
      maxOutputTokens = 2048
      thinkingConfig = @{
        thinkingLevel = "medium"
      }
    }
  } | ConvertTo-Json -Depth 10

  try {
    $Response = Invoke-RestMethod `
      -Method Post `
      -Uri $Uri `
      -Headers @{ "x-goog-api-key" = $ApiKey } `
      -ContentType "application/json" `
      -Body $Payload `
      -TimeoutSec 30 `
      -ErrorAction Stop

    $TextParts = New-Object System.Collections.Generic.List[string]
    $Candidates = @($Response.candidates)
    if ($Candidates.Count -gt 0) {
      $Parts = @($Candidates[0].content.parts)
      foreach ($Part in $Parts) {
        if ($Part.thought -ne $true -and $Part.text) {
          $TextParts.Add([string]$Part.text)
        }
      }
    }
    $Text = ($TextParts -join "").Trim()

    if ($Text.Length -gt 0) {
      Write-Host "Test Gemini API : OK" -ForegroundColor Green
      return $true
    }

    Write-Host "Test Gemini API : reponse recue, mais aucun texte exploitable." -ForegroundColor Yellow
    if ($Candidates.Count -gt 0 -and $Candidates[0].finishReason) {
      Write-Host "Motif Gemini : $($Candidates[0].finishReason)" -ForegroundColor Yellow
    }
    if ($Response.promptFeedback -and $Response.promptFeedback.blockReason) {
      Write-Host "Blocage Gemini : $($Response.promptFeedback.blockReason)" -ForegroundColor Yellow
    }
    if ($Response.usageMetadata) {
      Write-Host "Jetons : sortie=$($Response.usageMetadata.candidatesTokenCount), reflexion=$($Response.usageMetadata.thoughtsTokenCount), total=$($Response.usageMetadata.totalTokenCount)" -ForegroundColor Yellow
    }
    return $false
  } catch {
    $Message = [string]$_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $Message = [string]$_.ErrorDetails.Message
    }
    if ($Message) {
      $Message = $Message.Replace($ApiKey, "[cle masquee]")
      if ($Message.Length -gt 700) { $Message = $Message.Substring(0, 700) + "..." }
    }
    Write-Host "Test Gemini API : ECHEC" -ForegroundColor Red
    Write-Host $Message -ForegroundColor Red
    return $false
  }
}

Clear-Host
Write-Host "====================================================="
Write-Host "        GLOBELINK - CONFIGURATION GEMINI API"
Write-Host "====================================================="
Write-Host ""
Write-Host "1. Va sur : https://aistudio.google.com/app/apikey"
Write-Host "2. Cree une cle API Gemini"
Write-Host "3. Colle-la ici"
Write-Host ""
Write-Host "Les anciennes cles commencent souvent par AIza."
Write-Host "Les nouvelles cles Google AI Studio peuvent commencer par AQ."
Write-Host "Elle restera uniquement dans ton fichier local .env."
Write-Host ""

$GeminiKey = (Read-Host "Colle ta cle GEMINI_API_KEY").Trim()
if (-not $GeminiKey) { Stop-WithMessage "Aucune cle saisie." }
if ($GeminiKey.StartsWith('"') -and $GeminiKey.EndsWith('"')) {
  $GeminiKey = $GeminiKey.Substring(1, [Math]::Max(0, $GeminiKey.Length - 2)).Trim()
}
if ($GeminiKey.StartsWith("'") -and $GeminiKey.EndsWith("'")) {
  $GeminiKey = $GeminiKey.Substring(1, [Math]::Max(0, $GeminiKey.Length - 2)).Trim()
}
if ($GeminiKey.Length -lt 20 -or $GeminiKey -match '\s' -or $GeminiKey.Contains('"') -or $GeminiKey.Contains("'")) {
  Stop-WithMessage "Cette cle ne ressemble pas a une cle API exploitable. Copie uniquement la valeur de la cle depuis https://aistudio.google.com/app/apikey, sans espace ni guillemets."
}

$Model = (Read-Host "Modele Gemini [gemini-3.6-flash]").Trim()
if (-not $Model) { $Model = "gemini-3.6-flash" }

$Env = Read-ExistingEnv $EnvPath
$Env["GEMINI_API_KEY"] = $GeminiKey
$Env["GEMINI_MODEL"] = $Model
Save-Env $EnvPath $Env

Write-Host ""
$TestOk = Test-GeminiApi $GeminiKey $Model
Write-Host ""
if ($TestOk) {
  Write-Host "Gemini est configure dans .env et le test API fonctionne." -ForegroundColor Green
  Write-Host "Relance maintenant LANCER_GLOBELINK.bat." -ForegroundColor Green
} else {
  Write-Host "La cle a ete enregistree dans .env, mais le test API a echoue." -ForegroundColor Yellow
  Write-Host "Corrige la cle, le modele ou le projet Google AI Studio, puis relance ce script." -ForegroundColor Yellow
}
Write-Host ""
Read-Host "Appuie sur Entree pour fermer"
