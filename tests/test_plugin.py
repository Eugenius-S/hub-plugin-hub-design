"""Манифест и скрипты страницы: собираются, логика проходит свои тесты на Node."""
import json
import os
import shutil
import subprocess
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = shutil.which("node")


class Manifest(unittest.TestCase):
    def test_fields(self):
        with open(os.path.join(HERE, "hub-plugin.json"), encoding="utf-8") as f:
            m = json.load(f)
        self.assertEqual(m["name"], "hub-design")
        for key in ("description", "why", "version", "hub", "web", "icon"):
            self.assertTrue(m.get(key), key)
        self.assertEqual(m["run"], ["python3", "server.py"])
        for name in (m["web"], m["icon"], "icon.svg", "style.css", "agent.js", "lib.js", "server.py"):
            self.assertTrue(os.path.isfile(os.path.join(HERE, name)), name)


@unittest.skipUnless(NODE, "node не найден")
class Scripts(unittest.TestCase):
    def test_syntax(self):
        for name in ("main.js", "lib.js", "agent.js"):
            r = subprocess.run([NODE, "--check", os.path.join(HERE, name)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, name + r.stderr)

    def test_lib(self):
        r = subprocess.run([NODE, "--test", os.path.join(HERE, "tests", "lib.test.mjs")], capture_output=True, text=True, cwd=HERE)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
