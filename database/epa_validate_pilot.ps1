#Requires -Version 5.1
param(
  [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9._-]+$')][string]$BatchCode,
  [ValidateRange(0, 9223372036854775807)][long]$ProductId = 0,
  [string]$DatabaseName = 'portus',
  [string]$DatabaseHost = '127.0.0.1',
  [int]$Port = 5432,
  [string]$AdminUser = 'postgres',
  [string]$PostgresBin = "$env:ProgramFiles\PostgreSQL\18\bin"
)

$ErrorActionPreference = 'Stop'
$exe = if ($env:OS -eq 'Windows_NT') { 'psql.exe' } else { 'psql' }
$psql = Join-Path $PostgresBin $exe
if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) {
  throw 'psql ausente. Informe a pasta bin do PostgreSQL com -PostgresBin.'
}

$sql = @'
WITH matches AS (
  SELECT id, product_id, code, lab_analysis_cycle AS cycle FROM public.batches
  WHERE code = :'batch_code' AND (:'product_id'::bigint = 0 OR product_id = :'product_id'::bigint)
), batch AS (
  SELECT * FROM matches WHERE (SELECT count(*) FROM matches) = 1
), evidence AS (
  SELECT to_jsonb(b) AS batch, r.id AS analysis_id, r.revision, r.specification_id, s.status AS specification_status,
    r.created_by AS opened_by, e.id AS evaluation_id, e.assessed_by, e.outcome,
    a.decision, a.decided_by, a.actor_role, a.decided_at,
    (SELECT count(*) FROM public.lab_samples x WHERE x.analysis_run_id = r.id) AS samples,
    (SELECT count(*) FROM public.lab_results x WHERE x.analysis_run_id = r.id AND x.invalidated_at IS NULL) AS results,
    COALESCE(a.decided_by <> r.created_by AND a.decided_by <> e.assessed_by
      AND NOT EXISTS (SELECT FROM public.lab_samples x WHERE x.analysis_run_id = r.id AND x.created_by = a.decided_by)
      AND NOT EXISTS (SELECT FROM public.lab_results x WHERE x.analysis_run_id = r.id AND x.created_by = a.decided_by),
      FALSE) AS distinct_reviewer,
    public.lab_batch_has_approved_conformity(b.id, b.cycle) AS current_approval,
    EXISTS (SELECT FROM public.portus_audit_log log
      WHERE log.action = 'lab.conformity.decided' AND log.resource_type = 'lab_conformity_evaluation'
        AND log.resource_id = e.id::text AND log.actor_user_id = a.decided_by
        AND log.details->>'decision' = 'approved') AS decision_in_audit
  FROM batch b
  LEFT JOIN LATERAL (SELECT * FROM public.lab_analysis_runs WHERE batch_id = b.id AND cycle = b.cycle
    ORDER BY revision DESC LIMIT 1) r ON TRUE
  LEFT JOIN public.lab_product_specifications s ON s.id = r.specification_id
  LEFT JOIN LATERAL (SELECT * FROM public.lab_conformity_evaluations WHERE analysis_run_id = r.id
    ORDER BY id DESC LIMIT 1) e ON TRUE
  LEFT JOIN public.lab_approvals a ON a.evaluation_id = e.id
)
SELECT jsonb_build_object(
  'database', current_database(),
  'status', CASE
    WHEN NOT EXISTS (SELECT FROM matches) THEN 'lote_nao_encontrado'
    WHEN (SELECT count(*) FROM matches) > 1 THEN 'lote_ambiguo_informe_product_id'
    WHEN (SELECT specification_status = 'approved' AND samples > 0 AND results > 0
      AND distinct_reviewer AND current_approval AND decision_in_audit FROM evidence)
      THEN 'aprovado_no_banco'
    ELSE 'pendente_no_banco' END,
  'candidates', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id), '[]'::jsonb) FROM matches m),
  'evidence', (SELECT to_jsonb(e) FROM evidence e)
);
'@

$originalOptions = $env:PGOPTIONS
try {
  $env:PGOPTIONS = "$originalOptions -c default_transaction_read_only=on".Trim()
  $arguments = @('-X', '-qAt', '-h', $DatabaseHost, '-p', $Port, '-U', $AdminUser, '-d', $DatabaseName,
    '-v', 'ON_ERROR_STOP=1', '-v', "batch_code=$BatchCode", '-v', "product_id=$ProductId", '-f', '-')
  $result = $sql | & $psql @arguments
  if ($LASTEXITCODE -ne 0) { throw "Consulta EPA falhou (psql exit $LASTEXITCODE)." }
} finally {
  $env:PGOPTIONS = $originalOptions
}

$report = ($result -join [Environment]::NewLine) | ConvertFrom-Json
$report | ConvertTo-Json -Depth 8
if ($report.status -ne 'aprovado_no_banco') { exit 1 }
