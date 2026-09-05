$ErrorActionPreference = "Stop"

$keeperDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryDirectory = Split-Path -Parent $keeperDirectory
$environmentFile = Join-Path $repositoryDirectory ".env"
$logFile = Join-Path $keeperDirectory "oracle-prices.log"

if (-not (Test-Path -LiteralPath $environmentFile)) {
    throw "Missing repository .env file"
}

foreach ($line in Get-Content -LiteralPath $environmentFile) {
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        continue
    }

    $name = $matches[1]
    $value = $matches[2].Trim()
    if ($value -match '^(.*?)(\s+#.*)$') {
        $value = $matches[1].Trim()
    }
    $value = $value.Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

# Temporary non-secret fallback until the authenticated production RPC is fixed.
$env:ROBINHOOD_MAINNET_RPC = "https://rpc.mainnet.chain.robinhood.com"
$env:ALERT_WEBHOOK_URL = ""

Set-Location -LiteralPath $keeperDirectory
"[$([DateTimeOffset]::Now.ToString('o'))] starting post-prices" | Add-Content -LiteralPath $logFile
& node post-prices.mjs *>> $logFile
$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    & node health.mjs *>> $logFile
    $exitCode = $LASTEXITCODE
}
"[$([DateTimeOffset]::Now.ToString('o'))] finished post-prices-and-health exit=$exitCode" | Add-Content -LiteralPath $logFile
exit $exitCode
