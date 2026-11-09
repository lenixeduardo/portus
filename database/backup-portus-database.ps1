[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$DatabaseHost,
 [int]$Port=5432,
 [Parameter(Mandatory=$true)][string]$DatabaseName,
 [Parameter(Mandatory=$true)][string]$AdminUser,
 [Parameter(Mandatory=$true)][string]$PostgresBin,
 [Parameter(Mandatory=$true)][ValidateSet("json","custom","plain","tar")][string]$Format,
 [Parameter(Mandatory=$true)][string]$OutputPath
)
$ErrorActionPreference="Stop"
$env:PGCLIENTENCODING="UTF8"
if ([string]::IsNullOrEmpty($env:PORTUS_SETUP_ADMIN_PASSWORD)) { throw "Senha PostgreSQL ausente." }
$env:PGPASSWORD=$env:PORTUS_SETUP_ADMIN_PASSWORD
$psql=Join-Path $PostgresBin "psql.exe"
$dump=Join-Path $PostgresBin "pg_dump.exe"
if (!(Test-Path -LiteralPath $psql) -or !(Test-Path -LiteralPath $dump)) { throw "psql.exe e pg_dump.exe sao obrigatorios." }
if (!(Test-Path -LiteralPath (Split-Path -Parent $OutputPath) -PathType Container)) { throw "Pasta de destino inexistente." }
if (Test-Path -LiteralPath $OutputPath) { throw "Arquivo de destino ja existe; escolha outro nome." }
$partial=$OutputPath+".partial"
if (Test-Path -LiteralPath $partial) { throw "Arquivo temporario ja existe." }
$utf8=New-Object System.Text.UTF8Encoding($false)
function Invoke-Psql([string]$sql) {
 $result = & $psql -X -q -A -t -v ON_ERROR_STOP=1 -h $DatabaseHost -p $Port -U $AdminUser -d $DatabaseName -c $sql 2>&1
 if ($LASTEXITCODE -ne 0) { throw "Consulta de exportacao PostgreSQL falhou: $($result -join ' ')" }
 return ,@($result)
}
try {
 if ($Format -ne "json") {
   $flag=switch($Format) { "custom" {"c"} "plain" {"p"} "tar" {"t"} }
   & $dump -h $DatabaseHost -p $Port -U $AdminUser -d $DatabaseName --format=$flag --no-password --file=$partial
   if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou (codigo $LASTEXITCODE)." }
 } else {
   # One repeatable-read snapshot shared across table queries using pg_export_snapshot.
   # psql commands are separate connections; use a single psql session instead via
   # a generated SQL SELECT that builds the complete JSON in PostgreSQL.
   $tables=@(Invoke-Psql "SELECT format('%I.%I',n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY n.nspname,c.relname;")
   $tables=@($tables | Where-Object { $_ -and $_ -notmatch '^\s*$' })
   $parts=New-Object 'System.Collections.Generic.List[string]'
   foreach($table in $tables) {
     if ($table -notmatch '^"[^"]+"\."[^"]+"$' -and $table -notmatch '^[a-zA-Z_][\w]*\.[a-zA-Z_][\w]*$' -and $table -notmatch '^"[^"]+"\.[a-zA-Z_][\w]*$' -and $table -notmatch '^[a-zA-Z_][\w]*\."[^"]+"$') { throw "Identificador de tabela inesperado." }
     $literal=$table.Replace("'","''")
     [void]$parts.Add("('$literal', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM $table t))")
   }
   $pairs=if($parts.Count) { $parts -join "," } else { "('empty','[]'::jsonb)" }
   $sql="COPY (SELECT jsonb_build_object('format','portus-complete-json-v1','database',current_database(),'exportedAt',now(),'tables',(SELECT jsonb_object_agg(k,v) FROM (VALUES $pairs) x(k,v)))::text) TO STDOUT"
   $lines=Invoke-Psql $sql
   [IO.File]::WriteAllText($partial,($lines -join "`n"),$utf8)
 }
 $file=Get-Item -LiteralPath $partial
 if ($file.Length -le 0) { throw "Backup vazio." }
 if ($Format -eq "json") {
   $parsed=Get-Content -LiteralPath $partial -Raw -Encoding UTF8 | ConvertFrom-Json
   if ($parsed.format -ne "portus-complete-json-v1") { throw "JSON de backup invalido." }
 }
 Move-Item -LiteralPath $partial -Destination $OutputPath -ErrorAction Stop
 Write-Host ("Backup concluido: "+$OutputPath+" ("+(Get-Item -LiteralPath $OutputPath).Length+" bytes)")
} finally {
 Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
 Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
