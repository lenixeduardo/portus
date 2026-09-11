import React, { useEffect, useState } from "react";
import { Database, Moon, RefreshCw, ScanLine, Sun } from "lucide-react";
import "./styles.css";
import { Login } from "./screens/Login";
import { InitialSetup } from "./screens/InitialSetup";
import { Sidebar, type Route } from "./components/Sidebar";
import { Dashboard } from "./screens/Dashboard";
import { Products } from "./screens/Products";
import { History } from "./screens/History";
import { Settings } from "./screens/Settings";
import { Modal } from "./components/Modal";
import { ReportErrorModal } from "./components/ReportErrorModal";
import { APP_VERSION, RELEASE_NOTES } from "./releaseNotes";
import type { User } from "../shared/types";
import type { InitialSetupStatus } from "../shared/ipc";

const TITLES: Record<Route, string> = {
  dashboard: "Lotes Ativos",
  products: "Produtos",
  history: "Histórico",
  settings: "Configurações",
};

const LAST_SEEN_VERSION_KEY = "portus:last-seen-version";
const DATABASE_STATUS_INTERVAL_MS = 15_000;

type DatabaseStatus = "checking" | "connected" | "disconnected" | "unconfigured";
type Theme = "dark" | "light";
const THEME_STORAGE_KEY = "portus:theme";

function hasCentralStatusApi(): boolean {
  const api = window.api as Partial<typeof window.api> | undefined;
  return typeof api?.central?.status === "function";
}

function reportRendererError(source: string, error: unknown): void {
  const api = window.api as Partial<typeof window.api> | undefined;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  void api?.log?.error(`renderer:app:${source}`, message, stack).catch(() => {});
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [route, setRoute] = useState<Route>("dashboard");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [noElectron, setNoElectron] = useState(false);
  const [initialSetup, setInitialSetup] = useState<InitialSetupStatus | null>(null);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showReportError, setShowReportError] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>("checking");
  const [theme, setTheme] = useState<Theme>(() =>
    window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!window.api) {
      setNoElectron(true);
      setBootstrapping(false);
      return;
    }
    const lastSeenVersion = window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
    setShowReleaseNotes(lastSeenVersion !== APP_VERSION);
    Promise.all([window.api.auth.currentUser(), window.api.setup.status()]).then(([u, setup]) => {
      setUser(u);
      if (!u && setup.required && !setup.configured) setInitialSetup(setup);
      setBootstrapping(false);
    }).catch(() => setBootstrapping(false));
  }, []);

  useEffect(() => {
    if (!user || !window.api) return;

    let active = true;

    async function refreshDatabaseStatus() {
      if (!hasCentralStatusApi()) {
        if (active) setDatabaseStatus("disconnected");
        reportRendererError("central-api", new Error("API central ausente ou incompatível no preload instalado."));
        return;
      }
      try {
        const status = await window.api.central.status();
        if (!status || typeof status !== "object") {
          throw new Error("Status da base central inválido.");
        }
        if (!active) return;
        setDatabaseStatus(
          !status.configured
            ? "unconfigured"
            : status.available
              ? "connected"
              : "disconnected"
        );
      } catch (error) {
        if (active) setDatabaseStatus("disconnected");
        reportRendererError("central-status", error);
      }
    }

    setDatabaseStatus("checking");
    void refreshDatabaseStatus();
    const interval = window.setInterval(refreshDatabaseStatus, DATABASE_STATUS_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user]);

  async function handleLogout() {
    await window.api.auth.logout();
    setUser(null);
    setRoute("dashboard");
  }

  function closeReleaseNotes() {
    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
    setShowReleaseNotes(false);
  }

  if (bootstrapping) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0f172a", color: "#94a3b8", fontFamily: "sans-serif" }}>
      Carregando…
    </div>
  );

  if (noElectron) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0f172a", color: "#94a3b8", fontFamily: "sans-serif", gap: 12 }}>
      <p style={{ fontSize: 18, color: "#f1f5f9" }}>PORTUS</p>
      <p>Este app precisa ser aberto pelo Electron, não pelo browser.</p>
      <code style={{ fontSize: 13 }}>npm run electron</code>
    </div>
  );
  if (initialSetup) return <InitialSetup initialStatus={initialSetup} onCompleted={() => setInitialSetup(null)} />;
  if (!user) return (
    <>
      <Login onAuthenticated={setUser} />
      {showReleaseNotes && <ReleaseNotesModal onClose={closeReleaseNotes} />}
    </>
  );

  return (
    <>
      <div className="app-shell">
        <Sidebar user={user} current={route} onNavigate={setRoute} onLogout={handleLogout} onReportError={() => setShowReportError(true)} />
        <div className="main-area">
          <div className="topbar">
            <div className="topbar__spacer" aria-hidden="true" />
            <div className="topbar__telemetry">
              <DatabaseStatusBadge status={databaseStatus} />
              <div className="topbar__separator" aria-hidden="true" />
              <div className="scanner-status" title="Status do leitor de código de barras">
                <ScanLine size={16} />
                <span><small>Leitor</small>Pronto para leitura</span>
              </div>
              <button
                type="button"
                className="theme-switch"
                onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
                aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
                title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              >
                <Sun size={14} className="theme-switch__icon theme-switch__icon--sun" aria-hidden="true" />
                <span className="theme-switch__track" aria-hidden="true">
                  <span className="theme-switch__knob" />
                </span>
                <Moon size={14} className="theme-switch__icon theme-switch__icon--moon" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="content">
            <header className="page-heading">
              <h1>{TITLES[route]}</h1>
              {route !== "dashboard" && <p>Consulte e gerencie os registros operacionais.</p>}
            </header>
            {route === "dashboard" && <Dashboard user={user} />}
            {route === "products" && <Products />}
            {route === "settings" && <Settings currentUser={user} />}
            {route === "history" && <History user={user} />}
          </div>
        </div>
      </div>
      {showReleaseNotes && <ReleaseNotesModal onClose={closeReleaseNotes} />}
      {showReportError && <ReportErrorModal onClose={() => setShowReportError(false)} />}
    </>
  );
}

const DATABASE_STATUS_LABELS: Record<DatabaseStatus, string> = {
  checking: "Verificando",
  connected: "Conectado",
  disconnected: "Desconectado",
  unconfigured: "Não configurado",
};

function DatabaseStatusBadge({ status }: { status: DatabaseStatus }) {
  const checking = status === "checking";

  return (
    <div
      className={`database-status database-status--${status}`}
      role="status"
      aria-live="polite"
      title="Status da conexão com o PostgreSQL central"
    >
      {checking ? <RefreshCw size={13} className="database-status__spinner" /> : <Database size={13} />}
      <span className="database-status__dot" aria-hidden="true" />
      <span><small>Banco de dados</small>{DATABASE_STATUS_LABELS[status]}</span>
    </div>
  );
}

function ReleaseNotesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title={`Atualizações v${APP_VERSION}`}
      onClose={onClose}
      width={520}
      footer={<button onClick={onClose}>Entendi</button>}
    >
      <div className="release-notes">
        {RELEASE_NOTES.map((note) => (
          <section key={note.version} className="release-note-section">
            <h4>v{note.version}</h4>
            <ul>
              {note.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
