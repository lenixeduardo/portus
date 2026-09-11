import React, { useEffect, useState } from "react";
import { CheckCircle2, Database, LoaderCircle, ServerCog, TriangleAlert } from "lucide-react";
import type { InitialSetupInput, InitialSetupStatus } from "../../shared/ipc";
import { PortusLogo } from "../components/PortusLogo";

interface Props {
  initialStatus: InitialSetupStatus;
  onCompleted: () => void;
}

const DEFAULTS: Omit<InitialSetupInput, "adminPassword" | "appPassword"> = {
  postgresBin: "",
  databaseHost: "127.0.0.1",
  port: 5432,
  adminUser: "postgres",
  databaseName: "portus",
  appUser: "portus_admin"
};

export function InitialSetup({ initialStatus, onCompleted }: Props) {
  const [form, setForm] = useState<InitialSetupInput>({
    ...DEFAULTS,
    postgresBin: initialStatus.postgresBin ?? "",
    adminPassword: "",
    appPassword: ""
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setForm((current) => ({ ...current, postgresBin: initialStatus.postgresBin ?? current.postgresBin }));
  }, [initialStatus.postgresBin]);

  function update<K extends keyof InitialSetupInput>(key: K, value: InitialSetupInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (form.appPassword !== confirmPassword) {
      setError("As senhas do usuário do PORTUS não coincidem.");
      return;
    }
    setRunning(true);
    try {
      const result = await window.api.setup.run(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Banco configurado e conexão validada. Abrindo o PORTUS…");
      window.setTimeout(onCompleted, 700);
    } catch {
      setError("Não foi possível executar a configuração. Confira as credenciais e tente novamente.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="initial-setup-wrap">
      <section className="initial-setup-card" aria-labelledby="setup-title">
        <aside className="initial-setup-intro">
          <PortusLogo variant="login" />
          <div>
            <span className="setup-eyebrow">PRIMEIRO ACESSO</span>
            <h1>Configuração inicial</h1>
            <p>Prepare a conexão do PORTUS com o PostgreSQL central nesta estação.</p>
          </div>
          <ol className="setup-steps">
            <li className="is-current"><span>1</span> Localizar PostgreSQL</li>
            <li><span>2</span> Criar ou atualizar o banco</li>
            <li><span>3</span> Validar conexão central</li>
          </ol>
          <p className="setup-note">As senhas são usadas somente durante esta configuração e não são exibidas pelo PORTUS.</p>
        </aside>
        <div className="initial-setup-form-wrap">
          <div className="setup-form-heading">
            <Database size={20} aria-hidden="true" />
            <div>
              <h2 id="setup-title">Banco PostgreSQL</h2>
              <p>Use o servidor local ou o servidor central da sua operação.</p>
            </div>
          </div>

          {!initialStatus.postgresBin && (
            <div className="setup-warning"><TriangleAlert size={16} /> PostgreSQL não foi localizado automaticamente. Informe a pasta <code>bin</code>.</div>
          )}
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="setup-postgres-bin">Pasta bin do PostgreSQL</label>
              <div className="setup-input-icon"><ServerCog size={15} /><input id="setup-postgres-bin" value={form.postgresBin} onChange={(e) => update("postgresBin", e.target.value)} placeholder={'C:\\Program Files\\PostgreSQL\\18\\bin'} /></div>
              <small>Deve conter o arquivo <code>psql.exe</code>.</small>
            </div>
            <div className="setup-grid">
              <div className="field"><label htmlFor="setup-host">Servidor</label><input id="setup-host" value={form.databaseHost} onChange={(e) => update("databaseHost", e.target.value)} /></div>
              <div className="field"><label htmlFor="setup-port">Porta</label><input id="setup-port" type="number" min="1" max="65535" value={form.port} onChange={(e) => update("port", Number(e.target.value))} /></div>
            </div>
            <div className="setup-grid">
              <div className="field"><label htmlFor="setup-admin">Administrador PostgreSQL</label><input id="setup-admin" value={form.adminUser} onChange={(e) => update("adminUser", e.target.value)} /></div>
              <div className="field"><label htmlFor="setup-admin-password">Senha do administrador</label><input id="setup-admin-password" type="password" value={form.adminPassword} onChange={(e) => update("adminPassword", e.target.value)} autoComplete="new-password" /></div>
            </div>
            <div className="setup-grid">
              <div className="field"><label htmlFor="setup-database">Banco</label><input id="setup-database" value={form.databaseName} onChange={(e) => update("databaseName", e.target.value)} /></div>
              <div className="field"><label htmlFor="setup-user">Usuário do PORTUS</label><input id="setup-user" value={form.appUser} onChange={(e) => update("appUser", e.target.value)} /></div>
            </div>
            <div className="setup-grid">
              <div className="field"><label htmlFor="setup-password">Senha do PORTUS</label><input id="setup-password" type="password" value={form.appPassword} onChange={(e) => update("appPassword", e.target.value)} autoComplete="new-password" /></div>
              <div className="field"><label htmlFor="setup-confirm">Confirmar senha</label><input id="setup-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" /></div>
            </div>
            {error && <div className="error">{error}</div>}
            {message && <div className="success"><CheckCircle2 size={16} /> {message}</div>}
            <button className="setup-submit" type="submit" disabled={running}>
              {running ? <><LoaderCircle size={16} className="database-status__spinner" /> Configurando banco…</> : <><CheckCircle2 size={16} /> Configurar e validar</>}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
