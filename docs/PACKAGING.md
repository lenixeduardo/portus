# Empacotamento Portus — Windows NSIS

## Resumo

Este documento descreve como empacotar o Portus para Windows usando `electron-builder` com target NSIS.

## Configuração

A configuração está dividida em:

1. **`package.json`**: Seção `"build"` com configurações gerais
2. **`electron-builder.yml`**: Arquivo separado com todas as opções NSIS
3. **`build/installer.nsh`**: Script customizado do NSIS (opcional, para comportamentos específicos)

### Campos Críticos

```json
{
  "main": "dist/main/index.js",  // ⚠️ CRÍTICO: caminho correto do entry point
  "build": {
    "appId": "com.portus.app",
    "productName": "Portus",
    "directories": {
      "output": "release"         // Instalador gerado aqui
    },
    "files": [
      "dist/**/*",
      "package.json"
    ]
  }
}
```

## Passos para Empacotar

### 1. Compilar o projeto

```bash
npm install
npm run rebuild  # recompila serialport + better-sqlite3 para Electron
npm run build    # compila main + renderer
```

### 2. Gerar o instalador

```bash
npm run package
```

Isso:
- Incrementa a versão em `package.json` (prepackage hook)
- Executa `electron-builder`
- Cria o arquivo `.exe` em `release/`

### 3. Testar o instalador

```bash
# Windows
release/Portus Setup 0.x.x.exe
```

O instalador deve:
- Exibir diálogo de boas-vindas (oneClick: false)
- Permitir escolher diretório de instalação
- Criar atalhos no Desktop e Menu Iniciar
- **Executar Portus.exe ao clicar no atalho** (não abrir em browser)

## Troubleshooting

### Problema: "Abrir do Electron pelo browser"

**Causa**: O campo `"main"` em `package.json` aponta para o arquivo errado.

**Solução**: Verificar se é `"dist/main/index.js"` (correto) e não `"dist/main/main/index.js"` (errado).

### Problema: Ícone não aparece no instalador

**Causa**: `build/icon.ico` não existe ou está com caminho errado.

**Solução**: 
```bash
# Converter PNG para ICO se necessário
# (usar GIMP ou ferramenta online)
ls build/icon.ico  # deve existir
```

### Problema: Serialport não funciona no .exe

**Causa**: Native modules não foram recompilados para Electron.

**Solução**:
```bash
npm run rebuild
npm run package
```

## Fluxo de Release

1. Editar versão em `package.json` manualmente ou deixar `prepackage` incrementar
2. Testar em desenvolvimento: `npm run dev`
3. Build final: `npm run build`
4. Gerar instalador: `npm run package`
5. Fazer smoke test: rodar o `.exe` no Windows
6. Commit + tag: `git tag v0.1.3 && git push --tags`
7. Upload para servidor de releases

## Configuração NSIS Detalhada

Arquivo: `electron-builder.yml`

```yaml
nsis:
  oneClick: false                  # Permite escolher diretório
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true      # Atalho no Desktop
  createStartMenuShortcut: true    # Atalho no Menu Iniciar
  shortcutName: "Portus"           # Nome do executável
  installerIcon: "build/icon.ico"  # Ícone do instalador
```

> **Importante**: Sempre incluir `shortcutName` para garantir que o atalho aponta para o executável correto.

## Variáveis de Ambiente

Durante o build, você pode configurar:

```bash
# Desabilitar auto-update
ELECTRON_NO_UPDATE=1 npm run package

# Verboso
DEBUG=electron-builder npm run package
```

## Certificado de Código (Opcional)

Para assinar o executável (produção):

```json
{
  "win": {
    "certificateFile": "/path/to/cert.pfx",
    "certificatePassword": "senha"
  }
}
```

Sem certificado, Windows SmartScreen pode avisar que é "desconhecido".

---

**Data**: 2026-06-09  
**Versão**: 1.0  
**Status**: Pronto para fase 7 (Empacotamento)
