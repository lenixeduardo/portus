BEGIN;

-- O banco PORTUS é dedicado. Clientes operacionais não recebem privilégios
-- implícitos pelo papel PUBLIC; permissões devem ser concedidas a uma role de
-- runtime específica do ambiente de implantação.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Mantém a mesma política para objetos criados por migrations futuras.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMENT ON SCHEMA public IS
  'PORTUS central: acesso operacional somente por roles explicitamente autorizadas.';

COMMIT;
