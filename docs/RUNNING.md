# Como Executar o PORTUS — Guia Completo

## IMPORTANTE: O PORTUS DEVE ser aberto pelo Electron, não pelo browser!

---

## 1️⃣ Primeira Vez (Setup)

```bash
npm install
npm run rebuild  # Recompila serialport + better-sqlite3 para Electron
```

---

## 2️⃣ Executar em Desenvolvimento (Com Hot Reload)

```bash
npm run dev
```

Isso:
1. Compila TypeScript (main) em watch mode
2. Inicia servidor Vite em `http://localhost:5173`
3. Abre Electron apontando para o servidor Vite
4. Abre DevTools automaticamente

> ✅ Usa hot-reload para alterações em React/TypeScript

---

## 3️⃣ Executar o Electron Diretamente (Sem Servidor Vite)

```bash
npm run build       # Compila tudo
npm run electron    # Abre Electron apontando para HTML estático
```

> ⚠️ Precisa compilar novamente a cada mudança no código

---

## 4️⃣ Executar em Produção

```bash
npm run build       # Compila
npm run start       # Abre Electron com bundle pronto
```

---

## ⚠️ Problemas Comuns

### "Electron tenta abrir no browser"

**Checklist:**

1. ✅ Variável `ELECTRON_DEV=1` está sendo passada?
   ```bash
   echo $ELECTRON_DEV  # Deve estar vazio em produção, "1" em dev
   ```

2. ✅ Verificar logs de startup:
   ```bash
   npm run electron 2>&1 | grep "\[main\]"
   ```
   Deve aparecer:
   ```
   [main] startup: { ELECTRON_DEV: '1', ... isDev: true }
   [main] loading dev URL: http://localhost:5173
   ```

3. ✅ Se `isDev: false`, o Electron tenta carregar `renderer/index.html`
   - Precisa rodar `npm run build:renderer` antes

4. ✅ Verificar se o servidor Vite está rodando (porta 5173)
   ```bash
   curl http://localhost:5173
   ```

### Erro: "Failed to load HTML"

```bash
npm run build:renderer  # Garante que index.html está em dist/
npm run electron        # Tenta carregar novamente
```

### Port 5173 já está em uso

```bash
# Linux/Mac
lsof -i :5173
kill -9 <PID>

# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

---

## 🔍 Debug

### Ver logs detalhados de startup:

```bash
DEBUG=* npm run dev
```

### Ver comunicação IPC:

Procurar por `[ipc]` nos logs

### Ver queries do SQLite:

Procurar por `[db]` nos logs

---

## 📋 Fluxo Recomendado

```bash
# Desenvolvimento ativo
npm run dev

# Testar build de produção
npm run build
npm run start

# Gerar instalador Windows
npm run package
```

---

**⚠️ IMPORTANTE**: Nunca execute `npm start` ou `npm run start` sem rodar `npm run build` antes!
