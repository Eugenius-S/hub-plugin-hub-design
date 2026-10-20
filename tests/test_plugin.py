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
        for name in (m["web"], m["icon"], "icon.svg", "style.css", "agent.js", "lib.js", "canvas.js", "icons.js", "dashboard.js", "dashboard.css", "server.py"):
            self.assertTrue(os.path.isfile(os.path.join(HERE, name)), name)


@unittest.skipUnless(NODE, "node не найден")
class Scripts(unittest.TestCase):
    def test_syntax(self):
        for name in ("main.js", "lib.js", "agent.js", "canvas.js", "icons.js", "dashboard.js"):
            r = subprocess.run([NODE, "--check", os.path.join(HERE, name)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, name + r.stderr)

    def test_lib(self):
        r = subprocess.run([NODE, "--test", os.path.join(HERE, "tests", "lib.test.mjs")], capture_output=True, text=True, cwd=HERE)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_dashboard(self):
        r = subprocess.run([NODE, "--test", os.path.join(HERE, "tests", "dashboard.test.mjs")], capture_output=True, text=True, cwd=HERE)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_dashboard_opens_at_start(self):
        # стартовый экран — дашборд: при входе в вид (home: true), пока нет открытого макета и после клика по логотипу; новый файл — слова в чате
        with open(os.path.join(HERE, "main.js"), encoding="utf-8") as f:
            main = f.read()
        self.assertIn("home: true", main)                                   # при загрузке страницы — дашборд, не холст
        self.assertIn("const home = () => P.home || !P.frames.length;", main)
        self.assertIn('hub.addStyle("dashboard.css")', main)
        self.assertIn("if (home()) return NEW_DESIGN + text;", main)        # написали на дашборде — новый макет по указаниям
        self.assertIn("if (home()) P.openNew", main)                        # и он открывается на холсте, когда появился файл
        self.assertIn("P.home = false;", main)                              # клик по файлу или новый макет закрывает дашборд
        self.assertIn("function startPreset(p)", main)                      # пресет: специалист вида и заготовка в поле
        self.assertIn("ui.input.focus()", main)
        self.assertIn("function dropStub()", main)                          # нетронутая заготовка не едет в чат макета
        self.assertIn("hd-home", main)                                      # вернуться на дашборд — логотип
        with open(os.path.join(HERE, "dashboard.js"), encoding="utf-8") as f:
            dash = f.read()
        self.assertIn("IntersectionObserver", dash)                         # превью грузятся только у экрана
        self.assertIn("LIVE_MAX", dash)                                     # и не больше горстки разом
        self.assertIn("!S.list", dash)                                      # в списке превью не нужны
        with open(os.path.join(HERE, "dashboard.css"), encoding="utf-8") as f:
            css = f.read()
        self.assertIn(".hdd{position:absolute;inset:0", css)                # поверх холста, не вместо него

    def test_composer_button_and_sidebar_contract(self):
        # кнопка-палитра в поле ввода (место composer.tools) и контракт hide-sidebar: прячем при входе в вид, возвращаем при уходе
        with open(os.path.join(HERE, "main.js"), encoding="utf-8") as f:
            main = f.read()
        self.assertIn('hub.addSlot("composer.tools"', main)
        self.assertIn("hub-sidebar", main)
        self.assertIn('by: "hub-design"', main)
        self.assertIn("show() { P.shown = true; sidebar(true);", main)
        self.assertIn("hide() { P.shown = false; sidebar(false);", main)
        with open(os.path.join(HERE, "style.css"), encoding="utf-8") as f:
            css = f.read()
        self.assertIn("html.hs-hidden .hd-top", css)

    def test_recipient_follows_design_not_session(self):
        # получатель и чат — специалист макета (автор или designer), не сессия палитры и не «последняя в браузере»
        with open(os.path.join(HERE, "main.js"), encoding="utf-8") as f:
            main = f.read()
        self.assertNotIn('"last", JSON.stringify({ session', main)   # получатель не хранится между открытиями
        self.assertNotIn("P.session = h.session", main)             # перенос из чата не меняет получателя
        self.assertIn("setSession(wanted())", main)                 # следует за открытым макетом
        self.assertIn("sendOne(", main)                             # «Отправить» в окне комментария — автору сразу
        self.assertIn("/api/inject", main)                          # «Отправить сейчас», как в чате хаба
        self.assertIn("close()", main)                              # ✕ закрыть Hub Design
        self.assertEqual(main.count("|| DEFAULT_SESSION;"), 1)       # нет автора — не молча «дизайнер»: получателя выбирает владелец; «дизайнер» по умолчанию — только на стартовом экране (новый файл)
        self.assertIn("if (home()) return P.homeWho || (P.preset && P.preset.to) || DEFAULT_SESSION;", main)
        self.assertIn("/api/history", main)                         # Write макета за хвостом ленты ищем в истории
        self.assertIn("frame.h !== windowHeight(frame.w)", main)    # рамка не тянется по документу (100vh макета)
        self.assertLess(main.index("const recipient = "), main.index("const app = {"))   # app читает recipient при загрузке модуля (0.4.1 без вида)
        with open(os.path.join(HERE, "canvas.js"), encoding="utf-8") as f:
            canvas = f.read()
        self.assertIn("app.close()", canvas)
        self.assertNotIn('"Комментарий", null', canvas)             # кнопки «Комментарий» (в пачку) в окне больше нет
        with open(os.path.join(HERE, "style.css"), encoding="utf-8") as f:
            css = f.read()
        self.assertIn(".hd-card .bar{flex-wrap:nowrap", css)        # поле ввода в узкой колонке — одной строкой


if __name__ == "__main__":
    unittest.main()
