# eb_setenv.ps1
#
# Reads values from .env and applies them to the current EB environment via
# `eb setenv`, so you never have to retype/remember them after recreating
# the environment. Run this from the code/ folder, right after `eb init`
# and `eb create` on a fresh environment.
#
# Deliberately SKIPS the three AWS credential vars (AWS_ACCESS_KEY_ID,
# AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN) -- EB gets credentials
# automatically from the instance profile, and these are local-dev-only,
# temporary, and would go stale on EB anyway.

$envFile = ".env"
$skipKeys = @("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN")

if (-not (Test-Path $envFile)) {
    Write-Error "No .env file found in the current directory. Run this from seakeepers/code/."
    exit 1
}

$pairs = @()

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    if ($line -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        if ($skipKeys -notcontains $key) {
            $pairs += "$key=$value"
        }
    }
}

if ($pairs.Count -eq 0) {
    Write-Error "No env vars found to set."
    exit 1
}

$setenvArgs = $pairs -join " "
Write-Host "Applying $($pairs.Count) environment variables to EB..."
Invoke-Expression "eb setenv $setenvArgs"