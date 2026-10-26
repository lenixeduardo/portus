BEGIN;
CREATE TABLE IF NOT EXISTS public.portus_error_report_queue (
 id BIGSERIAL PRIMARY KEY, station_name TEXT NOT NULL, description TEXT NOT NULL,
 attachment_name TEXT NOT NULL, attachment_text TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ, last_error TEXT
);
CREATE INDEX IF NOT EXISTS portus_error_report_pending ON public.portus_error_report_queue(next_attempt_at,id) WHERE status IN ('pending','failed');
COMMIT;
