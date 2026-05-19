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

  useEffect(() => {
    window.api.auth.currentUser().then((u) => {
      setUser(u);
      setBootstrapping(false);
    });
  }, []);

  async function handleLogout() {
    await window.api.auth.logout();
    setUser(null);
    setRoute("dashboard");
  }

  if (bootstrapping) return null;
  if (!user) return <Login onAuthenticated={setUser} />;

  return (
    <div className="app-shell">
      <Sidebar user={user} current={route} onNavigate={setRoute} onLogout={handleLogout} />
      <div className="main-area">
        <div className="topbar">
          <h2>{TITLES[route]}</h2>
        </div>
        <div className="content">
          {route === "dashboard" && <Dashboard />}
          {route === "products" && <Products />}
          {route === "settings" && <Settings currentUserId={user.id} />}
          {route === "history" && <History />}
        </div>
      </div>
    </div>
  );
}
