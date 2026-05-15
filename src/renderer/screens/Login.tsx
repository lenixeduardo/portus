import React, { useState, useEffect } from "react";
import type { User } from "../../shared/types";

interface Props {
  onAuthenticated: (user: User) => void;
}

export function Login({ onAuthenticated }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activePort, setActivePort] = useState(0);

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
        onAuthenticated(result.user);
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-split">
        <div className="login-left">
          <div className="login-brand">
            <div className="login-logo-mark">
              <svg width="60" height="40" viewBox="0 0 60 40" fill="none">
                <rect x="1" y="1" width="58" height="38" stroke="#14b8a6" strokeWidth="1.5" />
                <rect x="8" y="8" width="2" height="24" fill="#14b8a6" />
                <rect x="14" y="8" width="4" height="24" fill="#14b8a6" />
                <rect x="22" y="8" width="1" height="24" fill="#14b8a6" />
                <rect x="27" y="8" width="6" height="24" fill="#14b8a6" />
                <rect x="37" y="8" width="2" height="24" fill="#14b8a6" />
                <rect x="43" y="8" width="3" height="24" fill="#14b8a6" />
                <rect x="50" y="8" width="2" height="24" fill="#14b8a6" />
              </svg>
            </div>
            <h1 className="login-title">PORTUS</h1>
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

          <div className="login-version mono">v1.0.0 · Electron · © 2026</div>
        </div>

        <div className="login-right">
          <h3 className="login-form-title">Login Operador</h3>
          <form onSubmit={submit}>
            <div className="field">
              <label>Identificação</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="USER_ID"
                autoFocus
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
