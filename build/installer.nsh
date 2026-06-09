# Customização do instalador NSIS para Portus
# Garante que o executável seja aberto corretamente ao terminar instalação

!macro customInstall
  DetailPrint "Finalizando instalação..."
!macroend

!macro customUnInstall
  # Customizações para desinstalação
!macroend

!macro customInstallSuccess
  # Executar o app corretamente após instalação
  ExecShell "open" "$INSTDIR\Portus.exe"
!macroend
