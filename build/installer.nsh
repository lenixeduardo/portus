# Customização do instalador NSIS para Portus.
# A abertura ao concluir é controlada por runAfterFinish no electron-builder.

!macro customInstall
  DetailPrint "Finalizando instalação..."
!macroend

!macro customUnInstall
  # Customizações para desinstalação
!macroend
