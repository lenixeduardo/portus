# LabSerial — segunda execução de transmissão real em Windows físico

**Data:** 17/10/2026, ~03:53 (hora local indicada pelo nome da pasta de evidências).  
**Status:** **PASS no teste funcional básico Win32 COM210 ↔ COM211**, seis de seis quadros.  
**Fonte:** transcrição do console PowerShell fornecida pelo operador, incluindo validação do relatório JSON pelo supervisor corrigido. O JSON/TXT original ainda não foi anexado ao repositório.

## Ambiente e identificação comprovados

- Windows físico x64; dispositivos LabSerial A/B identificados pelo utilitário através de HardwareIds, serviço `LabSerial`, estado PnP OK, PortName, SERIALCOMM e links Win32.
- A: `ROOT\LABSERIAL_VCOM_A`, instância `ROOT\DEVGEN\{92205F30-ECF7-DF4F-BB04-D1B13C89502E}`, `COM210`, exibido no Gerenciador como `COM6`.
- B: `ROOT\LABSERIAL_VCOM_B`, instância `ROOT\DEVGEN\{CAF11815-BCE7-EA4E-90F6-F3C2758EB0F8}`, `COM211`, exibido como `COM5`.
- O teste abre exclusivamente as portas LabSerial `COM210` e `COM211`; as portas com0com não fazem parte da validação.

## Transmissão reportada

| Teste | Direção | Bytes | SHA-256 reportado | Resultado |
|---|---|---:|---|---|
| ASCII | COM210 → COM211 | 49 | `41B9F04283463073DDE5B14A53D70BC04BA5824286FC752B72E78DCB87BF68C6` | PASS |
| ASCII | COM211 → COM210 | 49 | `D918C77B54A194753F58CF25BAA1345CBC64D7004548555CFD5913C3A33D0EA5` | PASS |
| Binário | COM210 → COM211 | 16 | `202375CA0A02D744F1DA875FC4570A1B6C871AA9690818B41C51E91BBA85EA4C` | PASS |
| Binário | COM211 → COM210 | 16 | `202375CA0A02D744F1DA875FC4570A1B6C871AA9690818B41C51E91BBA85EA4C` | PASS |
| Padrão de 512 bytes | COM210 → COM211 | 512 | `08AC48E649B513D133DE8324A7C75F166F3347490AFCBE447E8DF6DEBF09208B` | PASS |
| Padrão de 512 bytes | COM211 → COM210 | 512 | `08AC48E649B513D133DE8324A7C75F166F3347490AFCBE447E8DF6DEBF09208B` | PASS |

**Total:** seis quadros, **1.154 bytes** transmitidos e recebidos com igualdade de conteúdo e hash verificada pelo teste; três operações em cada sentido.

Saída final do supervisor corrigido (transcrição, literal):

```text
PASS: 6 quadros e dados binarios transmitidos e recebidos sem divergencias.
PASS FINAL: 6 quadros, 1154 bytes verificados, A->B=3 e B->A=3.
SUCESSO confirmado pelo supervisor e JSON desta sessao.
```

## Artefatos produzidos no computador de laboratório

- Diretório de execução: `C:\Users\uzinh\Documents\LabSerial-Evidencias\Sessao-20261017-035325-847-a090c89d\`
- JSON: `LabSerial-Transmissao-20261017-035326-541.json`
- TXT: `LabSerial-Transmissao-20261017-035326-541.txt`

O novo supervisor corrigiu o falso negativo `exit code` vazio observado no teste anterior, executou o processo filho, recuperou seu código de saída e verificou os seis quadros do JSON da própria sessão antes de apresentar `PASS FINAL`.

## Limitações de evidência e próximos gates

A execução **comprova comunicação básica bidirecional de dados Win32 no ambiente testado**, não certifica compatibilidade completa com aplicativos seriais e não significa segurança para produção. Os relatórios JSON/TXT não foram entregues para revisão independente; o registro acima se baseia na saída do programa fornecida pelo operador.

**Pendente:**
- [ ] Receber e auditar o JSON/TXT original dessa sessão.
- [ ] Corrigir nome mostrado no Gerenciador de Dispositivos (COM5/COM6 versus COM210/COM211).
- [ ] Testar `System.IO.Ports.SerialPort`, SerialTool e aplicações seriais reais (incluindo configuração de baudrate/IOCTLs).
- [ ] Exercitar timeouts reais, cancelamento, saturação de buffer, leitura concorrente e remoção PnP.
- [ ] Testar reboot, Driver Verifier e estresse prolongado em PC/VM dedicada.
- [ ] Obter assinatura Windows para distribuição e repetir homologação com proteções normais.

**Sem release/merge em produção.** Driver ainda usa certificado experimental de teste e TESTSIGNING.
