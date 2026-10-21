param([Parameter(Mandatory=$true)][string]$ConfigPath, [switch]$Elevated)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$work = Split-Path -Parent $ConfigPath
$log = Join-Path $work 'apply.log'
function Log([string]$Message) { Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) $Message" -Encoding UTF8 }
function SafePath([string]$Root, [string]$Relative) {
  if ([string]::IsNullOrWhiteSpace($Relative) -or $Relative -match '(^[/\\]|:|(^|[/\\])\.\.([/\\]|$)|[\x00-\x1f])') { throw "Unsafe path: $Relative" }
  $base = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $path = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
  if (-not $path.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw "Path outside root: $Relative" }
  # Never follow junctions/symlinks in an existing installation.
  $node = $path
  while ($node -and $node.Length -ge $base.TrimEnd('\').Length) {
    if ((Test-Path -LiteralPath $node) -and ((Get-Item -LiteralPath $node -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Link not allowed: $node" }
    $node = Split-Path -Parent $node
  }
  return $path
}
function ReadManifest([string]$Root) {
  $data = Get-Content -LiteralPath (Join-Path $Root '.portus-update-manifest.json') -Raw | ConvertFrom-Json
  if ($data.schema -ne 1 -or $data.version -notmatch '^\d+\.\d+\.\d+$' -or @($data.files).Count -lt 2) { throw 'Invalid manifest' }
  $seen = @{}
  foreach ($f in $data.files) {
    $null = SafePath $Root $f.path
    $key = $f.path.Replace('\','/').ToLowerInvariant()
    if ($seen.ContainsKey($key) -or $key -eq '.portus-update-manifest.json' -or $f.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid file manifest' }
    $seen[$key] = $true
  }
  if (-not $seen.ContainsKey('portus.exe') -or -not $seen.ContainsKey('resources/app.asar')) { throw 'Incomplete manifest' }
  return $data
}
function StartPortus {
  # Avoid running the application elevated after an update to Program Files.
  if ($Elevated) {
    $shell = New-Object -ComObject Shell.Application
    $shell.ShellExecute($config.executable, '', $config.installDir, 'open', 1)
  } else { Start-Process -FilePath $config.executable -WorkingDirectory $config.installDir }
}
$changed = New-Object 'System.Collections.Generic.List[object]'
$applied = $false
try {
  # Elevate only when the current installation directory is not writable. No installer is used.
  $probe = Join-Path $config.installDir ('.portus-write-' + [guid]::NewGuid().ToString())
  try { [IO.File]::WriteAllText($probe,'probe'); Remove-Item -LiteralPath $probe -Force }
  catch {
    if ($Elevated) { throw }
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -ConfigPath "' + $ConfigPath + '" -Elevated'
    Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -ArgumentList $arguments
    exit 0
  }
  $stage = Join-Path $work 'stage'
  $backup = Join-Path $work 'backup'
  New-Item -ItemType Directory -Path $stage,$backup -Force | Out-Null
  if ((Get-FileHash -LiteralPath $config.archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $config.sha256) { throw 'Archive integrity failure' }
  $zip = [IO.Compression.ZipFile]::OpenRead($config.archive)
  try {
    $entries = @{}
    foreach ($entry in $zip.Entries) {
      $destination = SafePath $stage $entry.FullName
      $key = $entry.FullName.Replace('\','/').ToLowerInvariant()
      if ($entries.ContainsKey($key)) { throw 'Duplicate ZIP entry' }
      $entries[$key] = $true
      if (($entry.ExternalAttributes -shr 16 -band 0xF000) -eq 0xA000) { throw 'ZIP links are not supported' }
      if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $destination -Force | Out-Null; continue }
      New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination,$true)
    }
  } finally { $zip.Dispose() }
  $manifest = ReadManifest $stage
  if ($manifest.version -ne $config.version) { throw 'Unexpected version' }
  foreach ($f in $manifest.files) {
    $source = SafePath $stage $f.path
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $f.sha256) { throw "File integrity failure: $($f.path)" }
    $null = SafePath $config.installDir $f.path
  }
  $previous = $null
  if (Test-Path -LiteralPath (Join-Path $config.installDir '.portus-update-manifest.json')) { $previous = ReadManifest $config.installDir }
  if (Test-Path -LiteralPath (Join-Path $work 'cancel')) { throw 'Update canceled' }
  Log "READY version=$($manifest.version)"
  [IO.File]::WriteAllText((Join-Path $work 'ready'),'ready')
  # Wait for this exact PORTUS process, not a reused process id.
  $parent = Get-Process -Id $config.parentPid -ErrorAction SilentlyContinue
  if ($parent -and -not $parent.WaitForExit(120000)) { throw 'PORTUS did not close; update aborted' }
  if (Test-Path -LiteralPath (Join-Path $work 'cancel')) { throw 'Update canceled' }
  $closed = $true
  Start-Sleep -Milliseconds 1500
  $nextPaths = @{}
  $operations = @($manifest.files)
  foreach ($f in $manifest.files) { $nextPaths[$f.path.ToLowerInvariant()] = $true }
  if ($previous) {
    foreach ($f in $previous.files) {
      if (-not $nextPaths.ContainsKey($f.path.ToLowerInvariant())) { $operations += [pscustomobject]@{path=$f.path;sha256=$null} }
    }
  }
  $operations += [pscustomobject]@{path='.portus-update-manifest.json';sha256=(Get-FileHash -LiteralPath (Join-Path $stage '.portus-update-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()}
  foreach ($f in $operations) {
    $destination = SafePath $config.installDir $f.path
    $exists = Test-Path -LiteralPath $destination -PathType Leaf
    if ($exists -and $f.sha256 -and (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -eq $f.sha256) { continue }
    $saved = SafePath $backup $f.path
    if ($exists) { New-Item -ItemType Directory -Path (Split-Path -Parent $saved) -Force | Out-Null; Copy-Item -LiteralPath $destination -Destination $saved -Force }
    $changed.Add([pscustomobject]@{destination=$destination;saved=$saved;existed=$exists})
    if ($f.sha256) {
      New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
      Copy-Item -LiteralPath (SafePath $stage $f.path) -Destination $destination -Force
    } elseif ($exists) { Remove-Item -LiteralPath $destination -Force }
  }
  $applied = $true
  Log "APPLIED version=$($manifest.version) changed=$($changed.Count)"
  StartPortus
  [IO.File]::WriteAllText((Join-Path $work 'completed'),$manifest.version)
  Remove-Item -LiteralPath $stage,$backup,$config.archive -Recurse -Force -ErrorAction SilentlyContinue
} catch {
  Log "FAILED $_"
  if (-not $applied -and $changed.Count -gt 0) {
    for ($i=$changed.Count-1; $i -ge 0; $i--) {
      $item = $changed[$i]
      try {
        if ($item.existed) { Copy-Item -LiteralPath $item.saved -Destination $item.destination -Force }
        else { Remove-Item -LiteralPath $item.destination -Force -ErrorAction SilentlyContinue }
      } catch { Log "ROLLBACK FAILED $_" }
    }
    Log 'ROLLED_BACK'
  }
  if ($closed) { try { StartPortus } catch { Log "RESTART FAILED $_" } }
  [IO.File]::WriteAllText((Join-Path $work 'failed'),"$_")
  exit 1
}
