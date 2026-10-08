# PORTUS Database Utility — especificação e critérios de aceite (v1)

## Identidade e assets

- **Light mode**. Títulos/wordmark textual: **Sora 600/700**; restante: **Inter 400/500/600**.
- Unidades de tipografia: **px**, via `System.Drawing.GraphicsUnit.Pixel`; dimensionamento WinForms: `AutoScaleMode.Dpi`.
- Paleta definida exclusivamente em `database/portus-ui-design-tokens.ps1` (tokens compartilhados pelo formulário).
- Emblema azul aprovado: `database/assets/portus-blue-logo.png`; aparece no cabeçalho e no ícone da janela.
- Quatro assets de ação **avulsos**, sem texto nem botões: `database/assets/actions/{validar-banco,aplicar-migrations,verificar-rede,registrar-ip}.{svg,png}`.
- PNG para botões: transparente, 24x24. A ação principal utiliza ícone branco para contraste sobre fundo azul.

## Tokens de cores

| Token | Hex | Uso |
|---|---|---|
| primary | `#1479E5` | CTA |
| primaryHover | `#0967CF` | mouse over |
| primaryPressed | `#0753A6` | clique |
| primarySoft | `#EAF4FF` | hover secundário/dicas |
| navy | `#081D3F` | marca |
| heading | `#112749` | títulos |
| textPrimary | `#20314C` | conteúdo |
| textSecondary | `#64748B` | auxiliares |
| background | `#F3F6FA` | fundo |
| surface | `#FFFFFF` | cards, inputs |
| surfaceMuted | `#FAFCFF` | log |
| border | `#D8E2EE` | cards |
| borderStrong | `#C8D5E5` | inputs/botões |
| success / warning / error | `#16803B` / `#D97706` / `#B42318` | feedback |
| disabled | `#94A3B8` | indisponível |

## Tipografia / métricas

| Papel | Família | Tamanho | Peso |
|---|---|---:|---:|
| Marca textual | Sora | 36 px | 700 |
| Subtítulo | Sora | 18 px | 600 |
| Títulos de seção | Sora | 18 px | 600 |
| Cards/status | Sora | 16 px | 600 |
| Botões | Inter | 14 px | 600 |
| Labels | Inter | 13 px | 600 |
| Inputs | Inter | 14 px | 400 |
| Descrições | Inter | 12–13 px | 400 |
| Status | Inter | 14 px | 600 |
| Logs | Inter | 12 px | 400 |

## Responsividade e comportamento

- Janela de referência até 1160×928 px, respeitando a área utilizável do monitor.
- Conteúdo fixo de 1136 px encapsulado em painel com **rolagem automática** para notebooks 1366×768 e DPI 125/150%.
- Inputs elevados a 40 px de referência; quatro ações alinhadas, ícone 24 px, altura 56 px.
- Estados: default, hover, pressed, disabled e busy. Durante uma tarefa todas as outras ações ficam inativas.
- A validação não modifica o banco; aplicar migrations exige confirmação.
- Logs mostram horário, resultado de processo e status real. Ações não exibem sucesso antecipado.
- Senha mascarada por padrão e transmitida ao processo filho apenas por variável de ambiente temporária, sem persistência pelo utilitário.

## Fonte em estações Windows

O ZIP do utilitário **não distribui arquivos de fonte**. Instale localmente as fontes abertas Sora e Inter **por decisão do operador**, usando as fontes oficiais Google Fonts:

```powershell
.\database\install-portus-ui-fonts.ps1
```

Arquivos baixados para `%LOCALAPPDATA%\PORTUS\ui-fonts` são carregados em uma `PrivateFontCollection`; não é preciso acesso de administrador do Windows. Sem fontes, o utilitário funciona com fallback **explicitamente sinalizado** no console, status e log, mas a aprovação visual requer Sora e Inter. Nenhum download é feito automaticamente durante a abertura do aplicativo.

## Verificação (sem PostgreSQL)

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\database\portus-db-utility.ps1 -SmokeTest -StrictFonts
```

O workflow `portus-utility-capture.yml` instala as fontes OFL no runner Windows, faz a captura autêntica do WinForms, e publica PNG. Testes de integração SQL/PostgreSQL e TypeScript/Windows devem passar antes do merge.

## Aceite

- [ ] Logo azul e ícone de janela com o mesmo emblema.
- [ ] Sora nos títulos; Inter em todo o restante, sem fallback silencioso.
- [ ] Quatro ícones de ação transparentes, distintos, aplicados aos botões.
- [ ] Tokens corretos, incluindo foco/hover/status/disabled.
- [ ] Nenhum campo/texto sobreposto ou oculto em 1366×768 e Full HD; rolagem com DPI 125/150%.
- [ ] Quatro comandos originais continuam operacionais e protegidos por confirmação quando aplicável.
- [ ] Smoke test WinForms e capture reais bem-sucedidos.
- [ ] PostgreSQL integração e testes Windows aprovados.
