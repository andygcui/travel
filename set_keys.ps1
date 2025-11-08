<#
set_keys.ps1

Interactive helper to write API keys into backend/.env and frontend/.env.local.
It prompts for common keys used by the project and writes them to the selected target
files. Secrets are read securely (masked) and not echoed to the console.

Run from the project root (`travel/`):
  .\set_keys.ps1

Notes:
- The script will preserve other lines in each .env file and replace any existing
  entries for the keys it writes.
- Files are overwritten only to update the specific keys; other content is preserved.
- Beware of storing secrets on disk. If you prefer a one-time session variable,
  run `Set-Item Env:<NAME> <value>` in PowerShell instead.
#>

function Read-SecretOrPlain {
    param(
        [string]$Prompt,
        [bool]$Mask = $true
    )
    if ($Mask) {
        $s = Read-Host -AsSecureString $Prompt
        if (-not $s) { return '' }
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
        try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { if ($ptr) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) } }
    } else {
        return Read-Host -Prompt $Prompt
    }
}

# Keys to prompt for with targets
$keys = @(
    @{ key = 'AMADEUS_API_KEY'; prompt = 'Amadeus Client ID (AMADEUS_API_KEY)'; targets = @('.\backend\.env') ; mask = $false },
    @{ key = 'AMADEUS_API_SECRET'; prompt = 'Amadeus Client Secret (AMADEUS_API_SECRET)'; targets = @('.\backend\.env') ; mask = $true },
    @{ key = 'AMADEUS_BASE_URL'; prompt = 'Amadeus Base URL (press Enter for https://test.api.amadeus.com)'; targets = @('.\backend\.env') ; mask = $false },
    @{ key = 'CLIMATIQ_KEY'; prompt = 'Climatiq API Key (CLIMATIQ_KEY)'; targets = @('.\backend\.env') ; mask = $true },
    @{ key = 'BRAVE_KEY'; prompt = 'Brave Search Key (BRAVE_KEY)'; targets = @('.\backend\.env') ; mask = $true },
    @{ key = 'DEDALUS_API_KEY'; prompt = 'Dedalus API Key (DEDALUS_API_KEY)'; targets = @('.\backend\.env') ; mask = $true },
    @{ key = 'OPENAI_API_KEY'; prompt = 'OpenAI API Key (OPENAI_API_KEY)'; targets = @('.\backend\.env') ; mask = $true },
    @{ key = 'OPENTRIPMAP_API_KEY'; prompt = 'OpenTripMap API Key (OPENTRIPMAP_API_KEY)'; targets = @('.\backend\.env') ; mask = $false },
    @{ key = 'TEQUILA_API_KEY'; prompt = 'Tequila API Key (TEQUILA_API_KEY)'; targets = @('.\backend\.env') ; mask = $false },
    @{ key = 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'; prompt = 'Google Maps API Key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) — public key for frontend'; targets = @('.\frontend\.env.local') ; mask = $false }
)

# Collect values
$collected = @{}
Write-Host "This script will prompt for keys and write them into .env files. Press Enter to skip any key." -ForegroundColor Cyan
foreach ($k in $keys) {
    $val = Read-SecretOrPlain -Prompt $k.prompt -Mask:$k.mask
    if ($val -and $val.Trim() -ne '') {
        # If user entered a default-like base URL empty, set default
        if ($k.key -eq 'AMADEUS_BASE_URL' -and ($val.Trim() -eq '')) { $val = 'https://test.api.amadeus.com' }
        $collected[$k.key] = @{ value = $val; targets = $k.targets }
    }
}

if ($collected.Count -eq 0) {
    Write-Host 'No keys entered. Exiting.' -ForegroundColor Yellow
    exit 0
}

# Confirm summary (don't print values for masked keys)
Write-Host "\nWill write the following keys:" -ForegroundColor Green
foreach ($name in $collected.Keys) {
    $mask = ($name -match 'SECRET|KEY|TOKEN|CLIMATIQ|DEDALUS|OPENAI|BRAVE')
    if ($mask) { $display = '<hidden>' } else { $display = $collected[$name].value }
    $targs = ($collected[$name].targets -join ', ')
    Write-Host " - $name -> $targs : $display"
}

$ok = Read-Host -Prompt 'Proceed to write these values to disk? (y/n)'
if ($ok.ToLower() -ne 'y') { Write-Host 'Aborted by user.'; exit 1 }

# Helper to merge keys into a target .env file
function Merge-Into-EnvFile {
    param(
        [string]$FilePath,
        [hashtable]$EntriesToWrite
    )

    $existing = @()
    if (Test-Path $FilePath) { $existing = Get-Content -Raw -Path $FilePath -ErrorAction SilentlyContinue }
    $lines = @()
    if ($existing) { $lines = $existing -split "\r?\n" | Where-Object { $_ -ne $null } }

    # Remove existing entries for any keys we'll write
    $filtered = $lines | Where-Object { $line = $_; -not ($EntriesToWrite.Keys | ForEach-Object { $line -match "^$_\s*=" } | Where-Object { $_ }) }

    # Append new entries
    $toAppend = @()
    foreach ($k in $EntriesToWrite.Keys) {
        $toAppend += "$k=$($EntriesToWrite[$k])"
    }

    $outLines = @()
    if ($filtered) { $outLines += $filtered }
    $outLines += $toAppend

    # Ensure parent dir exists
    $parent = Split-Path -Parent $FilePath
    if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

    $outLines | Set-Content -Path $FilePath -Encoding UTF8
    Write-Host "Wrote/updated $FilePath" -ForegroundColor Green
}

# Group entries by target file
$targetsMap = @{}
foreach ($k in $collected.Keys) {
    foreach ($t in $collected[$k].targets) {
        if (-not $targetsMap.ContainsKey($t)) { $targetsMap[$t] = @{} }
        $targetsMap[$t][$k] = $collected[$k].value
    }
}

# Merge into each file
foreach ($file in $targetsMap.Keys) {
    try {
        Merge-Into-EnvFile -FilePath $file -EntriesToWrite $targetsMap[$file]
    } catch {
        # $_ is the error record; log its message
        $msg = $_.Exception.Message
        Write-Host ("Failed to write {0}: {1}" -f $file, $msg) -ForegroundColor Red
    }
}

Write-Host "Done. Remember to keep these files out of version control (add to .gitignore if needed)." -ForegroundColor Cyan
