import React, { useEffect, useState } from "react";
import { Database, RefreshCw } from "lucide-react";
import "./styles.css";
import { Login } from "./screens/Login";
import { Sidebar, type Route } from "./components/Sidebar";
import { Dashboard } from "./screens/Dashboard";
import { Products } from "./screens/Products";
import { History } from "./screens/History";
import { Settings } from "./screens/Settings";
import { Modal } from "./components/Modal";
import { ReportErrorModal } from "./components/ReportErrorModal";
import { APP_VERSION, RELEASE_NOTES } from "./releaseNotes";
import type { User } from "../shared/types";

const TITLES: Record<Route, string> = {
  dashboard: "Lotes Ativos",
  products: "Produtos",
  history: "Histórico",
  settings: "Configurações",
};

const LAST_SEEN_VERSION_KEY = "portus:last-seen-version";
const DATABASE_STATUS_INTERVAL_MS = 15_000;

type DatabaseStatus = "checking" | "connected" | "disconnected" | "unconfigured";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [route, setRoute] = useState<Route>("dashboard");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [noElectron, setNoElectron] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showReportError, setShowReportError] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>("checking");

  useEffect(() => {
    if (!window.api) {
      setNoElectron(true);
      setBootstrapping(false);
      return;
    }
    const lastSeenVersion = window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
    setShowReleaseNotes(lastSeenVersion !== APP_VERSION);
    window.api.auth.currentUser().then((u) => {
      setUser(u);
      setBootstrapping(false);
    }).catch(() => setBootstrapping(false));
  }, []);

  useEffect(() => {
    if (!user || !window.api) return;

    let active = true;

    async function refreshDatabaseStatus() {
      try {
        const status = await window.api.central.status();
        if (!active) return;
        setDatabaseStatus(
          !status.configured
            ? "unconfigured"
            : status.available
              ? "connected"
              : "disconnected"
        );
      } catch {
        if (active) setDatabaseStatus("disconnected");
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
            <h2>{TITLES[route]}</h2>
            <DatabaseStatusBadge status={databaseStatus} />
          </div>
          <div className="content">
            {route === "dashboard" && <Dashboard user={user} onLogout={handleLogout} />}
            {route === "products" && <Products />}
            {route === "settings" && <Settings currentUser={user} />}
            {route === "history" && user.role === "admin" && <History />}
          </div>
        </div>
      </div>
      {showReleaseNotes && <ReleaseNotesModal onClose={closeReleaseNotes} />}
      {showReportError && <ReportErrorModal onClose={() => setShowReportError(false)} />}
    </>
  );
}

const DATABASE_STATUS_LABELS: Record<DatabaseStatus, string> = {
  checking: "Verificando banco",
  connected: "Banco conectado",
  disconnected: "Banco desconectado",
  unconfigured: "Banco não configurado",
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
      <span>{DATABASE_STATUS_LABELS[status]}</span>
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
