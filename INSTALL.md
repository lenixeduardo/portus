# 📦 Guia de Instalação - Serial Reader

## Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js 18+** ([download](https://nodejs.org/))
- **npm 9+** (incluído com Node.js)
- **Git** (para clonar o repositório)
- **Windows 10+** (aplicação desktop)
- **Visual Studio Build Tools** ou **Visual Studio Community** ([instruções abaixo](#-instalar-visual-studio-build-tools-windows))

### Para desenvolvimento (opcional):
- **Visual Studio Code** (recomendado)
- **Git Bash** ou **PowerShell** (terminal)

---

## ⚙️ Instalar Visual Studio Build Tools (Windows)

A aplicação usa módulos nativos C++ que precisam ser compilados. Você tem **2 opções**:

### Opção A: Visual Studio Build Tools (recomendado, mais leve)

1. Baixe o instalador: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
2. Execute e selecione:
   - ✅ **"Desktop development with C++"**
   - ✅ Deixe as opções padrão selecionadas
3. Clique em "Install"
4. Aguarde a instalação (pode levar 5-10 minutos)
5. **Reinicie o computador**
6. Abra um **novo PowerShell** e tente novamente

### Opção B: Visual Studio Community (alternativa)

1. Baixe: https://visualstudio.microsoft.com/downloads/
2. Execute o instalador
3. Selecione **"Desktop development with C++"**
4. Instale
5. **Reinicie** e tente novamente

> ⚠️ **Importante:** Você DEVE reiniciar o computador após instalar o Visual Studio Build Tools!

---

## ✅ Verificar Instalação (Windows)

Abra **PowerShell** e execute:

```powershell
node -v
npm -v
```

Se ambos mostrarem versões, prossiga. Se receber erro, reinstale Node.js.

---

## 1️⃣ Clonar o Repositório

Abra o **PowerShell** ou **Git Bash** e execute:

```bash
git clone https://github.com/lenixeduardo/serial-reader.git
cd serial-reader
```

---

## 2️⃣ Instalar Dependências

```bash
npm install
```

Isso irá:
- ✅ Instalar todas as dependências do `package.json`
- ✅ Instalar ferramentas de desenvolvimento
- ⚠️ Pode levar **2-3 minutos** na primeira vez

### ⚙️ Se houver avisos de vulnerabilidades:

```bash
npm audit fix
```

---

## 3️⃣ Recompilar Módulos Nativos (Importante!)

A aplicação usa módulos nativos (`better-sqlite3` e `serialport`) que precisam ser recompilados para Electron:

```bash
npm run rebuild
```

Isso garante que as bibliotecas de porta serial funcionem corretamente.

---

## 4️⃣ Iniciar em Modo Desenvolvimento

### Terminal 1: Compilar código (TypeScript)

```bash
npm run dev
```

Você verá:
```
[MAIN] 15:45:30 - Starting compilation in watch mode...
[RENDERER] VITE v5.4.8 - starting dev server...
```

**Deixe este terminal rodando!**

### Terminal 2 (depois que Terminal 1 estiver pronto): Abrir Electron

Aguarde **10-15 segundos** para que a compilação termine, depois:

```bash
npm start
```

Você verá a **janela da aplicação Electron** abrir com a tela de **Login**.

---

## 🔐 Tela de Login

Quando a aplicação abrir, você verá uma tela elegante e centralizada:

```
┌─────────────────────────────────────────────────────────┐
│                                                           │
│                                                           │
│              ╔═══════════════════════════╗              │
│              ║                           ║              │
│              ║    Serial Reader          ║              │
│              ║                           ║              │
│              ║  Acesse com suas          ║              │
│              ║  credenciais              ║              │
│              ║                           ║              │
│              ║  Usuário                  ║              │
│              ║  ┌─────────────────────┐  ║              │
│              ║  │  _________________  │  ║              │
│              ║  └─────────────────────┘  ║              │
│              ║                           ║              │
│              ║  Senha                    ║              │
│              ║  ┌─────────────────────┐  ║              │
│              ║  │  •••••••••••••••••  │  ║              │
│              ║  └─────────────────────┘  ║              │
│              ║                           ║              │
│              ║  ┌─────────────────────┐  ║              │
│              ║  │     ENTRAR          │  ║              │
│              ║  └─────────────────────┘  ║              │
│              ║                           ║              │
│              ╚═══════════════════════════╝              │
│                                                           │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 🎨 Detalhes visuais:
- **Card centralizado** com sombra suave (360px de largura)
- **Título** em azul escuro (#1E3A8A)
- **Subtítulo** em cinza claro
- **Campos de entrada** com borda leve, foco em azul
- **Botão** azul com hover mais escuro
- **Fundo cinzento claro** para contraste

### 🔑 Credenciais padrão (seed inicial):
- **Usuário:** `admin`
- **Senha:** `admin`

> ⚠️ **Importante:** Altere a senha após o primeiro login!

---

## 📊 Tela Principal (Dashboard)

Após login, você verá:

- **Sidebar esquerda** com menu de navegação
- **Grid de até 6 lotes abertos** (principal)
- **Botões no topo:** "Nova Fórmula" e "Novo Lote"
- **Tema:** Claro com barra lateral escura, cores azul (#1E3A8A) e verde (#10B981)

---

## 🛠️ Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Modo desenvolvimento (TypeScript watch + Vite) |
| `npm start` | Abre a janela Electron |
| `npm run build` | Build para produção |
| `npm run typecheck` | Verifica tipos TypeScript sem compilar |
| `npm run package` | Gera instalador Windows (NSIS) |
| `npm run rebuild` | Recompila módulos nativos para Electron |
| `npm run sim` | Inicia simulador de porta serial (desenvolvimento) |

---

## 🔧 Troubleshooting

### ❌ Erro: "Could not find any Visual Studio installation" (Windows)

**Problema:** Módulos nativos não conseguem compilar sem C++ tools.

**Solução:**
1. Instale **Visual Studio Build Tools** ([ver instruções acima](#-instalar-visual-studio-build-tools-windows))
2. ⚠️ **REINICIE o computador** após instalação
3. Abra um **novo PowerShell** (importante!)
4. Execute novamente:
   ```bash
   npm install
   npm run rebuild
   ```

**Se ainda não funcionar:**
```powershell
# Limpe cache e tente novamente
npm cache clean --force
npm install
npm run rebuild
```

---

### ❌ Erro: "better-sqlite3 is not a native module"

**Solução:**
```bash
npm run rebuild
```

Se ainda falhar, veja a solução acima (Visual Studio).

---

### ❌ Erro: "Cannot find module 'vite'"

**Solução:**
```bash
npm install
npm run rebuild
```

---

### ❌ Porta 5173 já em uso (Vite)

**Solução 1:** Feche outras aplicações Vite

**Solução 2:** Use porta diferente
```bash
set VITE_PORT=5174 && npm run dev
```

---

### ❌ Aplicação não abre janela

Verifique no **Terminal 2** se há mensagens de erro. Geralmente é porque o Terminal 1 ainda está compilando. Aguarde e execute `npm start` novamente.

---

### ❌ PowerShell diz "npm: The term 'npm' is not recognized"

**Solução:**
1. Feche PowerShell completamente
2. Abra um **novo PowerShell** (importante!)
3. Tente novamente

---

## 📁 Estrutura do Projeto

```
serial-reader/
├── src/
│   ├── main/           ← Processo principal Electron (Node, BD, IPC)
│   ├── preload/        ← Contexto seguro para comunicação
│   ├── renderer/       ← UI React (Vite)
│   └── shared/         ← Tipos e contratos compartilhados
├── dist/               ← Build compilado (gerado)
├── package.json        ← Dependências
├── tsconfig.*.json     ← Configurações TypeScript
├── vite.config.ts      ← Configuração Vite
├── electron-builder/   ← Configuração do empacotador
└── CLAUDE.md          ← Contexto do projeto
```

---

## 🌐 Stack Técnico

- **Frontend:** React 18 + TypeScript + Vite
- **Desktop:** Electron 32
- **Banco:** SQLite (better-sqlite3)
- **Serial:** serialport
- **Auth:** bcryptjs (local)
- **Build:** electron-builder (NSIS para Windows)

---

## 📝 Próximos Passos

1. ✅ Aplicação rodando localmente
2. 📋 Explore o menu **"Configurações"** para testar CRUD de equipamentos
3. 🧪 Use `npm run sim` para simular leituras de porta serial
4. 💾 Verificar banco de dados SQLite em `%APPDATA%/Serial Reader/`

---

## ❓ Dúvidas?

Consulte:
- `CLAUDE.md` - Visão geral do projeto
- `TODO.md` - Estado das tarefas
- Código em `src/` com TypeScript estrito

