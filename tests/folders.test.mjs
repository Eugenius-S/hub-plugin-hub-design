import { test } from "node:test";
import assert from "node:assert/strict";
import { directionDirs, dirKey, folderOf, groupFiles, saveDirOf, saveLine } from "../lib.js";
import { PREVIEWS, folderTitle, newest, view } from "../dashboard.js";
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

test("the line for the designer: the folder design/ of the direction, in both languages, for / and \\ paths", () => {
  assert.equal(saveLine(""), "");
  assert.equal(saveLine("/p/Ads"), "Save it in the direction folder: /p/Ads/design/<design-name>/ (index.html, assets next to it), not in your own working folder.");
  assert.match(saveLine("/p/Ads/"), /\/p\/Ads\/design\/</);
  assert.match(saveLine("C:\\Work\\Ads"), /C:\\Work\\Ads\\design\//);
  lang("ru");
  assert.equal(saveLine("/p/Ads"), "Сохрани в папку направления: /p/Ads/design/<имя-макета>/ (index.html, ресурсы рядом), не в свою рабочую папку.");
});

test("folder title: the direction label, 'No direction' for the rest", () => {
  assert.equal(folderTitle("/p/Gen", dirs), "gen-y2k");
  assert.equal(folderTitle("", dirs), "No direction");
  lang("ru");
  assert.equal(folderTitle("", dirs), "Без направления");
});

// --- task folders: every design made for one task of the owner lies in one folder ---
import { taskFolders, folderKeyOf, isTaskKey, taskOfKey, taskTitle, taskSlug, taskDir, taskLine, TASK_MIN } from "../lib.js";

const tasks = [{ id: "d10", title: "Rewarded video for Ouch", by: "ads-a" }];

test("task folders: a task with two designs gets a folder, one design stays where its file lies", () => {
  const files = [{ path: "/p/Ads/design/a/index.html", task: "d10" }, { path: "/p/Gen/design/b/index.html", task: "d10" }, { path: "/p/Ads/design/c/index.html", task: "d11" }, { path: "/p/Ads/design/d/index.html" }];
  const set = taskFolders(files);
  assert.equal(TASK_MIN, 2);
  assert.deepEqual([...set], ["d10"]);
  assert.equal(folderKeyOf(files[0], dirs, set), "task:d10");
  assert.equal(folderKeyOf(files[1], dirs, set), "task:d10");
  assert.equal(folderKeyOf(files[2], dirs, set), "/p/Ads");
  assert.equal(folderKeyOf(files[3], dirs, set), "/p/Ads");
  assert.ok(isTaskKey("task:d10") && !isTaskKey("/p/Ads") && !isTaskKey(""));
  assert.equal(taskOfKey("task:d10"), "d10");
  assert.equal(taskOfKey("/p/Ads"), "");
});

test("task folders: groups and view put the designs of the task into one tile with the task title", () => {
  const files = [{ path: "/p/Ads/design/a/index.html", task: "d10", last: 5 }, { path: "/p/Gen/design/b/index.html", task: "d10", last: 9 }, { path: "/p/Ads/design/c/index.html", last: 1 }];
  const set = taskFolders(files);
  const g = groupFiles(files, dirs, set);
  assert.deepEqual(g.map((x) => x.key), ["task:d10", "/p/Ads"]);
  assert.equal(g[0].files.length, 2);
  assert.equal(g[0].task, "d10");
  assert.equal(g[1].task, "");
  assert.equal(view(files, dirs, { tasks: set }).mode, "folders");
  assert.deepEqual(view(files, dirs, { folder: "task:d10", tasks: set }).rows.map((f) => f.path), [files[0].path, files[1].path]);
  assert.equal(view(files, dirs, { q: "a", tasks: set }).mode, "files");
  assert.equal(folderTitle("task:d10", dirs, tasks), "Rewarded video for Ouch");
  assert.equal(folderTitle("task:d99", dirs, tasks), "d99");        // no title yet: the id
  assert.equal(taskTitle("d10", tasks), "Rewarded video for Ouch");
});

test("task folders: a task without direction folders still makes tiles; no tasks - the flat list as before", () => {
  const files = [{ path: "/x/a/index.html", task: "d10" }, { path: "/x/b/index.html", task: "d10" }];
  assert.equal(view(files, [], { tasks: taskFolders(files) }).mode, "folders");
  assert.equal(view(files, [], {}).mode, "files");
});

test("the folder of a task on disk: <direction>/design/<title>/, and the line for the designer", () => {
  assert.equal(taskSlug("Rewarded video for Ouch"), "Rewarded-video-for-Ouch");
  assert.equal(taskSlug("Ролик «Rewarded» для Ouch!"), "Ролик-Rewarded-для-Ouch");
  assert.ok(taskSlug("a".repeat(30) + " " + "b".repeat(30)).length <= 40);
  assert.equal(taskDir("/p/Ads/", "Rewarded video"), "/p/Ads/design/Rewarded-video/");
  assert.equal(taskDir("C:\\p\\Ads", "Rewarded video"), "C:\\p\\Ads\\design\\Rewarded-video\\");
  assert.equal(taskDir("", "x"), "");
  assert.equal(taskDir("/p/Ads", ""), "/p/Ads/design/task/");
  assert.match(taskLine("/p/Ads/design/Rewarded-video/"), /\/p\/Ads\/design\/Rewarded-video\//);
  assert.equal(taskLine(""), "");
  lang("ru");
  assert.match(taskLine("/p/Ads/design/Rewarded-video/"), /задач/);
});
