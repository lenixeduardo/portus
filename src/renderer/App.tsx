import { DatabaseStatusBadge, type DatabaseStatus } from "./components/DatabaseStatusBadge";
import React, { useEffect, useState } from "react";
import { Eye, Moon, ScanLine, Sun } from "lucide-react";
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
import { UserBarcodeRegistration } from "./components/UserBarcodeRegistration";
import { APP_VERSION, RELEASE_NOTES } from "./releaseNotes";
import type { User } from "../shared/types";
import { getUserViewLabel } from "./user-view-label";
import type { AvailableUpdate, InitialSetupStatus, UpdateGateState } from "../shared/ipc";
import { UpdateAvailableModal } from "./components/UpdateAvailableModal";

const TITLES: Record<Route, string> = {
  dashboard: "Lotes Ativos",
  products: "Produtos",
  history: "Histórico",
  settings: "Configurações",
};

const LAST_SEEN_VERSION_KEY = "portus:last-seen-version";
const DATABASE_STATUS_INTERVAL_MS = 15_000;

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
  const [updateGate, setUpdateGate] = useState<UpdateGateState>({ status: "checking" });
  const [retryingUpdate, setRetryingUpdate] = useState(false);
  const [showReportError, setShowReportError] = useState(false);
  const [requestedUserBarcode, setRequestedUserBarcode] = useState<string | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>("checking");
  const [theme, setTheme] = useState<Theme>(() =>
    window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"
  );

  useEffect(() => {
    if (!window.api?.capture?.onEnded) return;
    let active = true;
    const unsubscribe = window.api.capture.onEnded(event => {
      if (event.reason !== "completed") return;
      // O processo principal ja encerrou a sessao. Atualiza a tela mesmo se
      // o modal de captura nao estiver montado; preserva uma sessao nova.
      void window.api.auth.currentUser().then(current => {
        if (!active) return;
        setUser(current);
        if (!current) {
          setRoute("dashboard");
          setRequestedUserBarcode(null);
        }
      }).catch(error => console.error("Falha ao atualizar sessao apos captura:", error));
    });
    return () => { active = false; unsubscribe(); };
  }, []);

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
    let active = true;
    const loadApplication = async () => {
      try {
        const gate = await window.api.updates.verify();
        if (!active) return;
        setUpdateGate(gate);
        if (gate.status !== "current") {
          setUser(null);
          return;
        }
        const [currentUser, setup] = await Promise.all([
          window.api.auth.currentUser(), window.api.setup.status()
        ]);
        if (!active) return;
        setUser(currentUser);
        if ((setup.supported && !setup.setupCompleted) || !setup.configured) setInitialSetup(setup);
      } catch (error) {
        reportRendererError("mandatory-version-check", error);
        if (active) {
          setUser(null);
          setUpdateGate({ status: "error", error: "Falha ao validar a versão instalada. Verifique sua conexão e tente novamente." });
        }
      } finally {
        if (active) setBootstrapping(false);
      }
    };
    void loadApplication();
    return () => { active = false; };
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

  useEffect(() => {
    if (user && user.role !== "master" && route === "settings") setRoute("dashboard");
  }, [user, route]);

  async function handleLogout() {
    await window.api.auth.logout();
    setUser(null);
    setRoute("dashboard");
  }

  async function retryVersionCheck() {
    if (retryingUpdate) return;
    setRetryingUpdate(true);
    try {
      const gate = await window.api.updates.verify();
      setUpdateGate(gate);
      if (gate.status === "current") {
        const [currentUser, setup] = await Promise.all([
          window.api.auth.currentUser(), window.api.setup.status()
        ]);
        setUser(currentUser);
        setInitialSetup(
          (setup.supported && !setup.setupCompleted) || !setup.configured ? setup : null
        );
      }
    } catch (error) {
      reportRendererError("retry-version-check", error);
      setUpdateGate({ status: "error", error: "Não foi possível verificar a versão. Verifique a conexão e tente novamente." });
    } finally {
      setRetryingUpdate(false);
    }
  }

  function handleUpdateFound(update: AvailableUpdate) {
    setUpdateGate({ status: "required", update });
    setUser(null);
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
  if (updateGate.status !== "current") {
    return (
      <>
        <div className="login-wrap">
          <section className="update-gate-screen" role="status" aria-live="polite">
            <h2>PORTUS</h2>
            {updateGate.status === "checking" && <p>Verificando versão instalada…</p>}
            {updateGate.status === "required" && <p>A versão instalada está desatualizada. Atualize para continuar.</p>}
            {updateGate.status === "error" && <>
              <h3>Verificação de versão indisponível</h3>
              <p role="alert">{updateGate.error}</p>
              <p>O acesso permanece bloqueado até validar a versão instalada.</p>
              <button type="button" disabled={retryingUpdate} onClick={() => void retryVersionCheck()}>
                {retryingUpdate ? "Verificando…" : "Tentar novamente"}
              </button>
            </>}
          </section>
        </div>
        {updateGate.status === "required" &&
          <UpdateAvailableModal update={updateGate.update} onClose={() => undefined} mandatory />}
      </>
    );
  }
  if (initialSetup) return <InitialSetup initialStatus={initialSetup} onCompleted={() => { setUser(null); setInitialSetup(null); }} />;
  if (!user) return (
    <>
      <Login onAuthenticated={setUser} onUpdateFound={handleUpdateFound} />
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
              <DatabaseStatusBadge status={databaseStatus} user={user} />
              <div className="topbar__separator" aria-hidden="true" />
              <ViewStatus sectorCode={user.sectorCode} role={user.role} />
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
            {route === "dashboard" && (
              <Dashboard user={user} onUnknownUserBarcode={setRequestedUserBarcode} />
            )}
            {route === "products" && <Products />}
            {route === "settings" && user.role === "master" && <Settings currentUser={user} />}
            {route === "history" && <History user={user} />}
          </div>
        </div>
      </div>
      <UserBarcodeRegistration
        user={user}
        scannerEnabled={route !== "dashboard"}
        requestedBarcode={requestedUserBarcode}
        onRequestedBarcodeHandled={() => setRequestedUserBarcode(null)}
      />
      {showReleaseNotes && <ReleaseNotesModal onClose={closeReleaseNotes} />}
      {showReportError && <ReportErrorModal onClose={() => setShowReportError(false)} />}
    </>
  );
}

function ViewStatus({ sectorCode, role }: { sectorCode: User["sectorCode"]; role?: User["role"] }) {
  const label = getUserViewLabel(role, sectorCode);

  return (
    <div className="view-status" role="status" title={`View ativa: ${label}`}>
      <Eye size={14} aria-hidden="true" />
      <span><small>View</small>{label}</span>
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
