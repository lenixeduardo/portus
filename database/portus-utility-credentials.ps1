# Senha PostgreSQL do utilitario, protegida por DPAPI do usuario Windows.
# Windows PowerShell 5.1 loads ProtectedData from System.Security on demand.
Add-Type -AssemblyName System.Security -ErrorAction Stop
function Get-PortusUtilityCredentialPath(
  [string]$DatabaseHost, [string]$Port, [string]$DatabaseName,
  [string]$AdminUser, [string]$CredentialRoot = ''
) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Persistencia de senha disponivel apenas no Windows com DPAPI.'
  }
  if (-not $CredentialRoot) { $CredentialRoot = Join-Path $env:LOCALAPPDATA 'PORTUS\utility-credentials' }
  $identity = @($DatabaseHost.Trim().ToLowerInvariant(),$Port.Trim(),$DatabaseName.Trim(),$AdminUser.Trim()) | ConvertTo-Json -Compress
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $key = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity))).Replace('-','').ToLowerInvariant() }
  finally { $sha.Dispose() }
  return Join-Path $CredentialRoot ($key + '.credential')
}

function Save-PortusUtilityPassword(
  [string]$DatabaseHost, [string]$Port, [string]$DatabaseName,
  [string]$AdminUser, [string]$Password, [string]$CredentialRoot = ''
) {
  $path = Get-PortusUtilityCredentialPath $DatabaseHost $Port $DatabaseName $AdminUser $CredentialRoot
  if ([string]::IsNullOrEmpty($Password)) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    return
  }
  New-Item -ItemType Directory -Path (Split-Path $path -Parent) -Force | Out-Null
  $temporary = "$path.$([Guid]::NewGuid().ToString('N')).tmp"
  $backup = "$temporary.backup"
  $plain = [Text.Encoding]::UTF8.GetBytes($Password)
  try {
    # Windows DPAPI scoped to the current Windows account; avoids PowerShell module autoload failures.
    $encrypted = [Security.Cryptography.ProtectedData]::Protect(
      $plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $payload = 'dpapi:' + [Convert]::ToBase64String($encrypted)
    [IO.File]::WriteAllText($temporary, $payload, [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $path) { [IO.File]::Replace($temporary,$path,$backup) }
    else { [IO.File]::Move($temporary,$path) }
  } finally {
    [Array]::Clear($plain, 0, $plain.Length)
    foreach ($file in @($temporary,$backup)) {
      if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
    }
  }
}

function Read-PortusUtilityPassword(
  [string]$DatabaseHost, [string]$Port, [string]$DatabaseName,
  [string]$AdminUser, [string]$CredentialRoot = ''
) {
  $path = Get-PortusUtilityCredentialPath $DatabaseHost $Port $DatabaseName $AdminUser $CredentialRoot
  if (-not (Test-Path -LiteralPath $path)) { return '' }
  $payload = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
  if ($payload.StartsWith('dpapi:')) {
    $encrypted = [Convert]::FromBase64String($payload.Substring(6))
    $plain = [Security.Cryptography.ProtectedData]::Unprotect(
      $encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    try { return [Text.Encoding]::UTF8.GetString($plain) }
    finally { [Array]::Clear($plain, 0, $plain.Length) }
  }
  # Read legacy ConvertFrom-SecureString DPAPI files without forcing a credentials migration.
  $secure = ConvertTo-SecureString $payload
  $pointer = [IntPtr]::Zero
  try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $secure.Dispose()
  }
}
