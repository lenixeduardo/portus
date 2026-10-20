import { describe, expect, it } from "vitest";
import { createCentralUser, deleteCentralUser, listCentralUsers } from "../db/central-users-repo";
import { login, logout } from "../auth/auth-service";
import { centralQuery, closeCentralDatabase } from "../db/central-connection";

describe.skipIf(process.env.PORTUS_QA_E2E !== "1")("exclusao de usuario com PostgreSQL real", () => {
  it("cria Supervisor, remove fisicamente e impede novo login", async () => {
    const stamp = Date.now().toString(36);
    const password = "Supervisor-QA-Strong-2026";
    const masterLogin = "master.delete.qa." + stamp;
    const supervisorLogin = "supervisor.delete.qa." + stamp;
    try {
      const master = await createCentralUser({
        username: masterLogin, password, role: "master", sectorCode: "ADMIN"
      });
      const supervisor = await createCentralUser({
        username: supervisorLogin, password, role: "supervisor", sectorCode: "PRODUCTION"
      });
      expect((await login(supervisorLogin, password))?.id).toBe(supervisor.id);
      logout();

      await deleteCentralUser(supervisor.id, master.id);

      const remaining = await centralQuery<{ count: string }>(
        "SELECT count(*)::text AS count FROM public.users WHERE id=$1 OR username=$2",
        [supervisor.id, supervisorLogin]
      );
      expect(Number(remaining.rows[0].count)).toBe(0);
      expect((await login(supervisorLogin, password))).toBeNull();
      expect((await listCentralUsers(true)).some(user => user.id === supervisor.id)).toBe(false);
      const audit = await centralQuery<{ action: string }>(
        "SELECT action FROM public.portus_audit_log WHERE action='users.delete' AND resource_id=$1",
        [String(supervisor.id)]
      );
      expect(audit.rows).toHaveLength(1);
      console.log("PASS: Supervisor criado, excluido fisicamente e login impossibilitado");
    } finally {
      logout();
      await closeCentralDatabase();
    }
  }, 30000);
});
