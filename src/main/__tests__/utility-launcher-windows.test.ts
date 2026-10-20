import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";

const state = vi.hoisted(() => ({
  child: null as ChildProcess | null,
  closed: null as Promise<number | null> | null
}));

vi.mock("electron", () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() }
}));

vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    // Only add automatic UI closure; keep the production host, argv and spawn
    // options so the real Windows startup path is exercised.
    spawn: (command: string, args: string[], options: Parameters<typeof actual.spawn>[2]) => {
      const child = actual.spawn(command, [...args, "-SmokeTest"], options);
      state.child = child;
      state.closed = new Promise(resolve => child.once("close", code => resolve(code)));
      return child;
    }
  };
});

import { launchPortusDbUtility } from "../utility-launcher";

describe.skipIf(process.platform !== "win32")("DB Utility pelo launcher real Windows", () => {
  afterEach(() => {
    if (state.child && state.child.exitCode === null) state.child.kill();
  });

  it("confirma a janela WinForms e encerra o smoke test sem acessar o banco", async () => {
    await expect(launchPortusDbUtility()).resolves.toBeUndefined();
    expect(await state.closed).toBe(0);
  }, 40_000);
});
