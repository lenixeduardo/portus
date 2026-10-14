# Simulador de equipamentos (fase 3)

Funciona em uma porta serial **já existente**; não cria portas COM no Windows, não instala drivers e não interfere nos equipamentos conectados.

```powershell
python -m pip install -r virtual-serial/simulator/requirements.txt
python virtual-serial/simulator/portus_simulator.py --port COM11 --equipment balanca --baud 9600
```

No PORTUS, configure a outra extremidade do par, por exemplo COM10, para 9600 8N1. Este simulador responde somente a **comandos demonstrativos** enviados com terminador `\n`:

- `PING\n` -> `PONG\r\n`
- `READ?\n` -> valor ASCII e unidade seguidos de `\r\n`
- outros comandos -> `ERR:UNKNOWN_COMMAND\r\n`

**Importante:** os protocolos de balança, pH-metro, viscosímetro, refratômetro e espectrofotômetro ainda dependem de fabricante/modelo. Os presets são somente demonstrativos; não afirmar compatibilidade real.

Testes sem portas COM:
```powershell
python -m unittest discover -s virtual-serial/simulator -p "test_*.py" -v
```

### Integração gradual

1. Quando o driver PORTUS gerar duas portas COM funcionais, executar este simulador na segunda extremidade.
2. O `serialport` já presente no processo Electron abre a primeira extremidade, **sem modificar a lógica de captura atual**.
3. Capturar quadros reais de equipamentos autorizados, definir protocolos específicos e adicionar fixtures por modelo.
4. Adicionar UI administrativa apenas depois do E2E e das validações de permissões.
