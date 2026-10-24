import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from release_gate import REQUIRED_CHECKS, validate

class TestReleaseGate(unittest.TestCase):
    def test_empty_blocks(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertTrue(validate({}, Path(td)))
    def test_manifest_cannot_fake_files(self):
        with tempfile.TemporaryDirectory() as td:
            data = {"checks": {key: {"status": "passed", "report": "missing.txt"} for key in REQUIRED_CHECKS},
                    "artifacts": {key: {"path": name, "sha256": "0"*64}
                                  for key, name in (("driver","a.dll"),("inf","a.inf"),("catalog","a.cat"))}}
            self.assertGreaterEqual(len(validate(data, Path(td))), len(REQUIRED_CHECKS))
    def test_reports_and_hashes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root/"proof.txt").write_text("approved", encoding="utf8")
            artifacts = {}
            for key,name in (("driver","a.dll"),("inf","a.inf"),("catalog","a.cat")):
                content = (key+"bytes").encode()
                (root/name).write_bytes(content)
                artifacts[key] = {"path":name,"sha256":hashlib.sha256(content).hexdigest()}
            checks = {key:{"status":"passed","report":"proof.txt"} for key in REQUIRED_CHECKS}
            self.assertEqual(validate({"checks":checks, "artifacts":artifacts},root), [])
            artifacts["inf"]["sha256"] = "0"*64
            self.assertIn("SHA-256 incorreto: inf",validate({"checks":checks,"artifacts":artifacts},root))
    def test_kmdf_requires_sys_artifact(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root/"proof.txt").write_text("approved", encoding="utf8")
            checks = {key: {"status": "passed", "report": "proof.txt"} for key in REQUIRED_CHECKS}
            artifacts = {}
            for key, name in (("driver", "labserial.sys"), ("inf", "labserial.inf"), ("catalog", "labserial.cat")):
                payload = (key + "artifact").encode()
                (root/name).write_bytes(payload)
                artifacts[key] = {"path": name, "sha256": hashlib.sha256(payload).hexdigest()}
            data = {"driver_model": "KMDF", "checks": checks, "artifacts": artifacts}
            self.assertEqual(validate(data, root), [])
            artifacts["driver"]["path"] = "labserial.dll"
            self.assertIn("Caminho invalido: driver", validate(data, root))

    def test_prevent_directory_traversal(self):
        with tempfile.TemporaryDirectory() as td:
            checks = {key:{"status":"passed","report":"../bad"} for key in REQUIRED_CHECKS}
            self.assertTrue(any("Caminho inseguro" in p for p in
                validate({"checks":checks,"artifacts":{}},Path(td))))

if __name__ == "__main__":
    unittest.main()
