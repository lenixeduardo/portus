import React, { useEffect, useState } from "react";
import "./styles.css";
import { Login } from "./screens/Login";
import { Sidebar, type Route } from "./components/Sidebar";
import { Dashboard } from "./screens/Dashboard";
import { Products } from "./screens/Products";
import { History } from "./screens/History";
import { Settings } from "./screens/Settings";
import type { User } from "../shared/types";

const TITLES: Record<Route, string> = {
  dashboard: "Lotes Ativos",
  products: "Produtos",
  history: "Histórico",
  settings: "Configurações",
};

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [route, setRoute] = useState<Route>("dashboard");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [noElectron, setNoElectron] = useState(false);

  useEffect(() => {
    if (!window.api) {
      setNoElectron(true);
      setBootstrapping(false);
      return;
    }
    window.api.auth.currentUser().then((u) => {
      setUser(u);
      setBootstrapping(false);
    }).catch(() => setBootstrapping(false));
  }, []);

  async function handleLogout() {
    await window.api.auth.logout();
    setUser(null);
    setRoute("dashboard");
  }

  if (bootstrapping) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0f172a", color: "#94a3b8", fontFamily: "sans-serif" }}>
      Carregando…
    </div>
  );

  if (noElectron) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0f172a", color: "#94a3b8", fontFamily: "sans-serif", gap: 12 }}>
      <p style={{ fontSize: 18, color: "#f1f5f9" }}>Serial Reader</p>
      <p>Este app precisa ser aberto pelo Electron, não pelo browser.</p>
      <code style={{ fontSize: 13 }}>npm run electron</code>
    </div>
  );
  if (!user) return <Login onAuthenticated={setUser} />;

  return (
    <div className="app-shell">
      <Sidebar user={user} current={route} onNavigate={setRoute} onLogout={handleLogout} />
      <div className="main-area">
        <div className="topbar">
          <h2>{TITLES[route]}</h2>
        </div>
        <div className="content">
          {route === "dashboard" && <Dashboard user={user} onLogout={handleLogout} />}
          {route === "products" && <Products />}
          {route === "settings" && <Settings currentUser={user} />}
          {route === "history" && <History />}
        </div>
      </div>
    </div>
  );
}
