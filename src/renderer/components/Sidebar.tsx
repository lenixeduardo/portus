import React from "react";
import { LayoutDashboard, Package, Clock, Settings, Usb, ExternalLink } from "lucide-react";
import type { User } from "../../shared/types";

const CONNECT_URL = "https://kairos-connect-nine.vercel.app";

export type Route = "dashboard" | "products" | "history" | "settings";

interface Props {
  user: User;
  current: Route;
  onNavigate: (r: Route) => void;
  onLogout: () => void;
}

const NAV: Array<{ key: Route; label: string; icon: React.ElementType; adminOnly?: boolean }> = [
  { key: "dashboard", label: "Lotes Ativos", icon: LayoutDashboard },
  { key: "products", label: "Produtos", icon: Package, adminOnly: true },
  { key: "history", label: "Histórico", icon: Clock },
  { key: "settings", label: "Configurações", icon: Settings, adminOnly: true },
];

export function Sidebar({ user, current, onNavigate, onLogout }: Props) {
  const visibleNav = NAV.filter((item) => !item.adminOnly || user.role === "admin");

  return (
    <aside className="sidebar">
      <div className="brand">
        <Usb size={16} color="#14b8a6" />
        <span className="brand-name">PORTUS</span>
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
      <div className="user">
        <div className="name">{user.username}</div>
        <button onClick={onLogout}>Sair</button>
      </div>
    </aside>
  );
}
