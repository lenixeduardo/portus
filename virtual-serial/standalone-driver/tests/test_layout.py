"""Static contract tests: not WDK compilation and not Windows runtime validation."""
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
C_SOURCE = ROOT / "kmdf" / "labserial.c"
INF_SOURCE = ROOT / "kmdf" / "labserial.inx"
PROJECT = ROOT / "kmdf" / "labserial.vcxproj"

class StandaloneLayout(unittest.TestCase):
    def test_vcxproj_parses(self):
        tree = ET.parse(PROJECT)
        root = tree.getroot()
        ns = {"m": "http://schemas.microsoft.com/developer/msbuild/2003"}
        self.assertTrue(any("labserial.c" == e.attrib.get("Include") for e in
                            root.findall(".//m:ClCompile", ns)))
        self.assertTrue(any("labserial.inx" == e.attrib.get("Include") for e in
                            root.findall(".//m:Inf", ns)))
    def test_two_independent_devices(self):
        source = C_SOURCE.read_text(encoding="utf-8")
        inf = INF_SOURCE.read_text(encoding="utf-8")
        for text in ("COM210", "COM211", "LabEvtRead", "LabEvtWrite",
                     "WdfRequestForwardToIoQueue", "WdfDeviceCreateDeviceInterface",
                     "WdfRegistryAssignUnicodeString"):
            with self.subTest(text=text):
                self.assertIn(text, source)
        for text in ("ROOT\\LABSERIAL_VCOM_A", "ROOT\\LABSERIAL_VCOM_B",
                     "Class=Ports", "KmdfService"):
            self.assertIn(text, inf)
    def test_no_application_or_original_com0com_dependency(self):
        code = C_SOURCE.read_text(encoding="utf-8").lower()
        banned = ('#include "portus', '#include <node', '#include <electron',
                  '#include "com0com', '#include <com0com')
        for dependency in banned:
            self.assertNotIn(dependency, code)
    def test_no_distribution_flag(self):
        doc = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("NÃO INSTALAR EM PRODUÇÃO", doc)
        self.assertIn("Não compilado no WDK", doc)

if __name__ == "__main__":
    unittest.main()
