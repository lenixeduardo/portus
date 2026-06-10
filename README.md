# Serial Reader

Aplicativo desktop (Electron + React + TypeScript) para captura de leituras de equipamentos laboratoriais via porta serial, vinculadas a fórmulas e lotes.

## Stack

- **Electron 32** — shell desktop
- **React 18 + Vite** — UI
- **TypeScript** — tipagem
- **better-sqlite3** — banco local
- **serialport** — leitura das portas COM
- **electron-builder** — empacotamento

## Estrutura

```
src/
  main/        Processo principal do Electron (Node, serial, DB)
  preload/     Ponte segura main <-> renderer
  renderer/    UI React
  shared/      Tipos compartilhados
tools/
  serial-sim.ts   Simulador de equipamento serial (desenvolvimento)
```

## Scripts

```bash
npm install
npm run rebuild    # recompila módulos nativos para Electron (serialport)
npm run dev        # inicia tsc watch + Vite dev server + Electron (tudo em um)
npm run build      # build de produção (renderer + main)
npm run start      # abre Electron em modo produção (requer npm run build antes)
npm run package    # gera instalador NSIS para Windows
npm run typecheck  # verifica tipos sem emitir arquivos
```

## Simulador serial

Para desenvolver e testar sem equipamentos físicos, use o simulador junto com
um par de portas seriais virtuais.

### Criando o par de portas virtuais

#### Linux — socat

```bash
# Instalar socat (se necessário)
sudo apt install socat   # Debian/Ubuntu
sudo dnf install socat   # Fedora

# Criar par de portas virtuais
socat -d -d pty,raw,echo=0 pty,raw,echo=0
```

O comando imprime os caminhos das duas PTYs criadas, por exemplo:

```
2024/01/01 12:00:00 socat[1234] N PTY is /dev/pts/4
2024/01/01 12:00:00 socat[1234] N PTY is /dev/pts/5
```

- Configure o **app** para usar `/dev/pts/4` (ou a primeira PTY)
- Execute o **simulador** na `/dev/pts/5` (ou a segunda PTY)

Mantenha o `socat` rodando enquanto testa.

#### Windows — com0com

1. Baixe e instale o **com0com** (Null-modem emulator):
   https://sourceforge.net/projects/com0com/

2. Abra o **Setup Command Prompt** do com0com (instalado junto):

   ```
   install PortName=COM10 PortName=COM11
   ```

3. Configure o **app** para usar `COM10`
4. Execute o **simulador** na `COM11`

### Usando o simulador

```bash
# Compilar e executar em sequência
npm run sim -- --port /dev/pts/5 --preset balanca

# Apenas compilar (sem executar)
npm run sim:build

# Executar após compilar
node dist/tools/serial-sim.js --port /dev/pts/5 --preset balanca
node dist/tools/serial-sim.js --port COM11 --preset ph --interval 2000
```

### Opções do simulador

| Opção | Padrão | Descrição |
|---|---|---|
| `--port <caminho>` | (obrigatório) | Porta serial (ex: `/dev/pts/5`, `COM11`) |
| `--preset <nome>` | `balanca` | Tipo de equipamento |
| `--interval <ms>` | `3000` | Intervalo entre leituras em milissegundos |
| `--count <n>` | `0` | Número de leituras; `0` = infinito |
| `--baud <taxa>` | `9600` | Baud rate |
| `--list-presets` | — | Lista presets disponíveis e suas regex sugeridas |

### Presets disponíveis

| Preset | Formato de saída | Regex sugerida |
|---|---|---|
| `balanca` | `  1.2345 kg` | `(\d+\.\d+)\s*kg` |
| `ph` | `pH  7.23` | `pH\s*(\d+\.\d+)` |
| `viscosimetro` | `125.3 mPa.s` | `(\d+\.\d+)\s*mPa` |
| `espectrofotometro` | `ABS:0.523` | `ABS[:\s]*(\d+\.\d+)` |
| `generico` | `1234.5678` | `(\d+\.\d+)` |

Configure a regex sugerida no campo **"Regex de parsing"** do equipamento em
**Configurações → Equipamentos**.

### Exemplo de sessão completa (Linux)

```bash
# Terminal 1 — par de portas virtuais
socat -d -d pty,raw,echo=0 pty,raw,echo=0
# → /dev/pts/4 e /dev/pts/5

# Terminal 2 — simulador enviando leituras de balança a cada 3s
npm run sim -- --port /dev/pts/5 --preset balanca

# App configurado: equipamento "Balança" → porta /dev/pts/4, regex (\d+\.\d+)\s*kg
# Clicar em "Iniciar Leitura" no dashboard para capturar as leituras
```

## Backup automático do banco de dados

Os dados ficam em um arquivo SQLite local (`serial-reader.sqlite` na pasta de
dados do usuário). Para proteger as leituras, lotes e demais registros, o app faz
backups automáticos desse arquivo:

- **Quando:** na inicialização do app e, em seguida, a cada 6 horas.
- **Onde:** por padrão em `Documentos/PORTUS/backups`. A pasta é configurável em
  **Configurações → Captura → Backup automático do banco de dados**.
- **Formato:** cada backup é uma cópia do arquivo SQLite com o nome
  `serial-reader-backup-YYYYMMDD-HHMMSS.sqlite`.
- **Retenção:** mantém apenas os N backups mais recentes (padrão 10, configurável
  de 1 a 100); os mais antigos são removidos automaticamente.
- **Backup manual:** o botão **"Fazer backup agora"** na mesma tela gera um backup
  imediato e mostra o caminho do arquivo criado.

Antes de cada cópia o estado atual do banco é persistido em disco, garantindo que
o backup contenha os dados mais recentes. Para restaurar, basta substituir o
arquivo `serial-reader.sqlite` por um dos backups (com o app fechado).

## Fases

- [x] Fase 0 — Setup inicial
- [x] Fase 1 — Banco + login
- [x] Fase 2 — CRUD fórmulas/lotes + dashboard
- [x] Fase 3 — Configuração de portas/equipamentos
- [x] Fase 4 — Núcleo de captura serial
- [ ] Fase 5 — Histórico e exportação
- [x] Fase 6 — Simulador serial
- [ ] Fase 7 — Empacotamento Windows
