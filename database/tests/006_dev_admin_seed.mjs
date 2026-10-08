import assert from "node:assert/strict";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE ?? "portus"
});

try {
  const accounts = await pool.query(
    "SELECT id, username, password_hash, role, sector_code, active " +
    "FROM public.users WHERE lower(username) = 'admin'"
  );
  assert.equal(accounts.rowCount, 1, "Deve existir exatamente um admin central");
  const admin = accounts.rows[0];
  assert.equal(admin.username, "admin");
  assert.equal(admin.role, "master");
  assert.equal(admin.sector_code, "PRODUCTION");
  assert.equal(admin.active, true);
  assert.notEqual(admin.password_hash, "admin", "Senha não pode ser armazenada em texto puro");
  assert.match(admin.password_hash, /^\$2[ab]\$12\$/);
  assert.equal(await bcrypt.compare("admin", admin.password_hash), true,
    "A senha bcrypt deve ser compatível com login do PORTUS");
  assert.equal(await bcrypt.compare("incorreta", admin.password_hash), false);

  const permissions = await pool.query(
    "SELECT s.code, p.can_read, p.can_open, p.can_capture, p.can_move " +
    "FROM public.user_sector_permissions p " +
    "JOIN public.sectors s ON s.id = p.sector_id " +
    "WHERE p.user_id=$1 ORDER BY s.code",
    [admin.id]
  );
  assert.deepEqual(permissions.rows.map(row => row.code), ["LABORATORY", "PRODUCTION"]);
  for (const permission of permissions.rows) {
    assert.equal(permission.can_read, true);
    assert.equal(permission.can_open, true);
    assert.equal(permission.can_capture, true);
    assert.equal(permission.can_move, true);
  }
  console.log("OK: admin/admin via bcrypt, perfil Master e permissões de ambas as estações.");
} finally {
  await pool.end();
}
