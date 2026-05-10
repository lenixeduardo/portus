import React from "react";
import type { User } from "../../shared/types";

export type Route = "dashboard" | "recipes" | "history" | "settings";

interface Props {
  user: User;
  current: Route;
  onNavigate: (r: Route) => void;
  onLogout: () => void;
}

const NAV: Array<{ key: Route; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "recipes", label: "Receitas" },
  { key: "history", label: "Histórico" },
  { key: "settings", label: "Configurações" }
];

export function Sidebar({ user, current, onNavigate, onLogout }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">Serial Reader</div>
      <nav>
        {NAV.map((item) => (
          <a
            key={item.key}
            href="#"
            className={current === item.key ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(item.key);
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className="user">
        <div className="name">{user.username}</div>
        <button onClick={onLogout}>Sair</button>
      </div>
    </aside>
  );
}
