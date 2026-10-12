BEGIN TRANSACTION READ ONLY;
SELECT json_build_object('database', current_database(), 'databaseUser', current_user,
  'batches', COALESCE(json_agg(row_to_json(candidate) ORDER BY candidate.id), '[]'::json))
FROM (
  SELECT b.id::text, b.code, b.status, b.opened_at,
    (SELECT count(*) FROM readings r WHERE r.batch_id=b.id) AS readings,
    (SELECT count(*) FROM capture_sessions s WHERE s.batch_id=b.id) AS sessions,
    (SELECT count(*) FROM capture_sessions s WHERE s.batch_id=b.id AND s.status='active') AS active_sessions
  FROM batches b
) candidate;
ROLLBACK;
