param([string]$BindAddress='127.0.0.1',[int]$Port=8787,[string]$PfxPath='')
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$env:HOST=$BindAddress
$env:PORT="$Port"
if ($PfxPath) {
 $env:TLS_PFX=(Resolve-Path -LiteralPath $PfxPath).Path
 $securePassword=Read-Host 'Certificate password' -AsSecureString
 $env:TLS_PASSWORD=[System.Net.NetworkCredential]::new('', $securePassword).Password
}
try { node server/index.mjs } finally { Remove-Item Env:TLS_PASSWORD -ErrorAction SilentlyContinue }
