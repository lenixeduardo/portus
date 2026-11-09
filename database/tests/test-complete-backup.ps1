# Execute on Windows PowerShell 5.1 with a disposable PostgreSQL database.
# Environment: PORTUS_TEST_DB, PORTUS_TEST_HOST, PORTUS_TEST_PORT,
# PORTUS_TEST_USER, PORTUS_TEST_BIN, PORTUS_SETUP_ADMIN_PASSWORD.
$ErrorActionPreference="Stop"
$root=Split-Path -Parent $PSScriptRoot
$gui=Get-Content (Join-Path $root "portus-db-utility.ps1") -Raw
$runner=Get-Content (Join-Path $root "portus-db-utility-runner.ps1") -Raw
foreach($fragment in @('$backupButton = Make-Action "Backup completo"','$backupButton.Add_Click({ Start-Action "backup" })','$backupButton.Enabled = -not $busy','"-BackupFormat"','"-BackupPath"')) {
 if (!$gui.Contains($fragment)) { throw "Falha no teste estatico do botao: $fragment" }
}
if (!$runner.Contains('"backup" {')) { throw "Runner nao encaminha o backup." }
Write-Host "PASS: botao declarado, conectado e integrado ao runner (teste estatico)."
$required=@("PORTUS_TEST_DB","PORTUS_TEST_HOST","PORTUS_TEST_PORT","PORTUS_TEST_USER","PORTUS_TEST_BIN","PORTUS_SETUP_ADMIN_PASSWORD")
foreach($name in $required) { if (![Environment]::GetEnvironmentVariable($name)) { throw "Defina $name para testes de integracao." } }
$bin=$env:PORTUS_TEST_BIN
$psql=Join-Path $bin "psql.exe"
$pgrestore=Join-Path $bin "pg_restore.exe"
$dumpScript=Join-Path $root "backup-portus-database.ps1"
$env:PGPASSWORD=$env:PORTUS_SETUP_ADMIN_PASSWORD
$connection=@("-X","-v","ON_ERROR_STOP=1","-h",$env:PORTUS_TEST_HOST,"-p",$env:PORTUS_TEST_PORT,"-U",$env:PORTUS_TEST_USER,"-d",$env:PORTUS_TEST_DB)
$restoreDb=$env:PORTUS_TEST_DB+"_backup_test"
$tmp=Join-Path $env:TEMP ("portus-backup-tests-"+[guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
 & $psql @connection -c "CREATE TABLE IF NOT EXISTS public.portus_backup_test (id integer PRIMARY KEY, label text NOT NULL);" | Out-Null
 if ($LASTEXITCODE -ne 0) { throw "Falha preparando fixture." }
 & $psql @connection -c "INSERT INTO public.portus_backup_test VALUES (1,'acentos: ação \\ teste') ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label;" | Out-Null
 if ($LASTEXITCODE -ne 0) { throw "Falha inserindo fixture." }
 foreach($fmt in @("json","custom","plain","tar")) {
   $ext=@{json=".json";custom=".dump";plain=".sql";tar=".tar"}[$fmt]
   $file=Join-Path $tmp ("backup"+$ext)
   & $dumpScript -DatabaseHost $env:PORTUS_TEST_HOST -Port ([int]$env:PORTUS_TEST_PORT) -DatabaseName $env:PORTUS_TEST_DB -AdminUser $env:PORTUS_TEST_USER -PostgresBin $bin -Format $fmt -OutputPath $file
   if (!$? -or !(Test-Path $file) -or (Get-Item $file).Length -eq 0) { throw "Backup $fmt falhou." }
   if ($fmt -eq "json") {
     $json=Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json
     if ($json.tables.'public.portus_backup_test'[0].id -ne 1) { throw "JSON perdeu dados." }
   }
   if ($fmt -eq "custom" -or $fmt -eq "tar") {
     & $pgrestore --list $file | Out-Null
     if ($LASTEXITCODE -ne 0) { throw "pg_restore nao reconhece $fmt." }
   }
   Write-Host "PASS: backup $fmt"
 }
 # Restore into an isolated, pre-created database; never overwrite the source.
 & $psql -X -v ON_ERROR_STOP=1 -h $env:PORTUS_TEST_HOST -p $env:PORTUS_TEST_PORT -U $env:PORTUS_TEST_USER -d postgres -c ("CREATE DATABASE "+$restoreDb) | Out-Null
 if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel criar banco isolado para restore." }
 & $pgrestore --no-owner --no-acl -h $env:PORTUS_TEST_HOST -p $env:PORTUS_TEST_PORT -U $env:PORTUS_TEST_USER -d $restoreDb (Join-Path $tmp "backup.dump")
 if ($LASTEXITCODE -ne 0) { throw "Restauracao custom falhou." }
 $restored=& $psql -X -A -t -h $env:PORTUS_TEST_HOST -p $env:PORTUS_TEST_PORT -U $env:PORTUS_TEST_USER -d $restoreDb -c "SELECT label FROM public.portus_backup_test WHERE id=1;"
 if ($LASTEXITCODE -ne 0 -or !$restored) { throw "Dados restaurados nao conferem." }
 Write-Host "PASS: restauracao custom em banco isolado."
 $original=(Get-FileHash (Join-Path $tmp "backup.dump")).Hash
 try {
   & $dumpScript -DatabaseHost $env:PORTUS_TEST_HOST -Port ([int]$env:PORTUS_TEST_PORT) -DatabaseName $env:PORTUS_TEST_DB -AdminUser $env:PORTUS_TEST_USER -PostgresBin $bin -Format custom -OutputPath (Join-Path $tmp "backup.dump")
   throw "Falha: sobrescrita nao foi bloqueada."
 } catch {
   if ($_.Exception.Message -eq "Falha: sobrescrita nao foi bloqueada.") { throw }
 }
 if ((Get-FileHash (Join-Path $tmp "backup.dump")).Hash -ne $original) { throw "Arquivo original alterado." }
 Write-Host "PASS: protecao contra sobrescrita."
} finally {
 Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
 Write-Host "Arquivos de teste em $tmp. Remova o banco isolado $restoreDb manualmente apos inspecao."
}
