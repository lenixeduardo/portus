# Instalador NSIS — Portus

## O que o instalador faz

Quando você executa `Portus Setup 0.x.x.exe`:

1. ✅ Exibe diálogo de boas-vindas
2. ✅ Permite escolher diretório de instalação
3. ✅ Copia todos os arquivos do app
4. ✅ Cria atalho no **Desktop**
5. ✅ Cria atalho no **Menu Iniciar**
6. ✅ **Abre automaticamente o Portus ao terminar** (sem nenhuma mensagem de browser)

## Arquivo de configuração

O comportamento do instalador é definido por:

```yaml
# electron-builder.yml
nsis:
  oneClick: false                          # Permite escolher onde instalar
  allowToChangeInstallationDirectory: true # Usuário pode mudar diretório
  createDesktopShortcut: true              # Cria atalho no Desktop
  createStartMenuShortcut: true            # Cria atalho no Menu Iniciar
  shortcutName: Portus                     # Nome do executável
  installerIcon: build/icon.ico            # Ícone do instalador
  runAfterFinish: true                     # IMPORTANTE: Executa app ao terminar
  include: build/installer.nsh             # Script NSIS customizado
```

### Campo crítico: `runAfterFinish: true`

Este campo **executa automaticamente o Portus.exe** após o fim da instalação, sem nenhuma intervenção do usuário.

## Script customizado: build/installer.nsh

```nsh
!macro customInstallSuccess
  # Executar o app corretamente após instalação
  ExecShell "open" "$INSTDIR\Portus.exe"
!macroend
```

Isso garante que:
- O executável correto é chamado
- A shell do Windows (explorer.exe) abre o app
- Não há tentativa de abrir em browser

## Testando o instalador

```bash
# Gerar o instalador
npm run package

# Depois de gerado, você verá:
# release/Portus Setup 0.1.4.exe

# Duplo-clique para instalar e abrir
```

## Se o app não abrir ao terminar instalação

Checklist de troubleshooting:

1. ✅ Verificar se `runAfterFinish: true` está em `electron-builder.yml`
   ```bash
   grep -A 10 "nsis:" electron-builder.yml | grep runAfterFinish
   ```

2. ✅ Verificar se o executável foi gerado corretamente
   ```bash
   ls -lh "C:\Program Files\Portus\Portus.exe"  # Windows
   ```

3. ✅ Verificar permissões do arquivo
   - Clique direito em `Portus.exe` → Propriedades
   - Abra como administrador?

4. ✅ Ver logs do instalador
   - Durante instalação, procurar por "Finalizando instalação..."
   - Ao fim, deve executar o app

5. ✅ Testar manualmente
   ```bash
   # Abrir app manualmente após instalação
   C:\Program Files\Portus\Portus.exe
   ```

## Variáveis do NSIS

Para personalizar ainda mais, você pode adicionar no `build/installer.nsh`:

```nsh
!macro customInstallSuccess
  # Sua lógica aqui
  MessageBox MB_YESNO "Deseja abrir o Portus agora?" IDNO done
    ExecShell "open" "$INSTDIR\Portus.exe"
  done:
!macroend
```

Mas por padrão, a config atual abre direto sem perguntas.

## Atalhos criados

Após instalação, o usuário terá:

| Local | Nome | Alvo |
|-------|------|------|
| Desktop | Portus | `C:\Program Files\Portus\Portus.exe` |
| Menu Iniciar → Portus | Portus | `C:\Program Files\Portus\Portus.exe` |
| Menu Iniciar → Portus | Desinstalar | Uninstaller |

---

**Status**: ✅ Instalador pronto para produção  
**Data**: 2026-06-09
