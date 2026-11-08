<#
.SYNOPSIS
  Builds a signed release APK on this laptop, the same as the pipeline's, into app\apk\.

.DESCRIPTION
  Asks for the signing key's password, keeps it only in this PowerShell process while the build runs,
  then clears it. The key itself is made once: docs/guides/build-pipeline.md, "One-time setup".

  Usually the pipeline makes releases (merge to main). Use this when GitHub is not an option.
  Every build signed with this key installs over the last one and keeps the vault. Run from the app folder:

    .\scripts\release-apk.ps1 -Keystore C:\Users\kulka\keys\vault.jks
    .\scripts\release-apk.ps1 -Keystore C:\Users\kulka\keys\vault.jks -Version 0.2.0
#>
param(
  [Parameter(Mandatory = $true)][string]$Keystore,
  [string]$Alias = 'vault',
  [ValidatePattern('^(\d+\.\d+\.\d+)?$')][string]$Version = ''
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Keystore)) { throw "Keystore not found: $Keystore" }

$secure = Read-Host 'Keystore password' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

$names = 'PM_KEYSTORE_FILE', 'PM_KEYSTORE_PASSWORD', 'PM_KEY_ALIAS', 'PM_KEY_PASSWORD', 'PM_VERSION'
try {
  $env:PM_KEYSTORE_FILE = (Resolve-Path $Keystore).Path
  $env:PM_KEYSTORE_PASSWORD = $password
  $env:PM_KEY_ALIAS = $Alias
  # The key password is the keystore password unless one was chosen separately when making the key.
  $env:PM_KEY_PASSWORD = $password
  if ($Version) { $env:PM_VERSION = $Version }
  npm run android:apk:release
  if ($LASTEXITCODE -ne 0) { throw 'The release build failed; see the output above.' }
}
finally {
  foreach ($name in $names) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
  $password = $null
}
