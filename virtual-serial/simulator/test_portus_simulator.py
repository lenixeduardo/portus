import unittest
from portus_simulator import PRESETS, make_equipment

class TestSimulator(unittest.TestCase):
    def test_all_presets(self):
        for key in PRESETS:
            with self.subTest(key=key):
                eq = make_equipment(key)
                self.assertTrue(eq.respond(b"READ?\r\n").endswith(b"\r\n"))
                self.assertIn(eq.unit.encode(), eq.respond(b"READ?\n"))
    def test_ping_and_unknown(self):
        eq = make_equipment("balanca")
        self.assertEqual(eq.respond(b"ping\r\n"), b"PONG\r\n")
        self.assertEqual(eq.respond(b"??\n"), b"ERR:UNKNOWN_COMMAND\r\n")
    def test_invalid_values(self):
        for value in ("", "not_a_number", "1\r\n2", "2"*65):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    make_equipment("balanca", value)
    def test_unknown_equipment(self):
        with self.assertRaises(ValueError):
            make_equipment("unknown")

if __name__ == "__main__":
    unittest.main()
