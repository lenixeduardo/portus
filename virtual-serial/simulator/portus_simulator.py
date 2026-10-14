"""Standalone PORTUS equipment simulator, not a Windows driver.
Run on the OTHER endpoint of an existing serial pair.
Protocol frames here are demonstrative until each instrument is documented.
"""
from __future__ import annotations
import argparse
import json
import time
from dataclasses import dataclass
from pathlib import Path

PRESETS = {
    "balanca": ("g", "12.450"),
    "phmetro": ("pH", "7.02"),
    "viscosimetro": ("mPa.s", "850.0"),
    "refratometro": ("Brix", "14.2"),
    "espectrofotometro": ("Abs", "0.345"),
}
MAX_FRAME = 4096

@dataclass(frozen=True)
class Equipment:
    kind: str
    unit: str
    value: str
    terminator: bytes = b"\r\n"

    def respond(self, request: bytes) -> bytes:
        # Demonstration protocol: READ? -> value + unit, PING -> PONG.
        command = request.strip().upper()
        if command == b"PING":
            return b"PONG" + self.terminator
        if command == b"READ?":
            return f"{self.value} {self.unit}".encode("ascii") + self.terminator
        return b"ERR:UNKNOWN_COMMAND" + self.terminator

def make_equipment(kind: str, value: str | None = None) -> Equipment:
    if kind not in PRESETS:
        raise ValueError(f"Equipment not supported: {kind}")
    unit, default = PRESETS[kind]
    selected = default if value is None else value
    if len(selected) > 64 or not selected or any(ch not in "0123456789.-" for ch in selected):
        raise ValueError("value must be a numeric ASCII string, up to 64 characters")
    float(selected)
    return Equipment(kind, unit, selected)

def run(port: str, equipment: Equipment, baud: int = 9600) -> None:
    try:
        import serial
    except ImportError as exc:
        raise SystemExit("Install pyserial: python -m pip install pyserial") from exc
    if baud <= 0:
        raise ValueError("baud must be > 0")
    # No driver installation or device creation takes place.
    with serial.Serial(port=port, baudrate=baud, timeout=0.2, write_timeout=2) as connection:
        print(json.dumps({"event": "started", "port": port, "equipment": equipment.kind}))
        buffer = bytearray()
        while True:
            data = connection.read(128)
            if not data:
                continue
            buffer.extend(data)
            if len(buffer) > MAX_FRAME:
                buffer.clear()
                print(json.dumps({"event": "frame_too_long"}))
                continue
            while b"\n" in buffer:
                frame, _, tail = buffer.partition(b"\n")
                buffer = bytearray(tail)
                answer = equipment.respond(frame)
                connection.write(answer)
                print(json.dumps({"event": "reply", "request_hex": frame.hex(), "response_hex": answer.hex(), "timestamp": time.time()}))

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="Already existing serial port, e.g. COM11")
    parser.add_argument("--equipment", choices=sorted(PRESETS), required=True)
    parser.add_argument("--baud", type=int, default=9600)
    parser.add_argument("--value", default=None)
    args = parser.parse_args()
    run(args.port, make_equipment(args.equipment, args.value), args.baud)

if __name__ == "__main__":
    main()
