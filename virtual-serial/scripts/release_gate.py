#!/usr/bin/env python3
"""Read-only release gate. This is NOT Windows driver certification."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

REQUIRED_CHECKS = (
    "wdk_build_windows_x64", "infverif", "inf2cat", "pnp_two_ports",
    "serial_win32_api", "e2e_bidirectional", "windows_10_x64",
    "windows_11_x64", "reboot_persistence", "uninstall_rollback",
    "windows_signature_validation", "owner_approval",
)

def validate(data, root: Path):
    problems = []
    checks = data.get("checks")
    if not isinstance(checks, dict):
        return ["Campo 'checks' obrigatorio e deve ser objeto."]
    for name in REQUIRED_CHECKS:
        evidence = checks.get(name)
        if not isinstance(evidence, dict) or evidence.get("status") != "passed":
            problems.append(f"Falta evidencia de aprovacao: {name}")
            continue
        report_name = evidence.get("report")
        if not isinstance(report_name, str) or not report_name.strip():
            problems.append(f"Relatorio obrigatorio: {name}")
            continue
        relative = Path(report_name)
        if relative.is_absolute() or ".." in relative.parts:
            problems.append(f"Caminho inseguro: {name}")
            continue
        report = (root / relative).resolve()
        if not report.is_relative_to(root.resolve()) or not report.is_file() or not report.stat().st_size:
            problems.append(f"Relatorio ausente ou vazio: {name}")
    artifacts = data.get("artifacts")
    if not isinstance(artifacts, dict):
        problems.append("Artefatos assinados ausentes.")
        return problems
    driver_model = str(data.get("driver_model", "UMDF2")).upper()
    if driver_model not in ("UMDF2", "KMDF"):
        problems.append("driver_model invalido; esperado UMDF2 ou KMDF.")
        return problems
    driver_ext = ".sys" if driver_model == "KMDF" else ".dll"
    for name, extension in (("driver", driver_ext), ("inf", ".inf"), ("catalog", ".cat")):
        item = artifacts.get(name)
        if not isinstance(item, dict):
            problems.append(f"Artefato ausente: {name}")
            continue
        relative = Path(str(item.get("path", "")))
        if relative.is_absolute() or ".." in relative.parts or relative.suffix.lower() != extension:
            problems.append(f"Caminho invalido: {name}")
            continue
        path = (root / relative).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file():
            problems.append(f"Arquivo ausente: {name}")
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if item.get("sha256") != digest:
            problems.append(f"SHA-256 incorreto: {name}")
    return problems

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    try:
        manifest = args.manifest.resolve()
        problems = validate(json.loads(manifest.read_text(encoding="utf-8")), manifest.parent)
    except (OSError, ValueError, TypeError) as exc:
        problems = [str(exc)]
    print(json.dumps({"ready_for_human_review": not problems, "blockers": problems,
        "note": "Manifesto nao substitui revisao independente, WDK, assinatura ou HLK."},
        ensure_ascii=False, indent=2))
    return 0 if not problems else 1

if __name__ == "__main__":
    sys.exit(main())
