# Sugestões de Melhorias — PORTUS
> Evitar possíveis erros e aumentar robustez do aplicativo

---

## 1. 🔒 Segurança

### 1.1 Validação de Entrada em IPC
**Risco**: XSS, SQL Injection, Buffer Overflow  
**Status**: ⚠️ Parcial

- [ ] **Adicionar schema de validação** para todos os IPC handlers (usar `zod` ou `io-ts`)
  ```typescript
  // Exemplo
  const createBatchSchema = z.object({
    productId: z.number().positive(),
    code: z.string().min(1).max(50),
    timeoutSeconds: z.number().min(5).max(600)
  });
  ```

- [ ] **Sanitizar regex** antes de compilar (pode causar ReDoS)
  ```typescript
  try {
    new RegExp(userProvidedRegex);
  } catch (e) {
    throw new Error("Regex inválida");
  }
  ```

- [ ] **Limitar tamanho de payload** em IPC (preload)
  - Máximo de linhas em CSV: 100.000
  - Máximo de caracteres por leitura: 1.000

### 1.2 Controle de Acesso
**Risco**: Operator executando ações de admin  
**Status**: ✅ Testes criados, ⚠️ Implementação pendente

- [ ] **Validar permissão em CADA handler IPC** (não confiar só em UI)
  ```typescript
  const user = getSessionUser();
  if (user.role !== "admin") {
    throw new Error("Unauthorized");
  }
  ```

- [ ] **Criar middleware de autenticação** reutilizável
  ```typescript
  function requireAdmin(handler: IPCHandler): IPCHandler {
    return (event, ...args) => {
      if (!isAdmin(event.sender)) throw new Error("Unauthorized");
      return handler(event, ...args);
    };
  }
  ```

### 1.3 Hash de Senha
**Status**: ✅ Usando bcryptjs

- [ ] **Validar comprimento mínimo**: 8 caracteres
- [ ] **Rate limiting** em login: máx 5 tentativas em 15 minutos
- [ ] **Expiração de sessão**: 2 horas inatividade (logout automático)

### 1.4 Auditoria
**Risco**: Sem histórico de quem fez o quê  
**Status**: ⚠️ Leituras gravadas, ações de usuário não

- [ ] **Criar tabela `audit_log`**:
  ```sql
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,      -- 'close_batch', 'delete_user', etc
    resource_type TEXT,         -- 'batch', 'user', 'equipment'
    resource_id INTEGER,
    changes TEXT,               -- JSON das mudanças
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );
  ```

- [ ] **Registrar**:
  - Logout, Login (sucesso/falha)
  - Fechar lote, Abrir lote
  - Deletar usuário, Alterar permissão
  - Editar configuração de equipamento

---

## 2. 🛡️ Robustez de Porta Serial

### 2.1 Tratamento de Falhas
**Risco**: Uma porta falha → sessão inteira cai  
**Status**: ✅ Tolerância parcial, ⚠️ Recovery pendente

- [ ] **Retry automático** ao abrir porta (3 tentativas com backoff)
  ```typescript
  async function openPortWithRetry(path: string, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return openPort(path);
      } catch (e) {
        if (i < maxRetries - 1) {
          await sleep(100 * Math.pow(2, i)); // backoff exponencial
        } else throw e;
      }
    }
  }
  ```

- [ ] **Fallback para porta reserva** (COM6) se uma das 5 falhar
  - Marcar slot como vermelho (UI)
  - Desabilitar equipamento automaticamente

- [ ] **Detectar desconexão de porta** durante captura
  - Evento 'error' da SerialPort
  - Fechar gracefully, registrar tentativa de reconnect

### 2.2 Buffer e Overflow
**Risco**: Equipamento envia dados muito rápido → perda de dados  
**Status**: ⚠️ Buffer local, sem limite configurável

- [ ] **Limitar buffer em memória** por porta: máx 100KB
  ```typescript
  if (this.buffer.length > MAX_BUFFER_SIZE) {
    this.buffer = this.buffer.slice(-50000); // drop oldest
  }
  ```

- [ ] **Heartbeat/keep-alive** em sessão longa
  - Enviar ping a cada 30s
  - Detectar porto morta

### 2.3 Sincronização de Linhas
**Risco**: Linha parcial ao timeout → valor corrompido  
**Status**: ✅ Flush implementado

- [ ] **Adicionar checksum/CRC** à leitura (opcional por equipamento)
  ```typescript
  // Se equipamento envia: "123.45\n" com checksum "AB12"
  // Validar antes de gravar
  ```

- [ ] **Log de erros de parsing** com stacktrace
  - Quando regex não faz match, gravar a string original + regex usada

### 2.4 Timeout Configurável
**Status**: ✅ Campo existe

- [ ] **Validar range**: 5–600 segundos (não deixar 0 ou muito grande)
- [ ] **UI mostra countdown visual** com risco de timeout próximo
- [ ] **Aviso sonoro** 10s antes de expirar

---

## 3. 📊 Banco de Dados

### 3.1 Integridade Referencial
**Risco**: Orfandade de dados (leitura sem batch, batch sem produto)  
**Status**: ⚠️ Sem FOREIGN KEY

- [ ] **Habilitar FOREIGN KEY no SQLite**:
  ```typescript
  db.pragma('foreign_keys = ON');
  ```

- [ ] **Definir cascata apropriada**:
  - Deletar produto → deletar batches associados
  - Deletar batch → deletar capture_sessions e readings associadas

### 3.2 Transações
**Risco**: Corrupção se app crashear no meio de operação  
**Status**: ⚠️ Não há transações explícitas

- [ ] **Envolver operações críticas em transações**:
  ```typescript
  function closeBatch(batchId: number) {
    return db.transaction(() => {
      db.exec("UPDATE batches SET status='closed' WHERE id=?", [batchId]);
      db.exec("INSERT INTO audit_log ...", [userId, 'close_batch', batchId]);
    })();
  }
  ```

- [ ] **Rollback em erro**: se uma query falhar, desfazer todas

### 3.3 Backup
**Risco**: Perda total de dados se DB corromper  
**Status**: ❌ Não existe

- [ ] **Backup automático diário** (meia-noite)
  - Copiar `userData/serial-reader.db` → `userData/backups/serial-reader-YYYY-MM-DD.db`
  - Manter últimos 7 dias

- [ ] **Endpoint para backup manual** (Settings → Aba Backup)

- [ ] **Detectar corrupção**:
  ```typescript
  try {
    db.exec("PRAGMA integrity_check");
  } catch (e) {
    // Restaurar from backup
  }
  ```

### 3.4 Migrations Seguras
**Status**: ✅ Sistema inline

- [ ] **Adicionar versionamento explícito**:
  ```sql
  CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT
  );
  ```

- [ ] **Validar antes de migrar**: se versão > esperado, abortar
- [ ] **Log de cada migration**

---

## 4. ⚠️ Tratamento de Erros

### 4.1 IPC Error Handling
**Risco**: Erro não comunicado ao renderer → UI congelada  
**Status**: ⚠️ Parcial

- [ ] **Pattern consistente de resposta**:
  ```typescript
  type IPCResponse<T> = 
    | { ok: true; data: T }
    | { ok: false; error: string; code?: string };
  ```

- [ ] **Nunca lançar erro diretamente**, sempre retornar `{ ok: false }`
- [ ] **Timeout em IPC**: se handler demorar >10s, abortar

### 4.2 Logging
**Status**: ⚠️ console.log apenas

- [ ] **Implementar logger com níveis** (error, warn, info, debug)
  ```typescript
  logger.error("Porta COM1 falhou ao abrir", { port: 'COM1', error });
  logger.info("Lote 42 fechado por usuário 5");
  ```

- [ ] **Persistir logs** em arquivo:
  - `userData/logs/serial-reader-YYYY-MM-DD.log`
  - Rotacionar: manter últimos 30 dias
  - Zipá-los automaticamente

- [ ] **UI para visualizar logs** (Settings → Aba Logs)

### 4.3 Error Boundaries (React)
**Status**: ❌ Não existe

- [ ] **Envolver telas em Error Boundary**:
  ```typescript
  <ErrorBoundary fallback={<ErrorScreen />}>
    <Dashboard />
  </ErrorBoundary>
  ```

- [ ] **Capturar erros de IPC no renderer**:
  ```typescript
  try {
    await api.closeBatch(id);
  } catch (e) {
    showError(`Falha ao fechar lote: ${e.message}`);
  }
  ```

---

## 5. 🧪 Validações

### 5.1 Entrada do Usuário
**Risco**: Valores inválidos causam crash  
**Status**: ⚠️ Algumas existem

- [ ] **Modal de Novo Lote**:
  - Código: 1-50 caracteres, alfanumérico + hífem
  - Validar caracteres especiais

- [ ] **Configurações**:
  - Timeout: 5-600 (validar range)
  - Baud rate: apenas valores conhecidos (9600, 19200, 38400, ...)
  - Data bits: 5-8
  - Stop bits: 1-2

- [ ] **Regex**: compilar antes de salvar

### 5.2 Estado da Aplicação
**Risco**: Estados inconsistentes (ex: 2 capturas simultâneas)  
**Status**: ⚠️ Parcial

- [ ] **Garantir atomicidade**: apenas 1 captura por vez
  ```typescript
  if (isCaptureActive()) {
    throw new Error("Captura já ativa. Cancele ou aguarde.");
  }
  ```

- [ ] **Validar transição de estado**:
  - Não pode fechar batch se há captura ativa
  - Não pode deletar equipamento se está capturando

### 5.3 Limites
**Status**: ⚠️ Alguns existem

- [ ] **6 lotes abertos**: ✅ Existe
- [ ] **Máximo de usuários**: limite (ex: 50)?
- [ ] **Máximo de leituras por lote**: (ex: 10.000)?
- [ ] **Máximo de equipamentos**: 6 (hardcoded) ✅

---

## 6. 🎯 Performance

### 6.1 Query Optimization
**Risco**: Dashboard lento com 1000+ leituras  
**Status**: ⚠️ Sem índices

- [ ] **Adicionar índices**:
  ```sql
  CREATE INDEX idx_readings_batch ON readings(batch_id);
  CREATE INDEX idx_readings_equipment ON readings(equipment_id);
  CREATE INDEX idx_readings_timestamp ON readings(captured_at);
  CREATE INDEX idx_batches_status ON batches(status);
  ```

- [ ] **Paginar histórico**: máximo 50 leituras por página
- [ ] **Lazy load**: não carregar 10.000 linhas de uma vez

### 6.2 Render Performance
**Status**: ⚠️ Sem otimização

- [ ] **Memoizar componentes** que mostram grid de lotes
  ```typescript
  export const BatchCard = memo(({ batch }) => ...);
  ```

- [ ] **Virtualizar lista de leituras** (se >500 linhas)
  ```typescript
  <FixedSizeList height={600} itemCount={readings.length}>
    {renderRow}
  </FixedSizeList>
  ```

### 6.3 Debounce/Throttle
**Status**: ⚠️ Sem validação

- [ ] **Debounce em regex input**: aguardar 500ms antes de validar
- [ ] **Throttle em tick do countdown**: não atualizar a cada ms

---

## 7. 🔄 Recuperação e Resilência

### 7.1 Crash Recovery
**Risco**: Captura ativa → app crasha → sessão perdida  
**Status**: ❌ Sem recovery

- [ ] **Gravar estado de captura em arquivo**:
  ```typescript
  // Ao iniciar captura, salvar em userData/current_capture.json
  {
    batchId: 42,
    sessionId: 99,
    startedAt: "2026-01-01T08:30:00Z",
    timeoutSeconds: 30
  }
  ```

- [ ] **Ao iniciar app, verificar se há sessão pendente**
  - Se sim, oferecer opção de continuar ou cancelar

### 7.2 Port Recovery
**Status**: ⚠️ Tolera erro, não recupera

- [ ] **Detectar reconnect de porta**:
  - Se usuário reconectar equipamento, notificar
  - Oferecer retomar captura

- [ ] **Verificação periódica** de ports disponíveis:
  - A cada 5s, chamar `SerialPort.list()`
  - Se porta que estava desabilitada reaparece, oferecer re-habilitar

---

## 8. 🚀 UX/UI

### 8.1 Feedback Visual
**Status**: ⚠️ Mínimo

- [ ] **Toast notifications** para:
  - Sucesso: "Lote 42 fechado ✓"
  - Erro: "Erro ao fechar lote: XYZ"
  - Aviso: "Captura expirando em 10s"

- [ ] **Skeleton loaders** ao carregar dados
- [ ] **Disabled state** em botões durante operação

### 8.2 Confirmações
**Status**: ⚠️ Algumas existem

- [ ] **Ações críticas**:
  - Fechar lote (não pode ser desfeito)
  - Deletar usuário (confirmar senha)
  - Deletar todas as leituras de um lote

- [ ] **Padrão**: modal com title, description, 2 botões

### 8.3 Mensagens de Erro
**Status**: ⚠️ Genéricas

- [ ] **Mensagens claras, em português**:
  - ❌ "Erro na operação"
  - ✅ "Não foi possível fechar o lote. A captura está ativa. Cancele a captura e tente novamente."

- [ ] **Sugerir ação corretiva**

### 8.4 Acessibilidade
**Status**: ⚠️ Mínima

- [ ] **ARIA labels** nos botões
- [ ] **Tab order** correto
- [ ] **Contrast ratio** válido (WCAG AA)

---

## 9. 📱 Multi-usuário Local

### 9.1 Concorrência
**Risco**: 2 admin abrem o app ao mesmo tempo → conflito de DB  
**Status**: ⚠️ SQLite não suporta multi-conexão bem

- [ ] **Detectar segundo processo** ao iniciar
  ```typescript
  const lockFile = join(userData, '.lock');
  if (fs.existsSync(lockFile)) {
    showError("Aplicativo já está aberto em outro processo");
    app.quit();
  }
  ```

- [ ] **WAL mode** no SQLite (Write-Ahead Logging):
  ```typescript
  db.pragma('journal_mode = WAL');
  ```

### 9.2 Sessão por Janela
**Status**: ✅ Uma janela, uma sessão

- [ ] Impedir abrir múltiplas janelas (não permite atualmente)

---

## 10. 📋 Checklist de Implantação

- [ ] Adicionar testes E2E (Playwright)
- [ ] Code review antes de cada commit
- [ ] CHANGELOG.md documentando breaking changes
- [ ] Documentação de API no README
- [ ] Teste com equipamentos reais
- [ ] Performance test: 10.000+ leituras
- [ ] Teste de stress: abrir/fechar 100 lotes em seguida
- [ ] Verificar tamanho do bundle (target: <50MB)
- [ ] Testes de update automático
- [ ] Manual de operação para usuário final

---

## 📊 Priorização

### 🔴 CRÍTICO (P0 — fazer antes de lançar)
1. Validação de entrada em IPC (segurança)
2. Controle de acesso em cada handler (permissões)
3. Foreign keys no banco (integridade)
4. Transações em operações críticas
5. Retry/fallback em porta serial

### 🟠 ALTO (P1 — próximas sprints)
1. Backup automático
2. Logging persistente
3. Error Boundary no React
4. Rate limiting em login
5. Detecção de corrupção de banco

### 🟡 MÉDIO (P2 — nice to have)
1. Auditoria completa
2. Indexação de banco
3. Virtualização de listas
4. Toast notifications
5. Acessibilidade

### 🟢 BAIXO (P3 — quando tiver tempo)
1. Modo escuro
2. Relatório PDF
3. Integração com leitor de código de barras
4. Auto-update

---

## 📝 Exemplos de Implementação

### Exemplo 1: Validação com Zod
```typescript
import { z } from "zod";

const CloseBatchSchema = z.object({
  batchId: z.number().positive("Batch ID deve ser positivo")
});

ipcMain.handle("batches:close", async (event, input: unknown) => {
  try {
    const { batchId } = CloseBatchSchema.parse(input);
    const user = getSessionUser(event);
    if (!user || user.role !== "admin") throw new Error("Unauthorized");
    return { ok: true, data: closeBatch(batchId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
```

### Exemplo 2: Retry com Backoff
```typescript
async function openPortWithRetry(
  path: string,
  options: SerialPortOptions,
  maxRetries = 3
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const port = new SerialPort({ ...options, path });
      await new Promise((resolve, reject) => {
        port.open((err) => (err ? reject(err) : resolve(null)));
      });
      return port;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        await sleep(100 * Math.pow(2, attempt));
      } else {
        throw error;
      }
    }
  }
}
```

### Exemplo 3: Transação no SQLite
```typescript
function closeBatch(batchId: number, userId: number) {
  return db.transaction(() => {
    db.exec(
      "UPDATE batches SET status = ?, closed_at = ? WHERE id = ?",
      ["closed", new Date().toISOString(), batchId]
    );
    
    db.exec(
      "INSERT INTO audit_log (user_id, action, resource_type, resource_id) VALUES (?, ?, ?, ?)",
      [userId, "close_batch", "batch", batchId]
    );
  })();
}
```

---

**Data**: 2026-06-09  
**Versão**: 1.0  
**Prioridade**: Implementar P0 antes da Fase 7 (Empacotamento)
