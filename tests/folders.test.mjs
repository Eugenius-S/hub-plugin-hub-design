import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardFiles, directionDirs, dirKey, folderOf, gistOf, groupFiles, kindOf, labelsOf, saveDirOf, saveLine } from "../lib.js";
import { PREVIEWS, folderTitle, newest, shown, view } from "../dashboard.js";
import { setLangSource } from "../i18n.js";

const lang = (l) => setLangSource(() => l);
test.beforeEach(() => lang("en"));

const sessions = [
  { name: "hub-core", kind: "hub", role: "hub", cwd: "/h/hub-home" },
  { name: "designer", kind: "agent", role: "agent", cwd: "/h/design" },
  { name: "ads-a", role: "worker", cwd: "/p/Ads" },
  { name: "ads-b", role: "worker", cwd: "/p/Ads/" },
  { name: "gen-y2k", role: "worker", cwd: "/p/Gen" },
  { name: "gen-aero", role: "worker", cwd: "/p/Gen/MJ/Aero" },
  { name: "ex1", role: "executor", cwd: "/p/Ads/.claude/worktrees/ex1" },
  { name: "odd", role: "agent", cwd: "/p/Odd" },
];
const dirs = directionDirs(sessions, ["odd"]);

test("directions: workers and snapshot.directions, one folder per cwd; the hub, specialists and executors are not directions", () => {
  assert.deepEqual(dirs.map((d) => d.key).sort(), ["/p/Ads", "/p/Gen", "/p/Gen/MJ/Aero", "/p/Odd"]);
  assert.equal(dirs.find((d) => d.key === "/p/Gen").label, "gen-y2k");      // a lone direction names its folder
  assert.equal(dirs.find((d) => d.key === "/p/Ads").label, "Ads");          // several directions of one project - the folder name
  assert.deepEqual(dirs.find((d) => d.key === "/p/Ads").names, ["ads-a", "ads-b"]);
});

test("a design belongs to the deepest direction folder; elsewhere - no direction", () => {
  assert.equal(folderOf("/p/Gen/MJ/Aero/x/index.html", dirs), "/p/Gen/MJ/Aero");
  assert.equal(folderOf("/p/Gen/design/x/index.html", dirs), "/p/Gen");
  assert.equal(folderOf("/p/Ads/.claude/worktrees/ex1/design/a.html", dirs), "/p/Ads");
  assert.equal(folderOf("/p/Genie/a.html", dirs), "");   // a folder prefix is not a name prefix
  assert.equal(folderOf("/h/design/hub-design/a.html", dirs), "");
  assert.equal(folderOf("C:\\Work\\Ads\\a.html", directionDirs([{ name: "w", role: "worker", cwd: "C:\\Work\\ads" }])), "C:/Work/ads");
});

test("groups: newest folder first, 'no direction' last", () => {
  const files = [
    { path: "/h/design/a/index.html", last: 900 },
    { path: "/p/Gen/design/b/index.html", last: 300 },
    { path: "/p/Ads/design/c/index.html", last: 500 },
    { path: "/p/Ads/design/d/index.html", last: 100 },
  ];
  const g = groupFiles(files, dirs);
  assert.deepEqual(g.map((x) => x.key), ["/p/Ads", "/p/Gen", ""]);
  assert.equal(g[0].files.length, 2);
  assert.equal(g[0].dir.label, "Ads");
  assert.equal(g[2].dir, null);
});

test("newest: the last PREVIEWS designs, newest first", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ path: "/p/Ads/" + i, last: i * 10 }));
  assert.equal(PREVIEWS, 4);
  assert.deepEqual(newest(rows).map((f) => f.last), [60, 50, 40, 30]);
});

test("view: folders only when there are direction folders, no search and no open folder", () => {
  const rows = [{ path: "/p/Ads/design/a/index.html", last: 1 }, { path: "/h/design/b/index.html", last: 2 }];
  assert.equal(view(rows, dirs).mode, "folders");
  assert.equal(view(rows, dirs, { q: "a" }).mode, "files");                 // a search looks through everything
  assert.equal(view(rows, []).mode, "files");                                // no directions - the flat list as before
  assert.equal(view([rows[1]], dirs).mode, "files");                         // nothing in a direction folder - no folder tiles
  assert.deepEqual(view(rows, dirs, { folder: "/p/Ads" }).rows.map((f) => f.path), [rows[0].path]);
  assert.deepEqual(view(rows, dirs, { folder: "" }).rows.map((f) => f.path), [rows[1].path]);
});

test("where a new design goes: the cwd of a direction session, nowhere for the hub, specialists and executors", () => {
  assert.equal(saveDirOf("ads-a", sessions, []), "/p/Ads");
  assert.equal(saveDirOf("gen-aero", sessions, []), "/p/Gen/MJ/Aero");
  for (const n of ["hub-core", "designer", "ex1", "nobody", ""]) assert.equal(saveDirOf(n, sessions, []), "", n);
  assert.equal(dirKey("C:\\A\\B\\"), "C:/A/B");
});

test("the line for the designer: a task folder in design/ of the direction, none - in the designer's folder, both languages, / and \\ paths", () => {
  assert.equal(saveLine(""), "");
  assert.equal(saveLine("/p/Ads"), "Save it in a task folder of the direction: /p/Ads/design/<task>/ (<task> - a short Latin kind-gist name, like poster-bf-sale), every variant and round in a folder of its own inside: <design-name>-1a/index.html, its assets inside; not in your own working folder.");
  assert.match(saveLine("/p/Ads/"), /\/p\/Ads\/design\/<task>\//);
  assert.match(saveLine("C:\\Work\\Ads"), /C:\\Work\\Ads\\design\/</);
  assert.match(saveLine("", "/u/design"), /a task folder: \/u\/design\/<task>\/ .*<design-name>-1a\/index\.html/);
  assert.doesNotMatch(saveLine("", "/u/design"), /design\/design/);
  lang("ru");
  assert.match(saveLine("/p/Ads"), /^Сохрани в папку задачи направления: \/p\/Ads\/design\/<задача>\/ .*<имя-макета>-1a\/index\.html/);
  assert.match(saveLine("", "/u/design"), /^Сохрани в папку задачи: \/u\/design\/<задача>\//);
});

test("folder title: the direction label, 'No direction' for the rest", () => {
  assert.equal(folderTitle("/p/Gen", dirs), "gen-y2k");
  assert.equal(folderTitle("", dirs), "No direction");
  lang("ru");
  assert.equal(folderTitle("", dirs), "Без направления");
});

// --- tasks: the top level is the directions only; a task is a subfolder inside its direction ---
import { layoutOf, subGroups, isTaskKey, taskOfKey, taskTitle, shortTitle, taskSlug, taskDir, taskLine, placeOf, message, TASK_MIN } from "../lib.js";

const tasks = [{ id: "d10", title: "Rewarded video for Ouch", by: "ads-a" }];

test("layout: a task with two designs in a direction is a subfolder there, one design stays loose; the top key is always the direction", () => {
  const files = [{ path: "/p/Ads/design/a/index.html", task: "d10" }, { path: "/p/Ads/design/b/index.html", task: "d10" }, { path: "/p/Gen/design/c/index.html", task: "d10" }, { path: "/p/Ads/design/d/index.html", task: "d11" }, { path: "/p/Ads/design/e/index.html" }];
  const lay = layoutOf(files, dirs);
  assert.equal(TASK_MIN, 2);
  assert.deepEqual(files.map((f) => lay.top.get(f.path)), ["/p/Ads", "/p/Ads", "/p/Gen", "/p/Ads", "/p/Ads"]);
  assert.deepEqual(files.map((f) => lay.sub.get(f.path) || ""), ["task:d10", "task:d10", "", "", ""]);   // d10 has one design in Gen: no subfolder there
  assert.ok(isTaskKey("task:d10") && !isTaskKey("/p/Ads") && !isTaskKey(""));
  assert.equal(taskOfKey("task:d10"), "d10");
  assert.equal(taskOfKey("/p/Ads"), "");
});

test("tiles: the top tiles are the directions, a task is a tile inside; the layout does not change with a search", () => {
  const files = [{ path: "/p/Ads/design/a/index.html", task: "d10", last: 5 }, { path: "/p/Ads/design/b/index.html", task: "d10", last: 9 }, { path: "/p/Ads/design/c/index.html", last: 1 }, { path: "/p/Gen/design/g/index.html", task: "d10", last: 3 }];
  const g = groupFiles(files, dirs);
  assert.deepEqual(g.map((x) => x.key), ["/p/Ads", "/p/Gen"]);
  assert.equal(g[0].files.length, 3);
  const top = view(files, dirs, {});
  assert.equal(top.mode, "folders");
  const inAds = view(files, dirs, { folder: "/p/Ads" });
  assert.equal(inAds.mode, "files");
  assert.deepEqual(inAds.subs.map((x) => [x.key, x.files.length]), [["task:d10", 2]]);
  assert.deepEqual(inAds.rows.map((f) => f.path), ["/p/Ads/design/c/index.html"]);
  assert.deepEqual(view(files, dirs, { folder: "/p/Ads", sub: "task:d10" }).rows.map((f) => f.path), [files[0].path, files[1].path]);
  assert.equal(view(files, dirs, { q: "a" }).mode, "files");
  assert.equal(folderTitle("task:d10", dirs, tasks), "Rewarded video for Ouch");
  assert.equal(folderTitle("task:d99", dirs, tasks), "d99");        // no title yet: the id
  assert.equal(taskTitle("d10", tasks), "Rewarded video for Ouch");
  const lay = layoutOf(files, dirs);
  const sg = subGroups(files.filter((f) => lay.top.get(f.path) === "/p/Ads"), lay);
  assert.equal(sg.loose.length, 1);
});

test("a task title on a tile is short: the path and the long tail are cut", () => {
  assert.equal(shortTitle("Ouch, beat 8 (rewarded-ads), texts: D:/work/x/y"), "Ouch, beat 8 (rewarded-ads), texts");
  assert.equal(shortTitle("Poster: /Users/o/design/poster"), "Poster");
  assert.equal(shortTitle("Poster of the Black Friday sale"), "Poster of the Black Friday sale");
  const long = shortTitle("A very long title that goes on and on for many many words indeed yes");
  assert.ok(long.length <= 49 && long.endsWith("\u2026"));
  assert.equal(shortTitle(""), "");
  assert.equal(folderTitle("task:d1", dirs, [{ id: "d1", title: "Ouch: C:\\work\\x" }]), "Ouch");
});

test("no direction folders at all: the 'no direction' place opens at once - its tasks are tiles, the rest cards; no tasks - the flat list as before", () => {
  const files = [{ path: "/x/a/index.html", task: "d10" }, { path: "/x/b/index.html", task: "d10" }, { path: "/x/c/index.html" }];
  const v = view(files, [], {});
  assert.equal(v.mode, "files");
  assert.deepEqual(v.subs.map((x) => x.key), ["task:d10"]);
  assert.equal(v.rows.length, 1);
  const flat = view([{ path: "/x/a/index.html" }], [], {});
  assert.equal(flat.mode, "files");
  assert.equal(flat.subs.length, 0);
  assert.equal(flat.rows.length, 1);
});

test("the folder of a task on disk: <direction>/design/<latin slug>/, none - <designer>/<slug>/, and the line for the designer", () => {
  assert.equal(taskSlug("Rewarded video for Ouch"), "rewarded-video-ouch");
  assert.equal(taskSlug("Постер к Чёрной пятнице"), "poster-chernoy-pyatnitse");   // the same as slug() of layout.py
  assert.equal(taskSlug("Story for Kyoto: the sale!"), "story-kyoto-sale");
  assert.ok(taskSlug("a very long title ".repeat(10)).length <= 32);
  assert.equal(taskSlug(""), "");
  assert.equal(taskDir("/p/Ads/", "Rewarded video"), "/p/Ads/design/rewarded-video/");
  assert.equal(taskDir("C:\\p\\Ads", "Rewarded video"), "C:\\p\\Ads\\design\\rewarded-video\\");
  assert.equal(taskDir("", "x"), "");
  assert.equal(taskDir("", "Story Kyoto", "/u/design"), "/u/design/story-kyoto/");
  assert.equal(taskDir("/p/Ads", ""), "/p/Ads/design/task/");
  assert.match(taskLine("/p/Ads/design/rewarded-video/"), /\/p\/Ads\/design\/rewarded-video\/, .*<design-name>-1a\/index\.html/);
  assert.equal(taskLine(""), "");
  lang("ru");
  assert.match(taskLine("/p/Ads/design/rewarded-video/"), /задач/);
});

test("the task folder of a design: its own folder's parent for index.html, its own folder for a loose file", () => {
  assert.equal(placeOf("/p/Ads/design/sale/banner-1a/index.html"), "/p/Ads/design/sale/");
  assert.equal(placeOf("/p/Ads/design/sale/deck.pdf"), "/p/Ads/design/sale/");
  assert.equal(placeOf("C:\\a\\t\\x.html"), "C:\\a\\t\\");
  assert.equal(placeOf("x.html"), "");
  const m = message({ path: "/p/Ads/design/sale/banner-1a/index.html", round: 1, view: { w: 1, h: 1 }, comments: [{ x: 1, y: 1, w: 1, h: 1, text: "bigger" }], changes: [], place: true });
  assert.match(m, /The next round of this design goes into the same task folder \/p\/Ads\/design\/sale\/ as a folder of its own: <design-name>-<round>\/index\.html/);
  assert.doesNotMatch(message({ path: "/p/x/index.html", round: 1, view: { w: 1, h: 1 }, comments: [{ x: 1, y: 1, w: 1, h: 1, text: "b" }], changes: [] }), /next round/);
});

// --- labels: "<kind>-<N>: <gist>" -----------------------------------------------------------------------------------------------------
test("label: the kind from the title, the gist from the part next to it, the number by time inside the folder", () => {
  const f = (key, title, path, ts, group = "g") => ({ key, title, path, ts, group });
  const L = labelsOf([
    f("c", "Welcome email: Busy", "/p/offer/index.html", 30),
    f("a", "Email 1 — Kyoto", "/p/end-2.html", 10),
    f("b", "Black Friday post 01, 50% off", "/p/bf/index.html", 20),
    f("d", "Email 3 · Ocean", "/p/o.html", 40, "other"),   // another folder counts from 1 again
  ]);
  assert.equal(L.get("a"), "Email-1: Kyoto");
  assert.equal(L.get("c"), "Email-2: Busy");   // later than "a": the number follows the time, not the order of the list
  assert.equal(L.get("b"), "Post-1: 50% off");
  assert.equal(L.get("d"), "Email-1: Ocean");
});

test("label: no title - the kind and the gist from the file name without round numbers; no kind - a design", () => {
  assert.equal(kindOf("", "/p/welcome-email-2.html"), "email");
  assert.equal(gistOf("", "/p/welcome-email-2.html"), "welcome");
  assert.equal(labelsOf([{ key: "x", title: "", path: "/p/start-3.html", ts: 1 }]).get("x"), "Design-1: start");
  assert.equal(labelsOf([{ key: "x", title: "", path: "/p/offer/index.html", ts: 1 }]).get("x"), "Design-1: offer");
  assert.equal(labelsOf([{ key: "x", title: "", path: "/p/r2.html", ts: 1 }]).get("x"), "Design-1");   // nothing left but a round number
});

test("label: the gist is short - three words, 26 characters; a kind word inside another word is not a kind", () => {
  assert.equal(gistOf("Story 2 · Free gifts for everybody right now", "").split(" ").length, 3);
  assert.ok(gistOf("Post, " + "Supercalifragilisticexpialidocious".repeat(2), "").length <= 26);
  assert.equal(kindOf("The history of poster art", ""), "poster");   // "history" is not a story
  assert.equal(kindOf("Postcard", ""), "");
  assert.equal(kindOf("Loading screen", ""), "screen");
});

test("label: the kind is named in the hub language, the rest stays as the design wrote it", () => {
  lang("ru");
  assert.equal(labelsOf([{ key: "p", title: "Post 2, Распродажа 50%", path: "/p/a.html", ts: 1 }]).get("p"), "Пост-1: Распродажа 50%");
  assert.equal(labelsOf([{ key: "p", title: "Баннер: Лето", path: "/p/a.html", ts: 1 }]).get("p"), "Баннер-1: Лето");
  assert.equal(labelsOf([{ key: "p", title: "", path: "/p/a.html", ts: 1 }]).get("p"), "Макет-1: a");
});

test("label: the dashboard list carries the title of the registry, and the search and the name sort go by the label", () => {
  const files = dashboardFiles([{ path: "/p/a/index.html", session: "designer", ts: 1 }], [], ["/p"], {
    registry: [{ path: "/p/a/index.html", ts: 1, title: "Email 1, Kyoto" }, { path: "/p/b.html", ts: 2, title: "Post 1, Sale" }],
  });
  assert.deepEqual(files.map((x) => x.title), ["Email 1, Kyoto", "Post 1, Sale"]);   // the feed one gets the title from the registry too
  const labels = labelsOf(files.map((x) => ({ key: x.path, title: x.title, path: x.path, ts: x.ts })));
  assert.deepEqual(shown(files, { q: "kyoto", labels }).map((x) => x.path), ["/p/a/index.html"]);
  assert.deepEqual(shown(files, { q: "post-1", labels }).map((x) => x.path), ["/p/b.html"]);
  assert.deepEqual(shown(files, { sort: "name", labels }).map((x) => labels.get(x.path)), ["Email-1: Kyoto", "Post-1: Sale"]);
});

test("a design saved to design/<project>/ goes to the direction of that name; the words decide, never a guess", async () => {
  const { homeOf, projectOf, nearestDir } = await import("../lib.js");
  const ds = directionDirs([
    { name: "ads", role: "worker", cwd: "/p/Ads" },
    { name: "rewarded-ads", role: "worker", cwd: "/p/Rewarded-ads" },
    { name: "icons8-smm", role: "worker", cwd: "/p/smm" },
  ]);
  assert.equal(projectOf("/h/design/ads-ouch-templates/a.html"), "ads-ouch-templates");
  assert.equal(projectOf("/h/design/a.html"), "");                                   // right in design: no project
  assert.equal(homeOf({ path: "/h/design/ads-ouch-templates/a.html" }, ds), "/p/Ads");   // the nearer direction: fewer foreign words
  assert.equal(homeOf({ path: "/h/design/Rewarded_ads/b.html" }, ds), "/p/Rewarded-ads");
  assert.equal(homeOf({ path: "/h/design/!Ads/c.html" }, ds), "/p/Ads");            // case, "!", "_" and "-" do not matter
  assert.equal(homeOf({ path: "/h/design/icons8-smm/d.html" }, ds), "/p/smm");
  assert.equal(homeOf({ path: "/h/design/threads-weekly/e.html" }, ds), "");         // no common word: stays without a direction
  const raised = [{ id: "d5", title: "Pack", by: "hub-core", dir: "icons8-smm", who: "designer" }];
  assert.equal(homeOf({ path: "/h/design/pack2/g.html", session: "designer", task: "d5" }, ds, raised), "/p/smm");   // the hub named the direction of the task
  assert.equal(homeOf({ path: "/h/design/misc/f.html", title: "Rewarded ads: new offer" }, ds), "/p/Rewarded-ads");   // the title
  assert.equal(homeOf({ path: "/h/design/misc/ads-banner.html" }, ds), "/p/Ads");    // the file name
  assert.equal(nearestDir("ads", directionDirs([{ name: "ads-a", role: "worker", cwd: "/p/A" }, { name: "ads-b", role: "worker", cwd: "/p/B" }])), "");   // two equal: no guess
  // what the file's own folder, its author or its task already say is not touched
  assert.equal(homeOf({ path: "/p/Rewarded-ads/design/ads-x/a.html" }, ds), "/p/Rewarded-ads");
  assert.equal(homeOf({ path: "/h/design/ads-x/a.html", session: "icons8-smm" }, ds), "/p/smm");
});

// the designer of a Windows machine saves to C:\Users\o\design\<folder>\: the folder names are not the names of the directions, the words and their beginnings decide
const winDirs = () => directionDirs([
  { name: "rewarded-ads", role: "worker", cwd: "D:\\Work\\Rewarded-ads Ouch, bit 8" },
  { name: "ai-animations", role: "worker", cwd: "D:\\Work\\AI animations" },
  { name: "ads-timetracker", role: "worker", cwd: "D:\\Work\\!Ads" },
  { name: "icons8-smm", role: "worker", cwd: "D:\\Work\\icons8-smm" },
  { name: "hub-work", role: "worker", cwd: "D:\\Work\\Agent-hub" },
]);

test("Windows folders of the designer: the table folder -> direction", async () => {
  const { homeOf } = await import("../lib.js");
  const ds = winDirs();
  const where = (folder, title = "") => (ds.find((d) => d.key === homeOf({ path: `C:\\Users\\o\\design\\${folder}\\index.html`, title }, ds)) || {}).label || "";
  const table = [
    ["ouch-templates", "rewarded-ads"], ["ouch-sb", "rewarded-ads"],
    ["ai-anim-summary", "ai-animations"], ["ai-animations-report", "ai-animations"], ["anim-dashboard", "ai-animations"],
    ["hd-motion", "hub-work"], ["hd-spacing", "hub-work"], ["hub-design-carpets", "hub-work"], ["hub-recap", "hub-work"], ["hub-spacing", "hub-work"],
    ["motion-loader", ""],      // no word of it is in a direction: nothing, the author or the task say more
    ["sidekick-c", ""],
    ["hub", ""],                // "hub" alone is no sign
    ["style-previews", ""],
  ];
  for (const [folder, label] of table) assert.equal(where(folder), label, folder);
  assert.equal(where("style-previews", "Hub Design: style previews"), "hub-work");   // the title says it
  assert.equal(where("motion-loader", "Animation loader, A"), "ai-animations");
});

test("the beginning of a word matches only from four signs, the exact word wins, two equal directions - nothing", async () => {
  const { nearestDir } = await import("../lib.js");
  const ds = directionDirs([{ name: "ai-animations", role: "worker", cwd: "/p/AI animations" }, { name: "animals", role: "worker", cwd: "/p/animals" }]);
  assert.equal(nearestDir("anim-x", ds), "");                // "anim" begins both: no guess
  assert.equal(nearestDir("animation-x", ds), "/p/AI animations");
  assert.equal(nearestDir("ani-x", ds), "");                 // three signs are not a beginning
  assert.equal(nearestDir("animals-x", ds), "/p/animals");
  assert.equal(nearestDir("hub-recap", ds), "");             // no hub direction: none
});

test("a folder no direction owns goes to the direction that asked for the task named like it (ouch-templates - the task Rewarded-ads Ouch), the nearest alone", async () => {
  const { homeOf, taskNear } = await import("../lib.js");
  const ds = directionDirs([{ name: "ai-animations", role: "worker", cwd: "/p/AI animations" }, { name: "icons8-smm", role: "worker", cwd: "/p/icons8-smm" }, { name: "rewarded-ads", role: "worker", cwd: "/p/Rewarded" }]);
  const rows = [{ id: "d1", title: "Rewarded-ads Ouch, beat 8, EN", by: "rewarded-ads", who: "writer" }, { id: "d2", title: "Pulse landing, round 2", by: "icons8-smm", who: "" }, { id: "d3", title: "Pulse card", by: "designer", who: "" }];
  const key = (path, title = "") => homeOf({ path, title }, ds, rows);
  assert.equal(key("C:\\o\\design\\ouch-templates\\v3\\a.html"), "/p/Rewarded");
  assert.equal(key("C:\\o\\design\\ouch-sb\\a.html"), "/p/Rewarded");
  assert.equal(key("C:\\o\\design\\ouch-templates\\tenner-post-a.html"), "/p/Rewarded");   // the project folder speaks before the file name ("post" is a word of a direction)
  assert.equal(key("C:\\o\\design\\misc\\a.html", "Ouch email"), "/p/Rewarded");
  assert.equal(key("C:\\o\\design\\misc\\a.html"), "");
  assert.equal(taskNear("ouch pulse", rows, ds), "");                                       // two directions equally near - nothing
  assert.equal(taskNear("pulse", rows, ds), "/p/icons8-smm");                                // a task of a session that is no direction (d3) points nowhere
  assert.equal(key("C:\\o\\design\\ai-anim\\a.html"), "/p/AI animations");           // a direction speaks before a task
});

test("moved designs: a moved file and everything under a moved folder get the new path, in values and keys; the rest stays", async () => {
  const { movedPath, moveAll } = await import("../lib.js");
  const mv = { files: { "/a/x.html": "/a/design/t/x/index.html", "c:/w/y.html": "C:/w/t/y/index.html" }, dirs: { "/a/kolo": "/b/design/p/kolo" } };
  assert.equal(movedPath("/a/x.html", mv), "/a/design/t/x/index.html");
  assert.equal(movedPath("C:\\w\\y.html", mv), "C:/w/t/y/index.html");
  assert.equal(movedPath("/a/kolo/index.html", mv), "/b/design/p/kolo/index.html");
  assert.equal(movedPath("/a/kolo2/index.html", mv), "/a/kolo2/index.html");
  assert.equal(movedPath("/z.html", null), "/z.html");
  const [b, ch] = moveAll({ frames: [{ path: "/a/x.html", sel: "div" }], pins: [{ file: "/a/kolo/index.html", text: "/a/x.html is mine" }], writers: { "/a/x.html": { copy: "/a/x.r1.html" } } }, mv);
  assert.ok(ch);
  assert.deepEqual(b, { frames: [{ path: "/a/design/t/x/index.html", sel: "div" }], pins: [{ file: "/b/design/p/kolo/index.html", text: "/a/x.html is mine" }], writers: { "/a/design/t/x/index.html": { copy: "/a/x.r1.html" } } });
  assert.deepEqual(moveAll({ a: ["/q.html"] }, mv), [{ a: ["/q.html"] }, false]);
});
