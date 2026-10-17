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
    def test_kernel_fifo_reuses_user_mode_tested_source(self):
        source = C_SOURCE.read_text(encoding="utf-8")
        test = (ROOT / "tests" / "ring_tests.c").read_text(encoding="utf-8")
        shared = (ROOT / "core" / "labserial_ring.h").read_text(encoding="utf-8")
        self.assertIn('#include "../core/labserial_ring.h"', source)
        self.assertIn('#include "../core/labserial_ring.h"', test)
        self.assertIn("LabRingPush", shared)
        self.assertIn("LabRingPop", shared)

    def test_devgen_root_dev_instance_id_handled_by_hardware_ids(self):
        physical = ROOT / "physical"
        smoke = (physical / "Test-LabSerialPorts.ps1").read_text(encoding="utf-8")
        preflight = (physical / "Inspect-LabSerialHost.ps1").read_text(encoding="utf-8")
        diagnostics = (physical / "Inspect-LabSerialPorts.ps1").read_text(encoding="utf-8")
        for script in (smoke, preflight, diagnostics):
            self.assertIn("DEVPKEY_Device_HardwareIds", script)
        self.assertIn("DEVPKEY_Device_Service", smoke)
        self.assertIn("QueryDosDevice", smoke)
        self.assertNotIn("InstanceId -like 'ROOT\\LABSERIAL_VCOM_A\\*'", smoke)
        self.assertNotIn("InstanceId -like 'ROOT\\LABSERIAL_VCOM_B\\*'", smoke)
        self.assertIn("ROOT\\LABSERIAL_VCOM_A", diagnostics)
        self.assertIn("ROOT\\LABSERIAL_VCOM_B", diagnostics)

    def test_serialport_open_compatibility_ioctls(self):
        source = C_SOURCE.read_text(encoding="utf-8")
        self.assertIn("case IOCTL_SERIAL_GET_PROPERTIES:", source)
        self.assertIn("sizeof(SERIAL_COMMPROP)", source)
        self.assertIn("props->MaxBaud = 4000000;", source)
        self.assertIn("props->ServiceMask = SERIAL_SP_SERIALCOMM;", source)
        self.assertIn("case IOCTL_SERIAL_SET_QUEUE_SIZE:", source)
        self.assertIn("sizeof(SERIAL_QUEUE_SIZE)", source)
        self.assertIn("requested->InSize <= LAB_RING_CAPACITY", source)
        self.assertIn("requested->OutSize <= LAB_RING_CAPACITY", source)
        self.assertNotIn("SERIAL_PCF_TOTALTIMEOUTS", source)
        self.assertNotIn("SERIAL_PCF_INTTIMEOUTS", source)

    def test_no_distribution_flag(self):
        doc = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("NÃO INSTALAR EM PRODUÇÃO", doc)
        self.assertIn("Compilação WDK x64 de teste aprovada", doc)

if __name__ == "__main__":
    unittest.main()
