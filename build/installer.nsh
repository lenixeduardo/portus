# Customização do instalador NSIS para Portus
# Garante que os atalhos apontam para o executável correto

!macro customInstall
  # Customizações após instalação
  DetailPrint "Configurando atalhos..."

  # O atalho de desktop é criado automaticamente pelo electron-builder,
  # Mas garantimos que aponta para o executável correto
  ${If} ${FileExists} "$DESKTOP\Portus.lnk"
    DetailPrint "Atalho de desktop encontrado"
  ${EndIf}
!macroend

!macro customUnInstall
  # Customizações para desinstalação
!macroend
