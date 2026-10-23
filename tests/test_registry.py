"""The registry of designs: replay of an invented journal (and its archive) - every design ever made stays, a gone session does not matter."""
import json
import os
import shutil
import sys
import tempfile
import unittest
import unittest.mock

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import registry  # noqa: E402

WIN = os.name == "nt"


def p(*parts):
    """An invented absolute path of this OS."""
    return ("C:\\work\\" if WIN else "/work/") + (os.sep.join(parts))


def ev(seq, type, data, entity=None, ts=None):
    return {"seq": seq, "ts": ts or 1000 + seq, "src": "host", "type": type, "entity": entity, "data": data}


def wrote(seq, session, path, name="Write"):
    return ev(seq, "turn.tool", {"id": f"t{seq}", "name": name, "input": {"file_path": path, "content": "<html></html>"}}, session)


def sent(seq, session, path, copy=None):
    return ev(seq, "owner.file", {"path": copy or p("attachments", f"a{seq}", os.path.basename(path)), "source": path, "sender": session,
                                   "channel": "session", "owner": False})


def raised(seq, executor, raiser, title=None, context="Сверстай баннер для ролика"):
    """delegation.created: task d<seq> goes to `executor`, raised by the session `raiser`."""
    return ev(seq, "delegation.created", {"session": executor, "for": None, "for_session": raiser, "context": context,
                                          **({"title": title} if title else {})})


def turn(seq, session, marker=None, head=None):
    return ev(seq, "turn.started", {"marker": marker or f"m{seq}", "prompt_head": head or f"[hub:{marker or 'm%d' % seq} от x] go"}, session)


class Registry(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="reg-test-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        os.makedirs(os.path.join(self.tmp, "journal-archive"))

    def live(self, events, mode="w"):
        with open(os.path.join(self.tmp, "journal.jsonl"), mode, encoding="utf-8") as f:
            for e in events:
                f.write(json.dumps(e, ensure_ascii=False, separators=(",", ":")) + "\n")

    def archive(self, events, name=None):
        name = name or f"journal-{events[0]['seq']}-{events[-1]['seq']}.jsonl"
        with open(os.path.join(self.tmp, "journal-archive", name), "w", encoding="utf-8") as f:
            for e in events:
                f.write(json.dumps(e, ensure_ascii=False, separators=(",", ":")) + "\n")

    def reg(self):
        r = registry.Registry(self.tmp)
        r.poll()
        return r

    def paths(self, r):
        return {os.path.basename(x["path"]): x for x in r.listing()}

    def test_a_design_of_a_session_that_is_gone_stays_and_so_do_old_ones_from_the_archive(self):
        # the archive holds the old designs, the live journal a new one; the sessions "old-designer" and "x1" exist nowhere
        self.archive([wrote(1, "old-designer", p("d", "a", "land.html")), sent(2, "old-designer", p("d", "a", "land.pdf")),
                      wrote(3, "x1", p("d", "b", "logo.svg"))])
        self.live([wrote(4, "designer", p("d", "c", "new.html"))])
        got = self.paths(self.reg())
        self.assertEqual(sorted(got), ["land.html", "land.pdf", "logo.svg", "new.html"])
        self.assertEqual(got["land.pdf"]["session"], "old-designer")
        self.assertEqual(got["land.pdf"]["rank"], 1)    # sent to the owner
        self.assertEqual(got["land.html"]["rank"], 2)   # written with a tool

    def test_owner_file_is_kept_by_its_source_not_by_the_core_copy(self):
        src = p("d", "a", "deck.html")
        self.live([sent(1, "designer", src, copy=p("attachments", "9f", "deck.html")), sent(2, "designer", src, copy=p("attachments", "a0", "deck.html"))])
        rows = self.reg().listing()
        self.assertEqual([r["path"] for r in rows], [src])   # twice sent, one entry, the path of the source

    def test_a_core_copy_without_a_source_is_not_a_design_and_a_saved_one_is_dropped(self):
        copy = p("hub-core", "attachments", "c99385c97cc9", "index.html")
        self.live([ev(1, "owner.file", {"path": copy, "sender": "designer", "channel": "session", "owner": False}),
                   wrote(2, "designer", copy), sent(3, "designer", p("d", "a", "ok.html"))])
        self.assertEqual(sorted(self.paths(self.reg())), ["ok.html"])
        os.makedirs(os.path.join(self.tmp, "hub-design"), exist_ok=True)
        with open(os.path.join(self.tmp, "hub-design", "registry.json"), "w", encoding="utf-8") as f:
            json.dump({"v": 1, "seq": 99, "items": [{"path": copy, "session": "designer", "ts": 1, "last": 1, "rank": 1},
                                                    {"path": p("d", "a", "ok.html"), "session": "designer", "ts": 1, "last": 1, "rank": 1}]}, f)
        self.assertEqual(sorted(self.paths(self.reg())), ["ok.html"])

    def test_one_file_written_as_c_slash_and_c_backslash_is_one_design(self):
        if not WIN:
            self.skipTest("drive paths are native on Windows only")
        self.live([wrote(1, "designer", "C:\\Work\\Mock\\a.html"), sent(2, "designer", "c:/work/mock/A.html")])
        self.assertEqual(len(self.reg().listing()), 1)

    def test_an_edit_does_not_make_a_design_but_refreshes_one(self):
        self.live([wrote(1, "dev", p("d", "never.html"), "Edit"), wrote(2, "designer", p("d", "a.html")),
                   wrote(3, "designer", p("d", "a.html"), "Edit"), wrote(4, "designer", p("d", "a.html"), "MultiEdit")])
        got = self.paths(self.reg())
        self.assertEqual(list(got), ["a.html"])
        self.assertEqual(got["a.html"]["last"], 1004)
        self.assertEqual(got["a.html"]["ts"], 1002)   # the author and the creation time stay

    def test_the_sender_beats_a_writer_of_the_same_rank_by_time_and_a_send_beats_the_write_no(self):
        # rank 2 (written) wins over rank 1 (sent), then the fresher: the author is who wrote the file
        self.live([sent(1, "a", p("d", "x.html")), wrote(2, "b", p("d", "x.html")), wrote(3, "c", p("d", "x.html"))])
        x = self.paths(self.reg())["x.html"]
        self.assertEqual((x["session"], x["rank"], x["last"]), ("c", 2, 1003))

    def test_only_the_types_the_canvas_opens_and_no_scratch_files(self):
        self.live([wrote(1, "s", p("d", "a.png")), wrote(2, "s", p("d", "n.md")), wrote(3, "s", p("d", "deck.pptx")),
                   wrote(4, "s", p("node_modules", "x", "i.html")), wrote(5, "s", p(".git", "x.html")),
                   wrote(6, "s", p("d", "ok.HTM")),
                   wrote(7, "s", ("C:\\Users\\me\\AppData\\Local\\Temp\\t.html" if WIN else "/tmp/t.html")),
                   wrote(8, "s", "https://example.com/a.html"), wrote(9, "s", "a.html")])
        self.assertEqual(list(self.paths(self.reg())), ["ok.HTM"])

    def test_paths_of_the_other_os_are_not_kept(self):
        other = "/Users/me/design/a.html" if WIN else "C:\\Users\\me\\design\\a.html"
        mine = p("d", "b.html")
        self.live([wrote(1, "s", other), sent(2, "s", other), wrote(3, "s", mine)])
        self.assertEqual(list(self.paths(self.reg())), ["b.html"])

    def test_the_live_journal_is_followed_by_its_own_offset_and_a_half_line_waits(self):
        self.live([wrote(1, "s", p("d", "a.html"))])
        r = self.reg()
        with open(os.path.join(self.tmp, "journal.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(wrote(2, "s", p("d", "b.html")))[:40])   # a line the core is still writing
        r.poll()
        self.assertEqual(sorted(self.paths(r)), ["a.html"])
        self.live([wrote(1, "s", p("d", "a.html")), wrote(2, "s", p("d", "b.html")), wrote(3, "s", p("d", "c.html"))])   # (rewritten whole)
        r.offset = 0
        r.poll()
        self.assertEqual(sorted(self.paths(r)), ["a.html", "b.html", "c.html"])

    def test_after_a_rotation_what_went_to_the_archive_is_not_lost(self):
        self.live([wrote(1, "s", p("d", "a.html"))])
        r = self.reg()
        # events 2-3 landed in the live journal, were rotated into the archive before the next look; the live one starts anew with 4
        self.archive([wrote(1, "s", p("d", "a.html")), wrote(2, "s", p("d", "b.html")), wrote(3, "s", p("d", "c.html"))])
        os.remove(os.path.join(self.tmp, "journal.jsonl"))
        self.live([ev(10, "core.snapshot", {}), wrote(4, "s", p("d", "d.html"))])
        r.ino = -1   # (a new file has another identity)
        r.poll()
        self.assertEqual(sorted(self.paths(r)), ["a.html", "b.html", "c.html", "d.html"])

    def test_restart_keeps_the_file_and_reads_only_what_is_new(self):
        self.archive([wrote(1, "s", p("d", "a.html")), wrote(2, "s", p("d", "b.html"))])
        self.live([wrote(3, "s", p("d", "c.html"))])
        self.reg()
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "hub-design", "registry.json")))
        os.remove(os.path.join(self.tmp, "journal-archive", "journal-1-2.jsonl"))   # the archive is gone: the registry file remembers
        self.live([wrote(3, "s", p("d", "c.html")), wrote(4, "s", p("d", "e.html"))])
        self.assertEqual(sorted(self.paths(self.reg())), ["a.html", "b.html", "c.html", "e.html"])

    def test_a_broken_registry_file_is_rebuilt_from_the_journal(self):
        self.live([wrote(1, "s", p("d", "a.html"))])
        os.makedirs(os.path.join(self.tmp, "hub-design"))
        with open(os.path.join(self.tmp, "hub-design", "registry.json"), "w") as f:
            f.write("{not json")
        self.assertEqual(list(self.paths(self.reg())), ["a.html"])

    def test_only_the_freshest_are_kept(self):
        with unittest.mock.patch.object(registry, "KEEP", 3):
            self.live([wrote(i, "s", p("d", f"{i}.html")) for i in range(1, 8)])
            r = self.reg()
            with open(r.path, encoding="utf-8") as f:
                saved = json.load(f)
        self.assertEqual(sorted(os.path.basename(x["path"]) for x in saved["items"]), ["5.html", "6.html", "7.html"])

    def test_folders_are_the_design_dirs_but_never_a_wide_one(self):
        deep = os.path.join(self.tmp, "proj", "design", "v1")
        os.makedirs(deep)
        wide = os.path.expanduser("~")
        r = registry.Registry(self.tmp)   # (the temp folder of a test is a scratch place for the journal reader: the entries are put in by hand)
        for name, path in (("a", os.path.join(deep, "a.html")), ("w", os.path.join(wide, "loose.html")), ("m", os.path.join(self.tmp, "missing-dir", "b.html"))):
            r.items[registry.key_of(path)] = {"path": path, "session": "s", "ts": 1, "last": 1, "rank": 2}
        self.assertEqual(r.folders(), [deep])

    def test_report_counts_without_writing(self):
        self.archive([wrote(1, "a", p("d", "a.html"))])
        self.live([wrote(2, "b", p("d", "b.html"))])
        with unittest.mock.patch("builtins.print"):
            rows = registry.report(self.tmp)
        self.assertEqual(len(rows), 2)
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "hub-design")))


class Tasks(Registry):
    """A design belongs to the task it was made for: the root of the chain of tasks, found in the journal."""

    def of(self, events):
        self.live(events)
        r = self.reg()
        return r, {k: v.get("task") for k, v in self.paths(r).items()}

    def test_a_design_written_in_the_turn_of_a_task_belongs_to_it(self):
        r, got = self.of([raised(10, "designer", "hub-core", title="Баннер Ouch"), turn(11, "designer", "m10"),
                          wrote(12, "designer", p("d", "a.html")), sent(13, "designer", p("d", "b.pdf"))])
        self.assertEqual(got, {"a.html": "d10", "b.pdf": "d10"})
        self.assertEqual([(t["id"], t["title"], t["by"], t["who"]) for t in r.task_rows()], [("d10", "Баннер Ouch", "hub-core", "designer")])

    def test_a_subtask_belongs_to_the_root_of_the_chain_and_every_round_stays_in_it(self):
        _, got = self.of([raised(10, "rewarded", "hub-core", title="Ролик Ouch"), turn(11, "rewarded", "m10"),
                          raised(12, "designer", "rewarded"), turn(13, "designer", "m12"), wrote(14, "designer", p("d", "r1.html")),
                          # the result comes back to the director in a turn that names the subtask, the next round goes through it
                          turn(15, "rewarded", "m15", "[hub:m15 от designer, ответ на задачу d12] готово"),
                          raised(16, "designer", "rewarded"), turn(17, "designer", "m16"), wrote(18, "designer", p("d", "r2.html"))])
        self.assertEqual(got, {"r1.html": "d10", "r2.html": "d10"})

    def test_a_turn_that_names_a_task_continues_it_and_another_message_ends_it_and_a_wake_up_keeps_it(self):
        _, got = self.of([raised(10, "designer", "hub-core", title="T"), turn(11, "designer", "m10"), wrote(12, "designer", p("d", "a.html")),
                          turn(13, "designer", "m13", "[hub:m13 от ядра] Задача d10 открыта, а ты свободна"), wrote(14, "designer", p("d", "b.html")),
                          ev(15, "turn.started", {"marker": "m15", "prompt_head": "<task-notification>фон кончился</task-notification>"}, "designer"),
                          wrote(16, "designer", p("d", "c.html")),
                          turn(17, "designer", "m17", "[hub:m17 от владельца] нарисуй лого"), wrote(18, "designer", p("d", "d.html"))])
        self.assertEqual(got, {"a.html": "d10", "b.html": "d10", "c.html": "d10", "d.html": None})

    def test_a_design_without_a_task_is_just_a_design(self):
        _, got = self.of([wrote(1, "designer", p("d", "free.html"))])
        self.assertEqual(got, {"free.html": None})

    def test_the_title_comes_from_the_task_or_its_words_and_a_later_title_wins(self):
        r, _ = self.of([raised(10, "designer", "x", context="--title Ролик для Ouch. Сверстай три баннера и пришли"), turn(11, "designer", "m10"),
                        wrote(12, "designer", p("d", "a.html")),
                        raised(20, "designer", "x", context="Сделай лендинг для распродажи " + "очень " * 30), turn(21, "designer", "m20"),
                        wrote(22, "designer", p("d", "b.html")),
                        ev(23, "task.noted", {"text": "n", "title": "Лендинг BF"}, "d20")])
        titles = {t["id"]: t["title"] for t in r.task_rows()}
        self.assertEqual(titles["d10"], "Ролик для Ouch")
        self.assertEqual(titles["d20"], "Лендинг BF")
        self.assertTrue(len(registry.clean_title("слово " * 40)) <= registry.TITLE_MAX + 1)

    def test_the_tasks_survive_a_restart_and_an_old_registry_is_read_again(self):
        self.live([raised(10, "designer", "hub-core", title="T"), turn(11, "designer", "m10"), wrote(12, "designer", p("d", "a.html"))])
        self.reg()
        self.live([wrote(13, "designer", p("d", "b.html"))], "a")   # the turn of the task was before the restart
        r = self.reg()
        self.assertEqual({k: v.get("task") for k, v in self.paths(r).items()}, {"a.html": "d10", "b.html": "d10"})
        with open(r.path, encoding="utf-8") as f:
            saved = json.load(f)
        saved["v"] = 1
        saved["items"] = [{k: v for k, v in it.items() if k != "task"} for it in saved["items"]]
        with open(r.path, "w", encoding="utf-8") as f:
            json.dump(saved, f)
        self.assertEqual({k: v.get("task") for k, v in self.paths(self.reg()).items()}, {"a.html": "d10", "b.html": "d10"})

    def test_a_task_in_the_archive_is_found(self):
        self.archive([raised(10, "designer", "hub-core", title="T"), turn(11, "designer", "m10")])
        self.live([ev(30, "core.snapshot", {}), wrote(31, "designer", p("d", "a.html"))])
        self.assertEqual(self.paths(self.reg())["a.html"].get("task"), "d10")


if __name__ == "__main__":
    unittest.main()
