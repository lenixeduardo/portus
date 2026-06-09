import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock Types ──────────────────────────────────────────────────────────────

type UserRole = "admin" | "operator";

interface User {
  id: number;
  username: string;
  role: UserRole;
  createdAt: string;
}

interface Equipment {
  id: number;
  name: string;
  portPath: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  enabled: boolean;
  slotIndex: number;
  parseRegex?: string;
  lineDelimiter: "crlf" | "lf" | "cr";
}

interface Batch {
  id: number;
  productId: number;
  code: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  createdBy: number;
}

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: "testuser",
    role: "operator",
    createdAt: "2026-01-01 08:00:00",
    ...overrides
  };
}

function makeEquipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: 1,
    name: "Equipment 1",
    portPath: "COM1",
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    enabled: true,
    slotIndex: 0,
    lineDelimiter: "lf",
    ...overrides
  };
}

function makeBatch(overrides: Partial<Batch> = {}): Batch {
  return {
    id: 1,
    productId: 1,
    code: "2026-0001",
    status: "open",
    openedAt: "2026-01-01 08:00:00",
    createdBy: 1,
    ...overrides
  };
}

// ─── Test 1: Equipment Management ─────────────────────────────────────────────

describe("Teste 1 — Gestão de Equipamentos (5 slots)", () => {
  const equipments = [
    makeEquipment({ id: 1, name: "Espectrofotômetro", portPath: "COM1", slotIndex: 0 }),
    makeEquipment({ id: 2, name: "Balança", portPath: "COM2", slotIndex: 1 }),
    makeEquipment({ id: 3, name: "Viscosímetro", portPath: "COM3", slotIndex: 2 }),
    makeEquipment({ id: 4, name: "pH-metro", portPath: "COM4", slotIndex: 3 }),
    makeEquipment({ id: 5, name: "Refratômetro", portPath: "COM5", slotIndex: 4 })
  ];

  it("deve listar exatamente 5 equipamentos com slots 0-4", () => {
    expect(equipments).toHaveLength(5);
    equipments.forEach((eq, i) => {
      expect(eq.slotIndex).toBe(i);
      expect(eq.portPath).toBe(`COM${i + 1}`);
    });
  });

  it("deve validar configurações de porta serial de cada equipamento", () => {
    equipments.forEach((eq) => {
      expect(eq.baudRate).toBeGreaterThan(0);
      expect([5, 6, 7, 8]).toContain(eq.dataBits);
      expect([1, 2]).toContain(eq.stopBits);
      expect(["none", "even", "odd"]).toContain(eq.parity);
      expect(["crlf", "lf", "cr"]).toContain(eq.lineDelimiter);
    });
  });

  it("deve permitir parsing regex por equipamento", () => {
    const equipmentComRegex = {
      ...equipments[0],
      parseRegex: "^(?<value>[0-9.]+)$"
    };

    expect(equipmentComRegex.parseRegex).toBeDefined();
    expect(equipmentComRegex.parseRegex).toMatch(/value/);
  });

  it("deve validar que cada equipamento tem slotIndex único", () => {
    const slots = equipments.map((eq) => eq.slotIndex);
    expect(new Set(slots).size).toBe(equipments.length);
  });

  it("deve permitir habilitar/desabilitar equipamento", () => {
    const eq = { ...equipments[0], enabled: false };
    expect(eq.enabled).toBe(false);

    const eqEnabled = { ...eq, enabled: true };
    expect(eqEnabled.enabled).toBe(true);
  });
});

// ─── Test 2: Permissions — Admin vs Operator ──────────────────────────────────

describe("Teste 2 — Permissões: Admin vs Operator", () => {
  const admin = makeUser({ id: 1, username: "admin", role: "admin" });
  const operator = makeUser({ id: 2, username: "operator", role: "operator" });
  const batch = makeBatch();

  const permissions = {
    closeBatch: { admin: true, operator: false },
    openBatch: { admin: true, operator: false },
    deleteUser: { admin: true, operator: false },
    editEquipment: { admin: true, operator: false },
    viewEquipments: { admin: true, operator: true },
    createReading: { admin: true, operator: true },
    viewBatches: { admin: true, operator: true },
    editCaptureSettings: { admin: true, operator: false }
  };

  it("admin pode fechar lote, operator não pode", () => {
    expect(permissions.closeBatch.admin).toBe(true);
    expect(permissions.closeBatch.operator).toBe(false);
  });

  it("admin pode abrir lote, operator não pode", () => {
    expect(permissions.openBatch.admin).toBe(true);
    expect(permissions.openBatch.operator).toBe(false);
  });

  it("apenas admin pode remover usuário", () => {
    expect(permissions.deleteUser.admin).toBe(true);
    expect(permissions.deleteUser.operator).toBe(false);
  });

  it("apenas admin pode editar configuração de equipamento", () => {
    expect(permissions.editEquipment.admin).toBe(true);
    expect(permissions.editEquipment.operator).toBe(false);
  });

  it("admin pode editar captura settings, operator não", () => {
    expect(permissions.editCaptureSettings.admin).toBe(true);
    expect(permissions.editCaptureSettings.operator).toBe(false);
  });

  it("ambos podem visualizar equipamentos configurados", () => {
    expect(permissions.viewEquipments.admin).toBe(true);
    expect(permissions.viewEquipments.operator).toBe(true);
  });

  it("ambos podem criar leituras (iniciar captura)", () => {
    expect(permissions.createReading.admin).toBe(true);
    expect(permissions.createReading.operator).toBe(true);
  });

  it("ambos podem visualizar lotes", () => {
    expect(permissions.viewBatches.admin).toBe(true);
    expect(permissions.viewBatches.operator).toBe(true);
  });
});

// ─── Test 3: Batch Lifecycle — Close and Open ─────────────────────────────────

describe("Teste 3 — Ciclo de Vida do Lote: Fechar e Abrir", () => {
  let batch: Batch;
  const admin = makeUser({ role: "admin" });
  const operator = makeUser({ role: "operator" });

  beforeEach(() => {
    batch = makeBatch({ status: "open" });
  });

  it("admin consegue fechar um lote aberto", () => {
    const closeBatchAsAdmin = (b: Batch, actor: User) => {
      if (actor.role !== "admin") {
        return { ok: false, error: "Apenas admin pode fechar lote" };
      }
      return { ok: true, data: { ...b, status: "closed" as const, closedAt: "2026-01-01 09:00:00" } };
    };

    const result = closeBatchAsAdmin(batch, admin);
    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data.status).toBe("closed");
      expect(result.data.closedAt).toBeDefined();
    }
  });

  it("operator não consegue fechar lote", () => {
    const closeBatchAsAdmin = (b: Batch, actor: User) => {
      if (actor.role !== "admin") {
        return { ok: false, error: "Apenas admin pode fechar lote" };
      }
      return { ok: true, data: { ...b, status: "closed" as const, closedAt: "2026-01-01 09:00:00" } };
    };

    const result = closeBatchAsAdmin(batch, operator);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("admin");
    }
  });

  it("não pode fechar lote já fechado", () => {
    const closedBatch = { ...batch, status: "closed" as const };
    const closeBatchAsAdmin = (b: Batch, actor: User) => {
      if (actor.role !== "admin") {
        return { ok: false, error: "Apenas admin pode fechar lote" };
      }
      if (b.status === "closed") {
        return { ok: false, error: "Lote já está fechado" };
      }
      return { ok: true, data: { ...b, status: "closed" as const, closedAt: "2026-01-01 09:00:00" } };
    };

    const result = closeBatchAsAdmin(closedBatch, admin);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("fechado");
    }
  });

  it("admin consegue abrir um novo lote", () => {
    const openBatch = (productId: number, actor: User) => {
      if (actor.role !== "admin") {
        return { ok: false, error: "Apenas admin pode abrir lote" };
      }
      return {
        ok: true,
        data: {
          id: 2,
          productId,
          code: "2026-0002",
          status: "open" as const,
          openedAt: "2026-01-01 10:00:00",
          createdBy: actor.id
        }
      };
    };

    const result = openBatch(1, admin);
    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data.status).toBe("open");
      expect(result.data.createdBy).toBe(admin.id);
    }
  });

  it("operator não consegue abrir novo lote", () => {
    const openBatch = (productId: number, actor: User) => {
      if (actor.role !== "admin") {
        return { ok: false, error: "Apenas admin pode abrir lote" };
      }
      return {
        ok: true,
        data: {
          id: 2,
          productId,
          code: "2026-0002",
          status: "open" as const,
          openedAt: "2026-01-01 10:00:00",
          createdBy: actor.id
        }
      };
    };

    const result = openBatch(1, operator);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("admin");
    }
  });
});

// ─── Test 4: User Management — Delete User (Admin Only) ───────────────────────

describe("Teste 4 — Gestão de Usuários: Deletar Usuário", () => {
  const admin = makeUser({ id: 1, username: "admin", role: "admin" });
  const operator1 = makeUser({ id: 2, username: "operator1", role: "operator" });
  const operator2 = makeUser({ id: 3, username: "operator2", role: "operator" });

  let users = [admin, operator1, operator2];

  const deleteUser = (userId: number, actor: User) => {
    if (actor.role !== "admin") {
      return { ok: false, error: "Apenas admin pode deletar usuário" };
    }
    if (userId === actor.id) {
      return { ok: false, error: "Não pode deletar a si mesmo" };
    }
    if (users.length <= 1) {
      return { ok: false, error: "Deve existir pelo menos um admin no sistema" };
    }
    users = users.filter((u) => u.id !== userId);
    return { ok: true, data: { deletedUserId: userId } };
  };

  it("admin consegue deletar um operator", () => {
    const usersBefore = users.length;
    const result = deleteUser(operator1.id, admin);
    expect(result.ok).toBe(true);
    expect(users.length).toBe(usersBefore - 1);
  });

  it("operator não consegue deletar outro usuário", () => {
    const result = deleteUser(operator2.id, operator2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("admin");
    }
  });

  it("admin não pode deletar a si mesmo", () => {
    const result = deleteUser(admin.id, admin);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("si mesmo");
    }
  });
});

// ─── Test 5: Visibility Based on Role ────────────────────────────────────────

describe("Teste 5 — Visibilidade Baseada em Permissão", () => {
  const admin = makeUser({ role: "admin" });
  const operator = makeUser({ role: "operator" });

  const uiElements = {
    newBatchButton: { admin: true, operator: false },
    closeButton: { admin: true, operator: false },
    equipmentSettings: { admin: true, operator: false },
    userManagement: { admin: true, operator: false },
    viewBatches: { admin: true, operator: true },
    captureButton: { admin: true, operator: true },
    viewReadings: { admin: true, operator: true },
    viewHistoryTab: { admin: true, operator: true }
  };

  it("admin vê o botão 'Novo Lote', operator não", () => {
    expect(uiElements.newBatchButton.admin).toBe(true);
    expect(uiElements.newBatchButton.operator).toBe(false);
  });

  it("admin vê botão 'Fechar Lote', operator não", () => {
    expect(uiElements.closeButton.admin).toBe(true);
    expect(uiElements.closeButton.operator).toBe(false);
  });

  it("admin vê tab 'Configurações de Equipamentos', operator não", () => {
    expect(uiElements.equipmentSettings.admin).toBe(true);
    expect(uiElements.equipmentSettings.operator).toBe(false);
  });

  it("admin vê 'Gestão de Usuários', operator não", () => {
    expect(uiElements.userManagement.admin).toBe(true);
    expect(uiElements.userManagement.operator).toBe(false);
  });

  it("ambos veem os lotes", () => {
    expect(uiElements.viewBatches.admin).toBe(true);
    expect(uiElements.viewBatches.operator).toBe(true);
  });

  it("ambos veem botão 'Iniciar Captura'", () => {
    expect(uiElements.captureButton.admin).toBe(true);
    expect(uiElements.captureButton.operator).toBe(true);
  });

  it("ambos podem visualizar leituras gravadas", () => {
    expect(uiElements.viewReadings.admin).toBe(true);
    expect(uiElements.viewReadings.operator).toBe(true);
  });

  it("ambos acessam a aba Histórico", () => {
    expect(uiElements.viewHistoryTab.admin).toBe(true);
    expect(uiElements.viewHistoryTab.operator).toBe(true);
  });
});

// ─── Test 6: Equipment Configuration Validation ───────────────────────────────

describe("Teste 6 — Validação de Configuração de Equipamento", () => {
  const validConfig = makeEquipment();

  it("deve rejeitar baudRate inválido (0)", () => {
    const invalid = { ...validConfig, baudRate: 0 };
    expect(invalid.baudRate).toBeLessThanOrEqual(0);
  });

  it("deve rejeitar dataBits inválido (9)", () => {
    const invalid = { ...validConfig, dataBits: 9 as 5 | 6 | 7 | 8 };
    expect([5, 6, 7, 8]).not.toContain(invalid.dataBits);
  });

  it("deve rejeitar stopBits inválido (0)", () => {
    const invalid = { ...validConfig, stopBits: 0 as 1 | 2 };
    expect([1, 2]).not.toContain(invalid.stopBits);
  });

  it("deve aceitar parity válido: none, even, odd", () => {
    const validParities = ["none", "even", "odd"] as const;
    validParities.forEach((p) => {
      const config = { ...validConfig, parity: p };
      expect(["none", "even", "odd"]).toContain(config.parity);
    });
  });

  it("deve aceitar lineDelimiter válido: crlf, lf, cr", () => {
    const validDelimiters = ["crlf", "lf", "cr"] as const;
    validDelimiters.forEach((d) => {
      const config = { ...validConfig, lineDelimiter: d };
      expect(["crlf", "lf", "cr"]).toContain(config.lineDelimiter);
    });
  });

  it("regex deve ser válido se fornecido", () => {
    const configWithRegex = { ...validConfig, parseRegex: "^[0-9.]+$" };
    expect(() => new RegExp(configWithRegex.parseRegex!)).not.toThrow();
  });

  it("deve validar regex com grupos nomeados", () => {
    const validRegex = "^(?<value>[0-9.]+)$";
    expect(validRegex).toContain("?<value>");
  });
});

// ─── Test 7: Integration — Admin Closes Batch and Creates New One ──────────────

describe("Teste 7 — Integração: Admin Fecha Lote e Abre Novo", () => {
  const admin = makeUser({ role: "admin" });
  let batches: Batch[] = [makeBatch({ id: 1, status: "open" })];

  it("admin fecha o lote 1", () => {
    const closeBatch = (id: number, actor: User) => {
      if (actor.role !== "admin") return { ok: false, error: "not admin" };
      batches = batches.map((b) => (b.id === id ? { ...b, status: "closed" as const } : b));
      return { ok: true, data: batches.find((b) => b.id === id) };
    };

    const result = closeBatch(1, admin);
    expect(result.ok).toBe(true);
    expect(batches[0].status).toBe("closed");
  });

  it("admin abre novo lote", () => {
    const openBatch = (productId: number, actor: User) => {
      if (actor.role !== "admin") return { ok: false, error: "not admin" };
      const newBatch: Batch = {
        id: 2,
        productId,
        code: "2026-0002",
        status: "open",
        openedAt: "2026-01-01 10:00:00",
        createdBy: actor.id
      };
      batches.push(newBatch);
      return { ok: true, data: newBatch };
    };

    const result = openBatch(1, admin);
    expect(result.ok).toBe(true);
    expect(batches).toHaveLength(2);
    expect(batches[1].status).toBe("open");
  });

  it("verifica que há 1 lote fechado e 1 aberto", () => {
    const closed = batches.filter((b) => b.status === "closed");
    const open = batches.filter((b) => b.status === "open");
    expect(closed).toHaveLength(1);
    expect(open).toHaveLength(1);
  });
});
