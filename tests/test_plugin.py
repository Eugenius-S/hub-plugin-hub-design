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

    def test_gaps_051(self):
        # 0.5.1: автор макета — по событиям (без выдержки 20 с), файл на месте (пометка и сообщение), «Убрать» из очереди — с «Отменить»
        with open(os.path.join(HERE, "main.js"), encoding="utf-8") as f:
            main = f.read()
        self.assertNotIn("20000", main)                                  # выдержки по времени нет
        self.assertNotIn("setInterval", main)
        self.assertIn("dueSessions(", main)                              # лента перечитывается, когда вырос её номер правки
        self.assertIn("timelineQuery(", main)                            # и только изменённые строки
        self.assertIn("/__canvas/have", main)                            # есть ли файл — спрашиваем у процесса плагина
        self.assertIn("async function openChecked(", main)               # открыть на холсте — после проверки, не пустая рамка
        self.assertIn("cancels.start(P.session, it)", main)              # «Убрать» откладывается
        self.assertIn('"Отменить"', main)
        self.assertNotIn('hub.post("/api/queue/cancel"', main)           # прямой отмены без передумать больше нет
        with open(os.path.join(HERE, "canvas.js"), encoding="utf-8") as f:
            canvas = f.read()
        self.assertIn('"К дашборду"', canvas)                            # в рамке без файла — выход на дашборд
        self.assertIn("goneText(", canvas)
        with open(os.path.join(HERE, "dashboard.js"), encoding="utf-8") as f:
            dash = f.read()
        self.assertIn("!isGone(app.fileState(f.path))", dash)            # макет без файла в списке не показывается
        self.assertIn("isGone(app.fileState(c.path))", dash)             # и превью не грузит
        self.assertNotIn("hdd-ghost", dash)

    def test_exit_and_close_052(self):
        # 0.5.2: ✕ — свой островок и закрывает макет; «Exit Hub Design» — справа снизу, выход в чат специалиста
        with open(os.path.join(HERE, "canvas.js"), encoding="utf-8") as f:
            canvas = f.read()
        self.assertIn('el("div", "hdc-card hdc-x")', canvas)
        self.assertIn("xIsland.append(closeB)", canvas)
        self.assertNotIn("top.append(playTop, panel, zoomB, closeB)", canvas)
        with open(os.path.join(HERE, "main.js"), encoding="utf-8") as f:
            main = f.read()
        self.assertIn('"Exit Hub Design"', main)
        self.assertIn("exitTarget(P.session", main)
        self.assertIn("removeFrame(path, true)", main)                   # закрытие макета не стирает черновики комментариев
        with open(os.path.join(HERE, "style.css"), encoding="utf-8") as f:
            css = f.read()
        self.assertIn(".hd-exit{position:absolute;right:var(--space-3);bottom:var(--space-3)", css)


if __name__ == "__main__":
    unittest.main()

    def test_needed_specialists_060(self):
        # 0.6.0: нужных специалистов нет в хабе — плашка «Поставить» (просьба хабу от владельца), ждём по снимку, у animator — тихая строка
        with open(os.path.join(HERE, "lib.js"), encoding="utf-8") as f:
            lib = f.read()
        self.assertIn("export const NEEDED", lib)                        # список — одно место
        with open(os.path.join(HERE, "main.js"), encoding="utf-8") as f:
            main = f.read()
        self.assertIn("async function install(name)", main)
        self.assertIn("text: installText(name)", main)                   # «Поставь специалиста для Hub Design: specialists install <имя>»
        self.assertIn("action: true", main)                              # кнопка страницы, не ответ на карточку
        self.assertIn("lacking(", main)                                  # кого нет — считаем по снимку, без таймера опроса
        self.assertIn("ui.need.paint(", main)                            # чат без специалиста — та же плашка
        with open(os.path.join(HERE, "dashboard.js"), encoding="utf-8") as f:
            dash = f.read()
        self.assertIn("export function createNeed(", dash)
        self.assertIn('"Попросила хаб, ждём"', dash)
        self.assertIn("нет специалиста", dash)                           # animator — строка у пресета, не плашка
        with open(os.path.join(HERE, "README.md"), encoding="utf-8") as f:
            readme = f.read()
        self.assertIn("С Hub Design ставится специалист designer из каталога specialists (кнопка на стартовом экране)", readme)
