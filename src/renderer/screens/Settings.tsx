import React, { useState } from "react";
import { CaptureSettingsTab } from "./settings/CaptureSettingsTab";
import { EquipmentsTab } from "./settings/EquipmentsTab";
import { UsersTab } from "./settings/UsersTab";

type Tab = "capture" | "equipments" | "users";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "capture", label: "Captura" },
  { key: "equipments", label: "Equipamentos" },
  { key: "users", label: "Usuários" }
];

interface Props {
  currentUserId: number;
}

export function Settings({ currentUserId }: Props) {
  const [tab, setTab] = useState<Tab>("capture");

  return (
    <div>
      <div className="tabs">
        {TABS.map((t) => (
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
        {tab === "users" && <UsersTab currentUserId={currentUserId} />}
      </div>
    </div>
  );
}
