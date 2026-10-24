$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$helperSource = (Resolve-Path 'build/portus-apply-update.ps1').Path
$root = Join-Path $env:RUNNER_TEMP ('portus-rollback-' + [guid]::NewGuid())
$installed = Join-Path $root 'installed'
$payload = Join-Path $root 'payload'
$session = Join-Path $root 'session'
New-Item -ItemType Directory -Path $installed,$payload,$session -Force | Out-Null
$acl = Get-Acl -LiteralPath $installed
$acl.SetOwner([Security.Principal.WindowsIdentity]::GetCurrent().User)
Set-Acl -LiteralPath $installed -AclObject $acl
function MakeManifest($path,$version) {
  $files = @('app.asar','Portus.exe') | ForEach-Object {
    $relative = if ($_ -eq 'app.asar') { 'resources/app.asar' } else { $_ }
    [pscustomobject]@{path=$relative;sha256=(Get-FileHash -LiteralPath (Join-Path $path $relative) -Algorithm SHA256).Hash.ToLowerInvariant()}
  }
  @{schema=1;version=$version;files=@($files)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $path '.portus-update-manifest.json') -Encoding UTF8
}
foreach ($path in @($installed,$payload)) { New-Item -ItemType Directory -Path (Join-Path $path 'resources') -Force | Out-Null }
Copy-Item -LiteralPath $helperSource -Destination (Join-Path $installed 'resources/portus-apply-update.ps1')
$helper = Join-Path $installed 'resources/portus-apply-update.ps1'
[IO.File]::WriteAllText((Join-Path $installed 'resources/app.asar'),'old app')
[IO.File]::WriteAllText((Join-Path $installed 'Portus.exe'),'old exe')
[IO.File]::WriteAllText((Join-Path $payload 'resources/app.asar'),'new app')
[IO.File]::WriteAllText((Join-Path $payload 'Portus.exe'),'new exe')
MakeManifest $installed '0.1.0'
MakeManifest $payload '0.2.0'
$zip = Join-Path $session 'update.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($payload,$zip)
$config = @{archive=$zip;sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant();version='0.2.0';installDir=$installed;executable=(Join-Path $installed 'Portus.exe');session=[guid]::NewGuid().ToString();parentPid=2147483647}
$status = Join-Path $installed ('.portus-update-work\' + $config.session)
$configPath = Join-Path $session 'config.json'
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
# The first file changes; a locked executable then causes a real copy/read failure.
$lock = [IO.File]::Open((Join-Path $installed 'Portus.exe'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $helper -ConfigPath $configPath
  Get-Content -LiteralPath (Join-Path $status 'apply.log') | Write-Host
  if ($LASTEXITCODE -eq 0) { throw 'Expected apply failure' }
} finally { $lock.Dispose() }
if ([IO.File]::ReadAllText((Join-Path $installed 'resources/app.asar')) -ne 'old app') { throw 'Rollback failed to restore app.asar' }
if ([IO.File]::ReadAllText((Join-Path $installed 'Portus.exe')) -ne 'old exe') { throw 'Locked executable changed' }
if ((Get-Content -LiteralPath (Join-Path $status 'apply.log') -Raw) -notmatch 'ROLLED_BACK') { throw 'No rollback was exercised' }
Write-Host 'PORTUS_FILE_ROLLBACK_OK'
# An archive with traversal must fail before READY and before touching the installation.
$badSession = Join-Path $root 'unsafe'
New-Item -ItemType Directory -Path $badSession | Out-Null
$badZip = Join-Path $badSession 'bad.zip'
$archive = [IO.Compression.ZipFile]::Open($badZip,[IO.Compression.ZipArchiveMode]::Create)
$entry = $archive.CreateEntry('../outside.txt')
$writer = New-Object IO.StreamWriter($entry.Open())
$writer.Write('outside');$writer.Dispose();$archive.Dispose()
$config.session=[guid]::NewGuid().ToString();$badStatus=Join-Path $installed ('.portus-update-work\' + $config.session)
$config.archive=$badZip;$config.sha256=(Get-FileHash -LiteralPath $badZip -Algorithm SHA256).Hash.ToLowerInvariant()
$badConfig = Join-Path $badSession 'config.json'
$config | ConvertTo-Json | Set-Content -LiteralPath $badConfig -Encoding UTF8
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $helper -ConfigPath $badConfig
if ($LASTEXITCODE -eq 0 -or (Test-Path -LiteralPath (Join-Path $badStatus 'ready')) -or (Test-Path -LiteralPath (Join-Path $badSession 'outside.txt'))) { throw 'Unsafe ZIP was accepted' }
Write-Host 'PORTUS_FILE_TRAVERSAL_REJECTED_OK'

exit 0
