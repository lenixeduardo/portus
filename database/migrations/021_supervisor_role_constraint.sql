-- Supervisor deve ser um perfil valido no banco central.
-- A aplicacao ja permite criar Supervisor e Master; a constraint inicial
-- ainda nao inclui Supervisor, causando falha no cadastro em bases antigas.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'operator', 'laboratory', 'supervisor', 'master'));
