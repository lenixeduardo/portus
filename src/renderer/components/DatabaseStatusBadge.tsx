import React from 'react';
import { Database, RefreshCw } from 'lucide-react';
import type { User } from '../../shared/types';

export type DatabaseStatus = 'checking' | 'connected' | 'disconnected' | 'unconfigured';
const LABELS: Record<DatabaseStatus, string> = {
  checking: 'Verificando', connected: 'Conectado',
  disconnected: 'Desconectado', unconfigured: 'Não configurado'
};

export function DatabaseStatusBadge({ status, user }: {
  status: DatabaseStatus;
  user: Pick<User, 'username' | 'displayName'>;
}) {
  const identity = user.displayName?.trim() && user.displayName !== user.username
    ? `${user.displayName.trim()} (${user.username})` : user.username;
  return (
    <div className={`database-status database-status--${status}`} role="status"
      aria-live="polite" title={`PostgreSQL central · Usuário conectado: ${identity}`}>
      {status === 'checking' ? <RefreshCw size={13} className="database-status__spinner" /> : <Database size={13} />}
      <span className="database-status__dot" aria-hidden="true" />
      <span><small>Banco de dados</small>{LABELS[status]} · {identity}</span>
    </div>
  );
}
