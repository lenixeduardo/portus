import React, { useState, useEffect, useRef } from "react";
import type { User } from "../../shared/types";
import { PortusLogo } from "../components/PortusLogo";
import { APP_VERSION } from "../releaseNotes";

interface Props {
  onAuthenticated: (user: User) => void;
}

function isAuthenticatedUser(value: unknown): value is User {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<User>;
  return Number.isInteger(user.id)
    && typeof user.username === "string"
    && (user.role === "admin" || user.role === "operator")
    && typeof user.createdAt === "string";
}

function reportLoginError(error: unknown): void {
  const api = window.api as Partial<typeof window.api> | undefined;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  void api?.log?.error("renderer:login", message, stack).catch(() => {});
}

export function Login({ onAuthenticated }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activePort, setActivePort] = useState(0);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivePort((prev) => (prev + 1) % 4);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await window.api.auth.login({ username, password });
      if (result.ok) {
        if (!isAuthenticatedUser(result.user)) {
          throw new Error("A autenticação retornou um usuário inválido.");
        }
        onAuthenticated(result.user);
      } else {
        setError(result.error);
      }
    } catch (err) {
      reportLoginError(err);
      setError("Não foi possível concluir o login. Tente novamente ou reporte o erro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-split">
        <div className="login-left">
          <div className="login-brand">
            <PortusLogo variant="login" />
            <p className="login-subtitle mono">INDUSTRIAL CAPTURE INTERFACE</p>
          </div>

          <div className="login-port-grid">
            {[3, 4, 5, 6].map((port, i) => (
              <div key={port} className={`login-port-slot ${activePort === i ? "active" : ""}`}>
                <div className="login-port-header">
                  <span className="mono">COM{port}</span>
                  <span className={`led-dot ${activePort === i ? "receiving" : "idle"}`} />
                </div>
                <div className={`mono login-port-status ${activePort === i ? "active" : ""}`}>
                  {activePort === i ? "ESTABLISHED" : "READY"}
                </div>
              </div>
            ))}
          </div>

          <div className="login-version mono">v{APP_VERSION} · Electron · © 2026</div>
        </div>

        <div className="login-right">
          <h3 className="login-form-title">Login Operador</h3>
          <form onSubmit={submit}>
            <div className="field">
              <label>Identificação</label>
              <input
                ref={usernameRef}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="USER_ID"
                autoComplete="username"
                className="mono"
              />
            </div>
            <div className="field">
              <label>Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="mono"
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", marginTop: 8, padding: "14px" }}>
              {loading ? "Autenticando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
