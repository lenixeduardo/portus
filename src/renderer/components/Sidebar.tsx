import React from "react";
import { LayoutDashboard, Package, Clock, Settings, ExternalLink, Bug, LogOut } from "lucide-react";
import type { User } from "../../shared/types";
import { PortusLogo } from "./PortusLogo";

const CONNECT_URL = "https://kairos-connect-nine.vercel.app";

export type Route = "dashboard" | "products" | "history" | "settings";

interface Props {
  user: User;
  current: Route;
  onNavigate: (r: Route) => void;
  onLogout: () => void;
  onReportError: () => void;
}

const NAV: Array<{ key: Route; label: string; icon: React.ElementType; adminOnly?: boolean }> = [
  { key: "dashboard", label: "Lotes Ativos", icon: LayoutDashboard },
  { key: "products", label: "Produtos", icon: Package, adminOnly: true },
  { key: "history", label: "Histórico", icon: Clock, adminOnly: true },
  { key: "settings", label: "Configurações", icon: Settings, adminOnly: true },
];

export function Sidebar({ user, current, onNavigate, onLogout, onReportError }: Props) {
  const visibleNav = NAV.filter((item) =>
    !item.adminOnly || user.role === "admin" || user.role === "master" || (item.key === "history" && user.sectorCode === "LABORATORY")
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <PortusLogo variant="sidebar" />
      </div>
      <nav>
        {visibleNav.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.key}
              href="#"
              className={current === item.key ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(item.key);
              }}
            >
              <Icon size={15} />
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="ecosystem">
        <div className="ecosystem-label">Ecossistema</div>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.api.shell.openExternal(CONNECT_URL).catch(console.error);
          }}
        >
          <ExternalLink size={15} />
          Kairos Connect
        </a>
      </div>
      <div className="sidebar-actions">
        <button
          className="sidebar-action"
          onClick={onReportError}
          title="Reportar um erro ao suporte"
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, marginBottom: 6 }}
        >
          <Bug size={15} />
          Reportar Erro
        </button>
        <button className="sidebar-action" onClick={onLogout}>
          <LogOut size={15} />
          Sair
        </button>
      </div>
    </aside>
  );
}
