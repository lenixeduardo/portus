BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
  'database', current_database(),
  'databaseUser', current_user,
  'batches', COALESCE((SELECT json_agg(row_to_json(b) ORDER BY b.id) FROM (
    SELECT id::text, code, status, opened_at,
      (SELECT count(*) FROM readings r WHERE r.batch_id=batches.id) AS readings,
      (SELECT count(*) FROM capture_sessions s WHERE s.batch_id=batches.id) AS sessions,
      (SELECT count(*) FROM capture_sessions s WHERE s.batch_id=batches.id AND s.status='active') AS active_sessions
    FROM batches
  ) b), '[]'::json),
  'users', COALESCE((SELECT json_agg(row_to_json(u) ORDER BY u.id) FROM (
    SELECT id::text, username, role, active FROM users
  ) u), '[]'::json),
  'products', COALESCE((SELECT json_agg(row_to_json(p) ORDER BY p.id) FROM (
    SELECT id::text, name, active FROM products
  ) p), '[]'::json),
  'counts', json_build_object(
    'readings', (SELECT count(*) FROM readings),
    'capture_sessions', (SELECT count(*) FROM capture_sessions),
    'batch_history', (SELECT count(*) FROM batch_history),
    'capture_error_logs', (SELECT count(*) FROM capture_error_logs)
  )
);
ROLLBACK;
