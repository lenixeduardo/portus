import React, { useState } from "react";
import type { User } from "../../shared/types";
import { CaptureSettingsTab } from "./settings/CaptureSettingsTab";
import { EquipmentsTab } from "./settings/EquipmentsTab";
import { UsersTab } from "./settings/UsersTab";

type Tab = "capture" | "equipments" | "users";

interface Props {
  currentUser: User;
}

export function Settings({ currentUser }: Props) {
  const [tab, setTab] = useState<Tab>("capture");

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "capture", label: "Captura" },
    { key: "equipments", label: "Equipamentos" },
    ...(currentUser.role === "admin" ? [{ key: "users" as Tab, label: "Usuários" }] : []),
  ];

  return (
    <div>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {tab === "capture" && <CaptureSettingsTab />}
        {tab === "equipments" && <EquipmentsTab />}
        {tab === "users" && currentUser.role === "admin" && <UsersTab currentUserId={currentUser.id} />}
      </div>
    </div>
  );
}
