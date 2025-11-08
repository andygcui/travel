<#
get_amadeus_token.ps1

Prompts for Amadeus client id and client secret (or reads them from
environment variables `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET`) and
requests an OAuth2 client_credentials token from Amadeus test endpoint.

Usage:
  - Set env vars in the current PowerShell session:
      $env:AMADEUS_CLIENT_ID = "your_client_id"
      $env:AMADEUS_CLIENT_SECRET = "your_client_secret"
    then run:
      .\get_amadeus_token.ps1

  - Or run interactively and enter credentials when prompted.

Outputs the JSON response and copies the access token to the clipboard
(if `Set-Clipboard` is available).
#>

# Helper to securely read secret if environment var not set
function Get-SecretValue {
    param(
        [string]$EnvName,
        [string]$Prompt
n    )

    if ($env:$EnvName) {
        return $env:$EnvName
    }

    # Read as secure string then convert to plain text for the HTTP body only
    $secure = Read-Host -AsSecureString $Prompt
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        if ($ptr) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    }
}

# Parameters: allow writing token to an env var or file
param(
    [string]$OutFile = '', # path to write a single-line env file like 'AMADEUS_ACCESS_TOKEN=...'
    [switch]$SetEnv      # if set, also export token into current session as $env:AMADEUS_ACCESS_TOKEN
)

# Get client id (plain text) and secret (secure prompt if needed)
$clientId = if ($env:AMADEUS_CLIENT_ID) { $env:AMADEUS_CLIENT_ID } else { Read-Host -Prompt 'Amadeus Client ID' }
$clientSecret = Get-SecretValue -EnvName 'AMADEUS_CLIENT_SECRET' -Prompt 'Amadeus Client Secret'

# Build form body with URL-encoding
$body = "grant_type=client_credentials&client_id=$([System.Uri]::EscapeDataString($clientId))&client_secret=$([System.Uri]::EscapeDataString($clientSecret))"

try {
    $response = Invoke-RestMethod -Method Post -Uri 'https://test.api.amadeus.com/v1/security/oauth2/token' -ContentType 'application/x-www-form-urlencoded' -Body $body
} catch {
    Write-Host 'Request failed:' -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# Pretty-print JSON response
$responseJson = $response | ConvertTo-Json -Depth 5
Write-Output $responseJson

# Copy access token to clipboard if available
if ($response.access_token) {
    $token = $response.access_token

    # Copy access token to clipboard if available
    if (Get-Command -Name Set-Clipboard -ErrorAction SilentlyContinue) {
        $token | Set-Clipboard
        Write-Host 'Access token copied to clipboard.' -ForegroundColor Green
    } else {
        Write-Host 'Set-Clipboard not available; token printed above.' -ForegroundColor Yellow
    }

    # Optionally set token in current session environment
    if ($SetEnv) {
        $env:AMADEUS_ACCESS_TOKEN = $token
        Write-Host 'Set $env:AMADEUS_ACCESS_TOKEN in current session.' -ForegroundColor Green
    }

    # Optionally write token to an env-style file (append or create)
    if ($OutFile -ne '') {
        try {
            $line = "AMADEUS_ACCESS_TOKEN=$token"
            # Create parent dir if needed
            $parent = Split-Path -Parent $OutFile
            if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

            # Write/overwrite file with single variable
            Set-Content -Path $OutFile -Value $line -Encoding UTF8
            Write-Host "Wrote token to $OutFile" -ForegroundColor Green
        } catch {
            Write-Host "Failed to write token to $OutFile: $_" -ForegroundColor Red
        }
    }
} else {
    Write-Host 'No access_token field in response.' -ForegroundColor Yellow
}
