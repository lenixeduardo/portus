import React from "react";
import { LayoutDashboard, FlaskConical, Clock, Settings, Usb } from "lucide-react";
import type { User } from "../../shared/types";

export type Route = "dashboard" | "formulas" | "history" | "settings";

interface Props {
  user: User;
  current: Route;
  onNavigate: (r: Route) => void;
  onLogout: () => void;
}

const NAV: Array<{ key: Route; label: string; icon: React.ElementType }> = [
  { key: "dashboard", label: "Lotes Ativos", icon: LayoutDashboard },
  { key: "formulas", label: "Fórmulas", icon: FlaskConical },
  { key: "history", label: "Histórico", icon: Clock },
  { key: "settings", label: "Configurações", icon: Settings },
];

export function Sidebar({ user, current, onNavigate, onLogout }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Usb size={16} color="#14b8a6" />
        <span className="brand-name">PORTUS</span>
      </div>
      <nav>
        {NAV.map((item) => {
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
      <div className="user">
        <div className="name">{user.username}</div>
        <button onClick={onLogout}>Sair</button>
      </div>
    </aside>
  );
}
