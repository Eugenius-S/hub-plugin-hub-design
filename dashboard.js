// Hub Design: the start screen, like the Claude Design dashboard: a title, tabs "All / Mine / Others", search, view and sort,
// a row of presets (a new file of that kind) and past designs as cards with a live preview. Colors, fonts and shadow come from the hub theme.
import { ago, bannerText, groupFiles, isDesignerKey, isGone, isNameKey, isProjectKey, labelsOf, layoutOf, nameOf, nameOfKey, projectOfKey, readableSlug, scrollsRight, isServiceKey, subGroups, topKeyOf } from "./lib.js";
import { CANVAS_ICONS as CI } from "./icons.js";
import { allLangs, makeT } from "./i18n.js";
import { prune, rangeIds, setMany, tileState } from "./selection.js";

// UI strings: en by default, ru when the hub language is Russian (see i18n.js); texts are resolved at use time, never at load
export const STR = {
  en: {
    preset_slides: "Presentation", preset_design: "Design", preset_codebase: "Your code", preset_system: "Design system",
    lead_slides: "new presentation: ", lead_design: "new design: ", lead_codebase: "new design in the project code: ", lead_system: "new design system: ",
    tab_all: "All", tab_mine: "Opened", tab_others: "Not opened",
    tab_all_hint: "All designs", tab_mine_hint: "Designs you have opened on the canvas", tab_others_hint: "Designs you have not opened yet",
    sort_recent: "Newest first", sort_oldest: "Oldest first", sort_name: "Name, A to Z", sort_name_desc: "Name, Z to A",
    edited: "edited {ago}",
    asked: "Request sent to the hub, waiting",
    install: "Install",
    title: "Hub Design",
    search_ph: "Search designs",
    search: "Search",
    tiles: "Tiles",
    list: "List",
    sort: "Sort",
    open_by_path: "Open a design by path",
    path_ph: "Open by path: /…/index.html",
    empty_found: "Nothing found",
    empty_none: "No designs yet. Pick a preset above or write on the left what you need: a specialist will make a new file.",
    no_specialist: "no specialist {name}",
    crumb_all: "All folders",
    folder_none: "No direction",
    folder_service: "Service", folder_service_hint: "Covers, icons and test pages: made along the way, not for you",
    folder_designer: "Designer", folder_designer_hint: "The designer's designs outside any project",
    folder_count: "Designs: {n}",
    empty_folder: "No designs in this folder yet. Write on the left what you need: the designer will save it here.",
    os_mac: "Mac", os_windows: "Windows", os_linux: "Linux",
    peer_head: "{where} · designs: {n}",
    peer_note: "A picture only: the file, the canvas and the edits stay in the hub \u201c{where}\u201d",
    peer_noshot: "No picture yet",
    peer_close: "Close",
    sel_check: "Select", sel_count: "Selected: {n}", sel_move: "Move to…", sel_delete: "Delete", sel_clear: "Clear selection",
    sel_confirm: "Move to the trash: {n}?", sel_yes: "Yes, to the trash", sel_no: "Cancel",
    sel_peer: "A design of another machine: it can be changed only there", sel_busy: "The author is working on it now",
    sel_busy_now: "The author is working on the selected designs now, try again a bit later",
    move_title: "Move to a folder", move_path_ph: "Or a full path to a folder", move_go: "Move", move_loading: "Loading folders…", move_none: "No folders to pick yet: type a path",
    toast_moved: "Moved: {n}", toast_deleted: "In the trash: {n}", toast_undo: "Undo", toast_undone: "Restored: {n}", toast_skipped: "skipped: {n}",
    toast_conflict: "Not everything came back: the old place is taken", toast_fail: "Did not work: {text}",
  },
  ru: {
    preset_slides: "Презентация", preset_design: "Дизайн", preset_codebase: "Свой код", preset_system: "Дизайн-система",
    lead_slides: "новая презентация: ", lead_design: "новый дизайн: ", lead_codebase: "новый дизайн в коде проекта: ", lead_system: "новая дизайн-система: ",
    tab_all: "Все", tab_mine: "Открывал", tab_others: "Не открывал",
    tab_all_hint: "Все макеты", tab_mine_hint: "Макеты, которые ты открывал на холсте", tab_others_hint: "Макеты, которые ты ещё не открывал",
    sort_recent: "Сначала новые", sort_oldest: "Сначала старые", sort_name: "Название, от А до Я", sort_name_desc: "Название, от Я до А",
    edited: "изменён {ago}",
    asked: "Запрос отправлен хабу, ждём",
    install: "Поставить",
    title: "Hub Design",
    search_ph: "Поиск по макетам",
    search: "Поиск",
    tiles: "Плитки",
    list: "Список",
    sort: "Сортировка",
    open_by_path: "Открыть макет по пути",
    path_ph: "Открыть по пути: /…/index.html",
    empty_found: "Ничего не нашлось",
    empty_none: "Макетов пока нет. Выберите пресет выше или напишите слева, что нужно: специалист сделает новый файл.",
    no_specialist: "нет специалиста {name}",
    crumb_all: "Все папки",
    folder_none: "Без направления",
    folder_service: "Служебное", folder_service_hint: "Обложки, иконки и тестовые страницы: сделаны по ходу дела, не для тебя",
    folder_designer: "Дизайнер", folder_designer_hint: "Макеты дизайнера вне проектов",
    folder_count: "Макетов: {n}",
    empty_folder: "В этой папке пока нет макетов. Напишите слева, что нужно: дизайнер сохранит его сюда.",
    os_mac: "Mac", os_windows: "Windows", os_linux: "Linux",
    peer_head: "{where} · макетов: {n}",
    peer_note: "Только картинка: файл, холст и правки остались в хабе \u00ab{where}\u00bb",
    peer_noshot: "Снимка пока нет",
    peer_close: "Закрыть",
    sel_check: "Выбрать", sel_count: "Выбрано: {n}", sel_move: "Перенести в…", sel_delete: "Удалить", sel_clear: "Снять выделение",
    sel_confirm: "Убрать в корзину: {n}?", sel_yes: "Да, в корзину", sel_no: "Отмена",
    sel_peer: "Макет другой машины: менять его можно только там", sel_busy: "Автор сейчас работает над ним",
    sel_busy_now: "Автор сейчас работает над выбранными макетами, попробуйте чуть позже",
    move_title: "Перенести в папку", move_path_ph: "Или полный путь к папке", move_go: "Перенести", move_loading: "Загружаем папки…", move_none: "Папок для выбора пока нет: впишите путь",
    toast_moved: "Перенесено: {n}", toast_deleted: "В корзине: {n}", toast_undo: "Вернуть", toast_undone: "Вернули: {n}", toast_skipped: "пропущено: {n}",
    toast_conflict: "Вернулось не всё: прежнее место занято", toast_fail: "Не получилось: {text}",
  },
};
export const t = makeT(STR);

// a preset is a new file of that kind: the chat goes to the specialist of the kind, a stub "new <kind>: …" lands in the input.
// title and lead are getters: they follow the hub language at the moment they are read
const preset = (id, to) => ({ id, to, get title() { return t("preset_" + id); }, get lead() { return t("lead_" + id); } });
export const PRESETS = [preset("slides", "designer"), preset("design", "designer"), preset("system", "designer"), preset("codebase", "designer")];
export const TABS = ["all", "mine", "others"];   // ids; the label is t("tab_<id>")
export const SORTS = ["recent", "oldest", "name", "name_desc"];         // ids; the label is t("sort_<id>")
// stubs in EVERY language: the language may change between putting a stub in the input and checking it
const STUBS = new Set(PRESETS.flatMap((p) => allLangs(STR, "lead_" + p.id)));

// a stub in the input is replaced by the next stub, but never the owner's own words
export const isStub = (text) => STUBS.has(text);
export const stubText = (current, lead) => (!current.trim() || isStub(current) ? lead : current);

export { nameOf };

// "Mine" - designs the owner keeps on the canvas; "Others" - the rest (written by specialists and hub sessions)
// labels: Map path -> the label of the design ("Email-1: Kyoto"); the search and the name sort go by it too
export function shown(files, { tab = "all", q = "", sort = "recent", mine = new Set(), labels = new Map() } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  const label = (f) => labels.get(f.path) || nameOf(f.path);
  const rows = files.filter((f) => (tab === "all" || (tab === "mine") === mine.has(f.path))
    && (!needle || (label(f) + " " + nameOf(f.path) + " " + f.path + " " + (f.session || "")).toLowerCase().includes(needle)));
  const time = (f) => f.last || f.ts || 0;
  const by = sort === "name" ? (a, b) => label(a).localeCompare(label(b)) : sort === "name_desc" ? (a, b) => label(b).localeCompare(label(a))
    : sort === "oldest" ? (a, b) => time(a) - time(b) : (a, b) => time(b) - time(a);
  return rows.sort(by);
}
// the tiles (folders) go in the same order as the cards: a tile is as new as its newest design, and is named by title(key)
export function sortGroups(groups, sort = "recent", title = (key) => key) {
  const last = (g) => Number(g.last) || Math.max(0, ...g.files.map((f) => Number(f.last || f.ts) || 0));
  const name = (g) => String(title(g.key) || "");
  const by = sort === "name" ? (a, b) => name(a).localeCompare(name(b)) : sort === "name_desc" ? (a, b) => name(b).localeCompare(name(a))
    : sort === "oldest" ? (a, b) => last(a) - last(b) : (a, b) => last(b) - last(a);
  return [...groups].sort(by);
}
export const editedText = (f, now) => {
  const a = ago(f.last || f.ts, now);
  return a ? t("edited", { ago: a }) : "";
};

// preset art - like the tiles in Claude Design, in theme colors
const ART = {
  slides: '<i class="a-card" style="left:14%;top:20%;width:72%;height:60%"><i class="a-bar" style="left:9%;top:14%;width:52%;height:13%"></i><i class="a-line" style="left:9%;top:44%;width:40%;height:8%"></i><i class="a-line" style="left:9%;top:62%;width:30%;height:8%"></i><i class="a-pic" style="left:66%;top:42%;width:24%;height:30%"></i></i>',
  design: '<i class="a-card a-phone"><i class="a-line a-notch"></i><i class="a-dot a-pd" style="top:24%"></i><i class="a-line" style="left:42%;top:25.5%;width:42%;height:5%"></i><i class="a-dot a-pd" style="top:41%"></i><i class="a-line" style="left:42%;top:42.5%;width:30%;height:5%"></i><i class="a-dot a-pg" style="left:30%"></i><i class="a-dot a-pg" style="left:46%"></i><i class="a-dot a-pg" style="left:62%"></i></i>',
  codebase: '<i class="a-card" style="left:44%;top:14%;width:36%;height:40%;opacity:.8"></i><i class="a-term" style="left:16%;top:38%;width:50%;height:48%"><b>&gt;_</b></i>',
  system: '<i class="a-card" style="left:14%;top:14%;width:72%;height:72%"><i class="a-sw s1" style="left:10%;top:14%"></i><i class="a-sw s2" style="left:30%;top:14%"></i><i class="a-sw s3" style="left:50%;top:14%"></i><i class="a-sw s4" style="left:70%;top:14%"></i><i class="a-bar" style="left:10%;top:58%;width:42%;height:10%"></i><i class="a-line" style="left:10%;top:76%;width:80%;height:8%"></i></i>',
};

// the "specialist needed" banner: rows come from lacking() in lib.js; "Install" asks the hub, while waiting - "Asked the hub, waiting"
export function createNeed(app, cls = "") {
  const node = app.hub.el("div", "hdd-need " + cls);
  node.hidden = true;
  let sig = "";
  function paint(rows) {
    const next = rows.map((r) => r.name + ":" + r.state).join();
    if (next === sig) return;
    sig = next;
    node.hidden = !rows.length;
    node.replaceChildren(...rows.map((r) => {
      const row = app.hub.el("div", "hdd-need-row");
      row.dataset.need = r.name;
      const text = app.hub.el("span", "hdd-need-t", bannerText(r));
      const b = app.hub.el("button", "hdd-need-b", r.state === "wait" ? t("asked") : t("install"));
      b.type = "button";
      b.disabled = r.state === "wait";
      b.addEventListener("click", () => app.install(r.name));
      row.append(text, b);
      return row;
    }));
  }
  return { node, paint };
}

// the folders of the start screen: designs by direction folder (a tile with the newest designs), a click opens the folder.
// dirs = directionDirs() of lib.js; the label of a folder is its direction (several directions in one folder - the folder name)
export const PREVIEWS = 4;
// the folder of another machine: the two common folders arrive as keys (that machine may speak another language), the rest as names
export const peerDirName = (dir) => (isServiceKey(dir) ? t("folder_service") : isDesignerKey(dir) ? t("folder_designer") : dir || t("folder_none"));
export const folderTitle = (key, dirs = [], tasks = [], lay = null) => (isServiceKey(key) ? t("folder_service") : isDesignerKey(key) ? t("folder_designer") : isProjectKey(key) ? (lay && lay.names.get(key)) || readableSlug(projectOfKey(key)) : isNameKey(key) ? nameOfKey(key) : key ? ((dirs.find((d) => d.key === key) || {}).label || key.split("/").pop()) : t("folder_none"));
// what the dashboard shows: "folders" (the tiles of the top level) or "files" (the cards of a place; subs - the tiles of the tasks lying in it).
// The top level is the directions and, next to them, a tile named for the own task of each design that no direction owns - there is no "no direction" folder.
// A project folder on disk is a subfolder inside its direction (several designs of it there); a design with no project folder lies loose.
// lay: layoutOf() of all the designs (a search or a tab does not dissolve a folder); folder: the open direction folder (null - the top), sub: the open project folder ("proj:<project>")
export function view(rows, dirs, { folder = null, sub = null, q = "", taskRows = [], lay = null } = {}) {
  lay = lay || layoutOf(rows, dirs, taskRows);
  const topOf = (f) => (lay.top.has(f.path) ? lay.top.get(f.path) : topKeyOf(f, dirs, taskRows));
  const here = folder === null ? rows : rows.filter((f) => topOf(f) === folder);
  if (sub !== null) return { mode: "files", rows: here.filter((f) => lay.sub.get(f.path) === sub), subs: [] };
  if (String(q || "").trim()) return { mode: "files", rows: here, subs: [] };
  if (folder === null) {
    // a design that belongs to no folder ("" - a task with one design, not the designer's) lies loose below the folders
    const groups = groupFiles(rows, dirs, taskRows, lay).filter((g) => g.key !== "");
    if (groups.length) return { mode: "folders", groups, subs: [], rows: [], loose: rows.filter((f) => topOf(f) === "") };
  }
  const { subs, loose } = subGroups(here, lay);
  return { mode: "files", rows: loose, subs };
}
// the designs of the other machines of the owner (/__canvas/peers of the plugin process): a picture and a name each, the files stay there.
// where: the kind of the machine ("Mac", "Windows"); two machines of one kind - with the machine name
export function peerWhere(peer, all = []) {
  const known = ["mac", "windows", "linux"].includes(peer.os);
  const label = known ? t("os_" + peer.os) : peer.machine;
  return known && all.filter((x) => x.os === peer.os).length > 1 ? `${label} (${peer.machine})` : label;
}
// "Mine" are the designs on this canvas: none of another machine; search by name, file and author; newest first
export function peerRows(items, { tab = "all", q = "" } = {}) {
  if (tab === "mine") return [];
  const needle = String(q || "").trim().toLowerCase();
  return items.filter((it) => !needle || [it.name, it.file, it.session].join(" ").toLowerCase().includes(needle))
    .sort((a, b) => (b.last || b.ts || 0) - (a.last || a.ts || 0));
}
// the name of the other machine on the dashboard: its hub name (hub.json title); none - its kind; two hubs of one name - with the machine name
export function peerHub(peer, all = []) {
  const hub = String(peer.hub || "").trim();
  if (!hub) return peerWhere(peer, all);
  return all.filter((x) => String(x.hub || "").trim() === hub).length > 1 ? `${hub} (${peer.machine})` : hub;
}
// the designs of one machine by direction (dir is a name the other machine sent, "" - none): the named ones, the one that was touched last first; "" - the last
export function peerGroups(items) {
  const by = new Map();
  for (const it of items) {
    const key = it.dir || "";
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(it);
  }
  const last = (g) => Math.max(...g.map((x) => x.last || x.ts || 0));
  return [...by].map(([key, files]) => ({ key, files })).sort((a, b) => (!a.key) - (!b.key) || last(b.files) - last(a.files));
}
// what to show inside the folder of a machine: "folders" (one tile per direction) or "files"; the same rule as view() for the own designs
export function peerView(rows, { dir = null, q = "" } = {}) {
  if (dir !== null) return { mode: "files", rows: rows.filter((it) => (it.dir || "") === dir) };
  const groups = peerGroups(rows);
  if (String(q || "").trim() || !groups.some((g) => g.key)) return { mode: "files", rows };
  return { mode: "folders", groups };
}
export const peerName = (it) => it.name || nameOf(it.file || "") || it.id;

export const newest = (rows, n = PREVIEWS) => [...rows].sort((a, b) => (b.last || b.ts || 0) - (a.last || a.ts || 0)).slice(0, n);

// put the nodes into the parent in this order and move only what is out of place: a node pulled out and put back replays its entrance
// animation and reloads its picture (the tiles flickered on every snapshot), and a text written again replaces its node
export function place(parent, nodes) {
  const keep = new Set(nodes);
  for (const c of [...parent.children]) if (!keep.has(c)) c.remove();
  nodes.forEach((n, i) => { if (parent.children[i] !== n) parent.insertBefore(n, parent.children[i] || null); });
}
// rows by key: a row whose sig did not change keeps its node (its pictures do not reload, a selection in it stays), only new or changed ones are made
export function keyed(parent, cache, items, keyOf, sigOf, make) {
  const next = new Map();
  const nodes = items.map((it, i) => {
    const k = keyOf(it) ?? "#" + i, sig = sigOf(it), old = cache.get(k);
    const node = old && old.sig === sig ? old.node : make(it);
    next.set(k, { sig, node });
    return node;
  });
  cache.clear();
  for (const [k, v] of next) cache.set(k, v);
  place(parent, nodes);
}
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const setTitle = (node, text) => { if (node.title !== text) node.title = text; };
const setAttr = (node, k, v) => { if (node.getAttribute(k) !== v) node.setAttribute(k, v); };
const setHidden = (node, v) => { if (node.hidden !== v) node.hidden = v; };

// previews: a shot of the design (PNG of the plugin process: its headless Chrome, cached on disk by path and edit time), not the live document -
// a dozen live designs at once froze the page and the rest stayed grey. A shot this browser already had is put at once; a new one waits
// in a queue: what is in view first, then all the rest, SHOTS_AT_ONCE at a time (each new one is a Chrome run of 1-3 s), a failed one again after RETRY
export const SHOTS_AT_ONCE = 3;
const RETRY = [3000, 10000, 30000];
const KNOWN_KEY = "hub-design:shots", KNOWN_MAX = 2000;
let known = null;   // shot addresses that loaded in this browser (localStorage)
const knownSet = () => {
  if (!known) { try { known = new Set(JSON.parse(globalThis.localStorage?.getItem(KNOWN_KEY) || "[]")); } catch { known = new Set(); } }
  return known;
};
const remember = (src) => {
  const k = knownSet();
  k.delete(src);
  k.add(src);
  while (k.size > KNOWN_MAX) k.delete(k.values().next().value);
  try { globalThis.localStorage?.setItem(KNOWN_KEY, JSON.stringify([...k])); } catch { /* full or off: known for this page only */ }
};
export const forgetShots = () => { known = new Set(); try { globalThis.localStorage?.removeItem(KNOWN_KEY); } catch { /* off */ } };

// the queue of shots: c = {img, shot, visible, want, shown}; the new shot is loaded aside and put into the card when it is there - the old
// picture stays until then (a card never goes blank on an edit)
function shotQueue(el, later, max = SHOTS_AT_ONCE) {
  const waiting = new Set();
  let busy = 0;
  const put = (c, src) => { c.shown = src; if (c.img.src !== src) c.img.src = src; if (c.shot.dataset.live !== "1") c.shot.dataset.live = "1"; delete c.shot.dataset.none; };
  function start(c) {
    const src = c.want, probe = el("img");
    busy++;
    c.loading = src;
    let done = false;
    const end = (ok) => {
      if (done) return;
      done = true;
      busy--;
      if (c.loading === src) c.loading = null;
      if (ok) { remember(src); if (c.want === src) put(c, src); }
      else if (c.want === src) {
        c.tries = (c.tries || 0) + 1;
        if (c.tries <= RETRY.length) later(() => { if (c.want === src && c.shown !== src) { waiting.add(c); pump(); } }, RETRY[c.tries - 1]);
        else if (c.shown !== src) c.shot.dataset.none = "1";   // no shot of this one (a pdf without the system rasterizer): the file type instead of a blank
      }
      pump();
    };
    probe.onload = () => end(true);
    probe.onerror = () => end(false);
    probe.src = src;
  }
  function pump() {
    while (busy < max) {
      let next = null;
      for (const c of waiting) if (c.visible) { next = c; break; }
      if (!next) next = waiting.values().next().value;   // nothing in view waits: the rest are loaded too, so scrolling finds them ready
      if (!next) return;
      waiting.delete(next);
      if (next.want && next.want !== next.shown && next.want !== next.loading) start(next);
    }
  }
  return {
    // the card wants this shot ("" - none)
    want(c, src) {
      if (!src || src === c.shown) { waiting.delete(c); return; }
      if (c.want !== src) { c.want = src; c.tries = 0; }
      if (knownSet().has(src)) { waiting.delete(c); put(c, src); return; }
      if (src !== c.loading) { waiting.add(c); pump(); }
    },
    pump,
    drop: (c) => waiting.delete(c),
  };
}
// createDashboard(app): app = { hub, files(), dirs(), mine(), alive(), fileState(path), fileUrl(path), open(path), preset(p), openPath(path), lacking(), install(name),
//   peers() - [{machine, os, items}] of the other machines, peerShot(machine, shot) - the url of a picture }
export function createDashboard(app) {
  const el = (tag, cls, text) => app.hub.el(tag, cls, text);
  // folder: null - all folders, "" - no direction, otherwise the folder key (its cwd); sub: the task ("task:<id>") open inside it; peer: the machine whose folder is open (null - none), pdir: the direction inside it (null - all)
  // sel: the paths of the own designs the owner ticked (a tile ticks every design in it); anchor: the item he ticked last (Shift-click ticks the range up to it);
  // moving / confirm: the "Move to" list and the "to the trash?" question are open; work: a move or a delete is under way
  const S = { tab: "all", q: "", sort: "recent", list: false, path: false, folder: null, sub: null, peer: null, pdir: null, sel: new Set(), anchor: null, moving: false, confirm: false, work: false };
  const org = app.organize || null;   // { busy(path), targets(), move(paths, dest), remove(paths), undo(id) }: none - the dashboard only shows and opens
  const root = el("div", "hdd");
  const page = el("div", "hdd-page");

  const head = el("h1", "hdd-h1");
  const tabs = el("div", "hdd-tabs");
  const tabBtns = TABS.map((id) => {
    const b = el("button", "hdd-tab");
    b.type = "button";
    b.addEventListener("click", () => { S.tab = id; paint(); });
    return [id, b];
  });
  tabs.append(...tabBtns.map(([, b]) => b));
  const tool = (icon, fn) => {
    const b = el("button", "hdd-tool");
    b.type = "button";
    b.innerHTML = CI[icon];
    b.addEventListener("click", fn);
    return b;
  };
  // the search field is always open: the magnifier sits inside it
  const search = el("input", "hdd-search");
  search.type = "search";
  search.addEventListener("input", () => { S.q = search.value; paintFiles(); });
  const searchBox = el("label", "hdd-sbox");
  searchBox.innerHTML = CI.search;
  searchBox.append(search);
  const bView = tool("list", () => { S.list = !S.list; paint(); });
  const bSort = tool("sort", () => { S.sort = SORTS[(SORTS.indexOf(S.sort) + 1) % SORTS.length]; paint(); });
  const bMore = tool("more", () => { S.path = !S.path; paint(); if (S.path) pathIn.focus(); });
  bMore.classList.add("hdd-more");
  const tools = el("div", "hdd-tools");
  tools.append(searchBox, bView, bSort, bMore);
  const bar = el("div", "hdd-bar");
  bar.append(tabs, tools);

  const pathIn = el("input", "hdd-path");
  pathIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && pathIn.value.trim()) app.openPath(pathIn.value); });

  const presets = el("div", "hdd-presets");
  const subs = new Map();
  const labels = [];
  for (const p of PRESETS) {
    const b = el("button", "hdd-preset");
    b.type = "button";
    b.dataset.preset = p.id;
    const art = el("span", "hdd-art a-" + p.id);
    art.innerHTML = ART[p.id];
    const label = el("span", "hdd-plabel");
    const sub = el("span", "hdd-psub");
    sub.hidden = true;
    b.append(art, label, sub);
    b.addEventListener("click", () => app.preset(p));
    presets.append(b);
    subs.set(p.id, sub);
    labels.push([p, label]);
  }

  const fade = () => presets.classList.toggle("more", scrollsRight(presets));
  presets.addEventListener("scroll", fade, { passive: true });
  new ResizeObserver(fade).observe(presets);

  const need = createNeed(app);
  const crumb = el("div", "hdd-crumb");
  crumb.hidden = true;
  const back = el("button", "hdd-back");
  back.type = "button";
  back.addEventListener("click", () => { if (S.peer !== null && S.pdir !== null) S.pdir = null; else if (S.peer === null && S.sub !== null) S.sub = null; else { S.peer = null; S.folder = null; S.sub = null; } paint(); });
  const cname = el("span", "hdd-cname");
  crumb.append(back, cname);
  const folders = el("div", "hdd-folders");
  const files = el("div", "hdd-files");
  const empty = el("div", "hdd-empty");
  const others = el("div", "hdd-peers");
  page.append(head, need.node, bar, pathIn, presets, crumb, folders, files, empty, others);
  // a design of another machine opens as a picture over the dashboard: the file and the canvas are there
  const lb = el("div", "hdd-lb");
  lb.hidden = true;
  const lbBox = el("div", "hdd-lb-box");
  const lbImg = el("img", "hdd-lb-img");
  const lbName = el("div", "hdd-lb-name");
  const lbMeta = el("div", "hdd-lb-meta");
  const lbNote = el("div", "hdd-lb-note");
  const lbClose = el("button", "hdd-lb-close");
  lbClose.type = "button";
  lbClose.innerHTML = "&times;";
  lbBox.append(lbClose, lbImg, lbName, lbMeta, lbNote);
  lb.append(lbBox);
  const closeLb = () => { lb.hidden = true; lbImg.removeAttribute("src"); };
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target === lbClose) closeLb(); });

  // --- what the owner ticks: a check in the corner of every card and tile, the panel with the actions at the bottom
  const items = new Map();   // id -> {node, check, paths, peer, off}; made again on every paintFiles, so a gone card leaves no trace
  let lastView = "";         // the open folder / machine: the ticks do not go with the owner into another one
  let order = [];            // the ids of the own items as they stand on the screen (tiles, then cards): the range of a Shift-click
  const busy = (p) => !!(org && org.busy(p));
  function mkCheck() {
    if (!org) return null;
    const box = el("span", "hdd-check");
    box.setAttribute("role", "checkbox");
    box.tabIndex = 0;
    box.innerHTML = '<i class="ck-on">' + CI.check + '</i><i class="ck-mix">' + CI.minus + "</i>";
    return box;
  }
  function reg(id, node, check, paths, peer = false) {
    if (!check) return;
    items.set(id, { node, check, paths, peer, off: false });
    if (!check.dataset.bound) {
      check.dataset.bound = "1";
      const hit = (e) => { e.stopPropagation(); e.preventDefault(); toggle(check.dataset.id, e.shiftKey); };
      check.addEventListener("click", hit);
      check.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") hit(e); });
    }
    check.dataset.id = id;
  }
  function toggle(id, range) {
    const it = items.get(id);
    if (!it) return;
    if (it.off || it.paths.some(busy)) { paintSel(); return; }   // the author may have started a turn since the last look: the check goes off, nothing is ticked
    const on = tileState(S.sel, it.paths) !== "all";
    for (const k of range && S.anchor ? rangeIds(order, S.anchor, id) : [id]) {
      const x = items.get(k);
      if (x && !x.off) setMany(S.sel, x.paths, on);
    }
    S.anchor = id;
    paintSel();
  }
  const dock = el("div", "hdd-dock");
  dock.hidden = true;
  const toast = el("div", "hdd-toast");
  toast.setAttribute("role", "status");
  toast.hidden = true;
  const toastText = el("span", "hdd-toast-t");
  const toastUndo = el("button", "hdd-toast-b");
  toastUndo.type = "button";
  toast.append(toastText, toastUndo);
  const pop = el("div", "hdd-pop");
  pop.hidden = true;
  const popHead = el("div", "hdd-pop-h");
  const popList = el("div", "hdd-pop-list");
  const popPath = el("input", "hdd-pop-in");
  const popGo = el("button", "hdd-pop-go");
  popGo.type = "button";
  const popRow = el("div", "hdd-pop-row");
  popRow.append(popPath, popGo);
  pop.append(popHead, popList, popRow);
  const panel = el("div", "hdd-sel");
  panel.hidden = true;
  const selCount = el("span", "hdd-sel-n");
  const act = (cls, icon, fn) => {
    const b = el("button", "hdd-sel-b " + cls);
    b.type = "button";
    const label = el("span", "hdd-sel-t");
    if (icon) { const i = el("i", "hdd-sel-i"); i.innerHTML = CI[icon]; b.append(i); }
    b.append(label);
    b.addEventListener("click", fn);
    return { b, label };
  };
  const bMoveTo = act("move", "move", () => { S.confirm = false; if (S.moving) closePop(); else openPop(); paintDock(); });
  const bTrash = act("del", "trash", () => { S.moving = false; S.confirm = true; paintDock(); });
  const bNo = act("quiet", "", () => { S.confirm = false; paintDock(); });
  const bYes = act("danger", "trash", () => work("delete", (paths) => org.remove(paths)));
  const bClear = act("quiet", "close", () => { S.sel.clear(); S.anchor = null; paintSel(); });
  const ask = el("span", "hdd-sel-ask");
  panel.append(selCount, bMoveTo.b, bTrash.b, ask, bYes.b, bNo.b, bClear.b);
  dock.append(toast, pop, panel);
  popGo.addEventListener("click", () => { if (popPath.value.trim()) work("move", (paths) => org.move(paths, popPath.value.trim())); });
  popPath.addEventListener("keydown", (e) => { if (e.key === "Enter" && popPath.value.trim()) work("move", (paths) => org.move(paths, popPath.value.trim())); });

  function closePop() { S.moving = false; }
  function openPop() {
    S.moving = true;
    popList.replaceChildren(el("div", "hdd-pop-none", t("move_loading")));
    Promise.resolve(org.targets()).then((rows) => {
      if (!S.moving) return;
      popList.replaceChildren(...(rows.length ? rows.map((r) => {
        const b = el("button", "hdd-pop-item");
        b.type = "button";
        b.title = r.path;
        b.dataset.path = r.path;
        b.append(el("span", "hdd-pop-name", r.label || r.path));
        b.addEventListener("click", () => work("move", (paths) => org.move(paths, r.path)));
        return b;
      }) : [el("div", "hdd-pop-none", t("move_none"))]));
    }, () => { if (S.moving) popList.replaceChildren(el("div", "hdd-pop-none", t("move_none"))); });
  }
  let toastSeq = 0;
  const later = app.later || ((f, ms) => setTimeout(f, ms));
  function say(text, { undo = null, bad = false } = {}) {
    const mine = ++toastSeq;
    setText(toastText, text);
    toast.classList.toggle("bad", bad);
    toastUndo.hidden = !undo;
    toastUndo.onclick = undo ? () => undoRun(undo) : null;
    toast.hidden = false;
    later(() => { if (toastSeq === mine) { toast.hidden = true; paintDock(); } }, 12000);
    paintDock();
  }
  const summary = (res, kind) => {
    const n = (kind === "move" ? res.moved : res.deleted || []).length, skipped = (res.skipped || []).length;
    return t(kind === "move" ? "toast_moved" : "toast_deleted", { n }) + (skipped ? " (" + t("toast_skipped", { n: skipped }) + ")" : "");
  };
  // a move or a delete of everything ticked; what the author is busy with now is left out (his state is checked again at the moment of the click)
  async function work(kind, fn) {
    if (S.work || !org) return;
    const paths = [...S.sel].filter((p) => !busy(p));
    if (!paths.length) { say(t("sel_busy_now"), { bad: true }); return; }
    S.work = true;
    paintDock();
    try {
      const res = await fn(paths);
      S.sel.clear();
      S.anchor = null;
      S.moving = false;
      S.confirm = false;
      say(summary(res, kind), { undo: res.id || null });
    } catch (e) {
      say(t("toast_fail", { text: (e && e.message) || String(e) }), { bad: true });
    } finally {
      S.work = false;
      paint();
    }
  }
  async function undoRun(id) {
    if (S.work) return;
    S.work = true;
    paintDock();
    try {
      const res = await org.undo(id);
      say((res.conflicts || []).length ? t("toast_conflict") : t("toast_undone", { n: res.restored || 0 }), { bad: (res.conflicts || []).length > 0 });
    } catch (e) {
      say(t("toast_fail", { text: (e && e.message) || String(e) }), { bad: true });
    } finally {
      S.work = false;
      paint();
    }
  }
  function paintSel() {
    // a design its author took into work after the tick is let go quietly: the check of its card goes off, and an action never meets it (no toast before a click)
    for (const p of [...S.sel]) if (busy(p)) S.sel.delete(p);
    for (const it of items.values()) {
      const state = tileState(S.sel, it.paths);
      const off = it.peer || it.paths.some(busy);
      it.off = off;
      setAttr(it.check, "aria-checked", state === "all" ? "true" : state === "some" ? "mixed" : "false");
      setAttr(it.check, "aria-disabled", off ? "true" : "false");
      const why = off ? (it.peer ? t("sel_peer") : t("sel_busy")) : t("sel_check");
      setTitle(it.check, why);
      setAttr(it.check, "aria-label", why);
      if (it.node.classList.contains("sel") !== (state !== "none")) it.node.classList.toggle("sel", state !== "none");
    }
    paintDock();
  }
  function paintDock() {
    const n = S.sel.size;
    if (!n) { S.moving = false; S.confirm = false; }
    if (root.classList.contains("selecting") !== (n > 0)) root.classList.toggle("selecting", n > 0);
    setHidden(panel, !n);
    setHidden(pop, !S.moving);
    setText(selCount, t("sel_count", { n }));
    setText(bMoveTo.label, t("sel_move"));
    setText(bTrash.label, t("sel_delete"));
    setText(bClear.label, t("sel_clear"));
    setText(bYes.label, t("sel_yes"));
    setText(bNo.label, t("sel_no"));
    setText(ask, t("sel_confirm", { n }));
    for (const b of [bMoveTo.b, bTrash.b, bClear.b]) setHidden(b, S.confirm);
    for (const x of [bYes.b, bNo.b, ask]) setHidden(x, !S.confirm);
    for (const b of [bMoveTo.b, bTrash.b, bYes.b, bClear.b, popGo]) if (b.disabled !== S.work) b.disabled = S.work;
    bMoveTo.b.classList.toggle("on", S.moving);
    setText(popHead, t("move_title"));
    setText(popGo, t("move_go"));
    setText(toastUndo, t("toast_undo"));
    if (popPath.placeholder !== t("move_path_ph")) popPath.placeholder = t("move_path_ph");
    setHidden(dock, !n && toast.hidden);
  }

  root.append(page, dock, lb);
  // keys typed in the search and path fields do not reach the canvas hotkeys; Escape closes what is open, then clears the ticks
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!lb.hidden) closeLb();
      else if (S.moving || S.confirm) { S.moving = false; S.confirm = false; paintDock(); }
      else if (S.sel.size) { S.sel.clear(); S.anchor = null; paintSel(); }
    }
    e.stopPropagation();
  });
  function zoom(peer, it, where) {
    lbImg.hidden = !it.shot;
    if (it.shot) lbImg.src = app.peerShot(peer.machine, it.shot);
    lbName.textContent = peerName(it);
    lbMeta.textContent = [where, it.session, editedText(it)].filter(Boolean).join(" · ");
    lbNote.textContent = t("peer_note", { where });
    lbClose.title = t("peer_close");
    lbClose.setAttribute("aria-label", lbClose.title);
    lb.dataset.peer = peer.machine + "/" + it.id;
    lb.hidden = false;
  }
  // the cards of the other machines: a picture (no live frame - the file is not here); kept by machine/id so a repaint does not reload them
  const pcards = new Map();
  function pcard(peer, it) {
    const key = peer.machine + "/" + it.id;
    let c = pcards.get(key);
    if (!c) {
      const node = el("button", "hdd-card hdd-pcard");
      node.type = "button";
      node.dataset.peer = key;
      const shot = el("span", "hdd-shot");
      const img = el("img", "hdd-pimg");
      img.loading = "lazy";
      img.alt = "";
      const none = el("span", "hdd-pnone");
      shot.append(img, none);
      const name = el("span", "hdd-name");
      const badge = el("span", "hdd-badge");
      const text = el("span", "hdd-mtext");
      const meta = el("span", "hdd-meta");
      meta.append(badge, text);
      const body = el("span", "hdd-body");
      body.append(name, meta);
      const check = mkCheck();
      node.append(shot, body);
      if (check) node.append(check);
      c = { node, img, none, name, badge, text, src: "", check };
      node.addEventListener("click", () => zoom(c.peer, c.it, c.where));
      pcards.set(key, c);
    }
    return c;
  }
  // a tile of a machine (key "machine") or of one of its directions ("machine/dir"): up to PREVIEWS pictures of the newest designs, a name, a count
  const ptiles = new Map();
  function ptile(key, pick) {
    let tl = ptiles.get(key);
    if (tl) return tl;
    const node = el("button", "hdd-folder hdd-ptile");
    node.type = "button";
    node.dataset.ptile = key;
    const shots = el("span", "hdd-fshots");
    const cells = Array.from({ length: PREVIEWS }, () => {
      const c = el("span", "hdd-fcell");
      const img = el("img", "hdd-pimg");
      img.loading = "lazy";
      img.alt = "";
      img.hidden = true;
      c.append(img);
      shots.append(c);
      return { img, src: "" };
    });
    const icon = el("span", "hdd-ficon");
    icon.innerHTML = FOLDER;
    const name = el("span", "hdd-fname");
    const count = el("span", "hdd-fcount");
    const text = el("span", "hdd-ftext");
    text.append(name, count);
    const body = el("span", "hdd-fbody");
    body.append(icon, text);
    const check = mkCheck();
    node.append(shots, body);
    if (check) node.append(check);
    tl = { node, cells, name, count, check };
    node.addEventListener("click", () => pick(tl));
    ptiles.set(key, tl);
    return tl;
  }
  function fillTile(tl, peer, files, title) {
    setText(tl.name, title);
    setTitle(tl.node, title);
    setText(tl.count, t("folder_count", { n: files.length }));
    const top = newest(files);
    tl.cells.forEach((c, i) => {
      const it = top[i];
      const src = it && it.shot ? app.peerShot(peer.machine, it.shot) + "&v=" + encodeURIComponent(it.stamp || it.last || "") : "";
      if (c.src !== src) { c.src = src; if (src) c.img.src = src; else c.img.removeAttribute("src"); }
      if (c.img.hidden === !!src) c.img.hidden = !src;
    });
  }
  // the containers of the area of other machines live as long as the dashboard: a rebuilt container takes its tiles out of the page (and they play their entrance again)
  const holders = new Map();
  const holder = (key, make) => { let h = holders.get(key); if (!h) { h = make(); holders.set(key, h); } return h; };
  const tileGrid = (key) => holder("g:" + key, () => el("div", "hdd-folders hdd-ptiles"));
  const peerBox = (machine) => holder("b:" + machine, () => {
    const node = el("section", "hdd-peer");
    node.dataset.machine = machine;
    const h = el("h2", "hdd-phead");
    const grid = el("div", "hdd-files hdd-pfiles");
    node.append(h, grid);
    return { node, h, grid };
  });
  let backLabel = "";   // where "back" leads from the open place: the folder above, or all the folders
  // returns how many cards and tiles of other machines are shown
  function paintPeers() {
    const list = (S.folder === null && S.sub === null && app.peers && app.peers()) || [];
    const live = new Set();
    const liveTiles = new Set();
    let count = 0;
    let open = list.find((p) => p.machine === S.peer) || null;
    if (!open) { S.peer = null; S.pdir = null; }
    if (open && !peerRows(open.items || [], { tab: S.tab, q: S.q }).length) { S.peer = null; S.pdir = null; open = null; }
    const hubName = open ? peerHub(open, list) : "";
    let pv = null;
    if (open) {
      pv = peerView(peerRows(open.items || [], { tab: S.tab, q: S.q }), { dir: S.pdir, q: S.q });
      if (S.pdir !== null && !pv.rows.length) { S.pdir = null; pv = peerView(peerRows(open.items || [], { tab: S.tab, q: S.q }), { q: S.q }); }
    }
    // the bar: inside a machine folder (and its direction) the owner sees where he is and how to go up
    if (open) {
      setHidden(crumb, false);
      setText(back, "\u2190 " + (S.pdir !== null ? hubName : t("crumb_all")));
      setText(cname, S.pdir !== null ? (peerDirName(S.pdir)) : hubName);
      setTitle(cname, hubName);
    } else {
      setText(back, "\u2190 " + backLabel);   // set here only: paint() setting it too made it flip on every snapshot inside a machine
    }
    // the folders of the machines: one tile each, as long as nothing is searched and no machine is open
    const tilesOnly = !open && !S.q.trim();
    const blocks = (open ? [open] : list).map((peer) => {
      const rows = peerRows(peer.items || [], { tab: S.tab, q: S.q });
      if (!rows.length) return null;
      const where = peerHub(peer, list);
      if (tilesOnly) {
        const tl = ptile(peer.machine, () => { S.peer = peer.machine; S.pdir = null; paint(); });
        reg("pt:" + peer.machine, tl.node, tl.check, [], true);
        fillTile(tl, peer, rows, where);
        liveTiles.add(peer.machine);
        count += 1;
        return tl.node;
      }
      if (open && pv.mode === "folders") {
        const grid = tileGrid(peer.machine);
        grid.classList.toggle("list", S.list);
        place(grid, pv.groups.map((g) => {
          const key = peer.machine + "/" + g.key;
          const tl = ptile(key, () => { S.pdir = g.key; paint(); });
          reg("pt:" + key, tl.node, tl.check, [], true);
          fillTile(tl, peer, g.files, peerDirName(g.key));
          liveTiles.add(key);
          return tl.node;
        }));
        count += pv.groups.length;
        return grid;
      }
      const shownRows = open ? pv.rows : rows;
      const box = peerBox(peer.machine);
      box.h.hidden = !!open;
      setText(box.h, t("peer_head", { where, n: rows.length }));
      const grid = box.grid;
      grid.classList.toggle("list", S.list);
      const plabels = labelsOf((peer.items || []).map((it) => ({ key: it.id, title: it.name, path: it.file || "", group: it.dir || "", ts: it.ts || it.last })));
      place(grid, shownRows.map((it) => {
        const c = pcard(peer, it);
        live.add(peer.machine + "/" + it.id);
        Object.assign(c, { peer, it, where });
        setTitle(c.node, it.file || "");
        reg("p:" + peer.machine + "/" + it.id, c.node, c.check, [], true);
        setText(c.name, plabels.get(it.id) || peerName(it));
        setText(c.badge, where);
        setText(c.text, [it.session, editedText(it)].filter(Boolean).join(" · "));
        const src = it.shot ? app.peerShot(peer.machine, it.shot) + "&v=" + encodeURIComponent(it.stamp || it.last || "") : "";
        if (c.src !== src) { c.src = src; if (src) c.img.src = src; else c.img.removeAttribute("src"); }
        if (c.img.hidden === !!src) c.img.hidden = !src;
        if (c.none.hidden !== !!src) c.none.hidden = !!src;
        setText(c.none, src ? "" : t("peer_noshot"));
        return c.node;
      }));
      count += shownRows.length;
      return box.node;
    }).filter(Boolean);
    if (tilesOnly) {
      const grid = tileGrid("all");
      grid.classList.toggle("list", S.list);
      place(grid, blocks);
      place(others, blocks.length ? [grid] : []);
    } else {
      place(others, blocks);
    }
    if (others.hidden !== !blocks.length) others.hidden = !blocks.length;
    for (const key of [...pcards.keys()]) if (!live.has(key)) pcards.delete(key);
    for (const key of [...ptiles.keys()]) if (!liveTiles.has(key)) ptiles.delete(key);
    return count;
  }

  // a preview is a shot of the design (see shotQueue): known ones at once, new ones from the queue while in view
  const cards = new Map();   // path -> {path, node, shot, img, name, text, visible}; the previews of folder tiles are "t:<path>"
  const queue = shotQueue(el, app.later || ((f, ms) => setTimeout(f, ms)));
  const seen = new IntersectionObserver((rows) => {
    for (const r of rows) {
      for (const c of cards.values()) if (c.node === r.target) { c.visible = r.isIntersecting; load(c); }
    }
    queue.pump();
  }, { root, rootMargin: "200px" });
  function load(c) {
    const on = app.alive() && !S.list && !isGone(app.fileState(c.path));
    queue.want(c, on && app.thumb ? app.thumb(c.path) : "");
  }
  function shotOf(path, cls) {
    const shot = el("span", cls);
    const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(String(path)) || [])[1] || "";
    shot.dataset.ext = ext.toLowerCase() === "htm" ? "html" : ext.toLowerCase();
    const img = el("img", "hdd-img");
    img.draggable = false;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    shot.append(img);
    return { shot, img };
  }
  function thumb(path) {
    const key = "t:" + path;
    let c = cards.get(key);
    if (c) return c;
    const { shot, img } = shotOf(path, "hdd-shot hdd-tshot");
    c = { path, node: shot, shot, img, visible: false };
    cards.set(key, c);
    seen.observe(shot);
    load(c);
    return c;
  }
  function card(f) {
    let c = cards.get(f.path);
    if (c) return c;
    const node = el("button", "hdd-card");
    node.type = "button";
    node.dataset.path = f.path;
    node.title = f.path;
    const { shot, img } = shotOf(f.path, "hdd-shot");
    const tile = el("span", "hdd-tile");
    tile.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M 12 2 C 6.241 2 1.6193906 6.8668906 2.0253906 12.712891 C 2.3923906 18.001891 7.0056406 22 12.306641 22 L 13 22 C 14.105 22 15 21.105 15 20 L 15 17 C 15 15.895 15.895 15 17 15 L 20 15 C 21.105 15 22 14.105 22 13 L 22 12.306641 C 22 7.0056406 18.002844 2.3923906 12.714844 2.0253906 C 12.474844 2.0083906 12.236 2 12 2 z M 12 4 C 12.19 4 12.381219 4.0065313 12.574219 4.0195312 C 16.738219 4.3085313 20 7.9486406 20 12.306641 L 20 13 L 17 13 C 14.794 13 13 14.794 13 17 L 13 20 L 12.306641 20 C 7.9486406 20 4.3075312 16.737219 4.0195312 12.574219 C 3.8635312 10.324219 4.6194375 8.1839219 6.1484375 6.5449219 C 7.6794375 4.9039219 9.758 4 12 4 z M 12.5 5 A 1.5 1.5 0 0 0 11 6.5 A 1.5 1.5 0 0 0 12.5 8 A 1.5 1.5 0 0 0 14 6.5 A 1.5 1.5 0 0 0 12.5 5 z M 8.5 6 A 1.5 1.5 0 0 0 7 7.5 A 1.5 1.5 0 0 0 8.5 9 A 1.5 1.5 0 0 0 10 7.5 A 1.5 1.5 0 0 0 8.5 6 z M 16.5 7 A 1.5 1.5 0 0 0 15 8.5 A 1.5 1.5 0 0 0 16.5 10 A 1.5 1.5 0 0 0 18 8.5 A 1.5 1.5 0 0 0 16.5 7 z M 6.5 10 A 1.5 1.5 0 0 0 5 11.5 A 1.5 1.5 0 0 0 6.5 13 A 1.5 1.5 0 0 0 8 11.5 A 1.5 1.5 0 0 0 6.5 10 z M 10 14 A 2 2 0 0 0 8 16 A 2 2 0 0 0 10 18 A 2 2 0 0 0 12 16 A 2 2 0 0 0 10 14 z"/></svg>';
    const name = el("span", "hdd-name", nameOf(f.path));
    const meta = el("span", "hdd-meta");
    const lock = el("span", "hdd-lock");
    lock.innerHTML = CI.lock;
    const text = el("span", "hdd-mtext");
    meta.append(lock, text);
    const body = el("span", "hdd-body");
    body.append(name, meta);
    const check = mkCheck();
    node.append(shot, tile, body);
    if (check) node.append(check);
    node.addEventListener("click", () => app.open(f.path));
    c = { path: f.path, node, shot, img, name, text, visible: false, check };
    cards.set(f.path, c);
    seen.observe(node);
    load(c);
    return c;
  }
  // a folder tile: up to PREVIEWS of the newest designs (2x2) and the name of the direction
  const tiles = new Map();   // folder key -> {node, cells, name, count}
  const FOLDER = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M 4 4 C 2.9057453 4 2 4.9057453 2 6 L 2 18 C 2 19.094255 2.9057453 20 4 20 L 20 20 C 21.094255 20 22 19.094255 22 18 L 22 8 C 22 6.9057453 21.094255 6 20 6 L 12 6 L 10 4 L 4 4 z M 4 6 L 9.171875 6 L 11.171875 8 L 20 8 L 20 18 L 4 18 L 4 6 z"/></svg>';
  function tile(key) {
    let tl = tiles.get(key);
    if (tl) return tl;
    const node = el("button", "hdd-folder");
    node.type = "button";
    node.dataset.folder = key;
    const shots = el("span", "hdd-fshots");
    const cells = Array.from({ length: PREVIEWS }, () => { const c = el("span", "hdd-fcell"); shots.append(c); return c; });
    const icon = el("span", "hdd-ficon");
    icon.innerHTML = FOLDER;
    const name = el("span", "hdd-fname");
    const count = el("span", "hdd-fcount");
    const text = el("span", "hdd-ftext");
    text.append(name, count);
    const body = el("span", "hdd-fbody");
    body.append(icon, text);
    const check = mkCheck();
    node.append(shots, body);
    if (check) node.append(check);
    node.addEventListener("click", () => { if (S.folder !== null && isProjectKey(key)) S.sub = key; else { S.folder = key; S.sub = null; } paint(); });
    tl = { node, cells, name, count, check };
    tiles.set(key, tl);
    return tl;
  }
  function paintFiles() {
    const all = app.files();
    const dirs = app.dirs ? app.dirs() : [];
    const taskList = app.tasks ? app.tasks() : [];
    const alive = all.filter((f) => !isGone(app.fileState(f.path)));
    const lay = layoutOf(alive, dirs, taskList);   // counted over all the designs: a search or a tab does not dissolve a folder
    const topOf = (f) => (lay.top.has(f.path) ? lay.top.get(f.path) : topKeyOf(f, dirs, taskList));
    // the labels ("Email-1: Kyoto") are numbered over all the designs of the folder too: a search or a tab does not renumber them
    const labels = labelsOf(alive.map((f) => ({ key: f.path, title: f.title, path: f.path, group: topOf(f) + "|" + (lay.sub.get(f.path) || ""), ts: f.ts || f.last })));
    // designs whose files are gone (or that the plugin cannot show) are not listed at all; one open on the canvas gets a message in its frame
    const rows = shown(all, { tab: S.tab, q: S.q, sort: S.sort, mine: app.mine(), labels }).filter((f) => !isGone(app.fileState(f.path)));
    // a folder that has nothing in it any more (and is not a known direction) is closed; so is a task that has no design in the open folder
    if (S.folder !== null && !dirs.some((d) => d.key === S.folder) && !rows.some((f) => topOf(f) === S.folder)) { S.folder = null; S.sub = null; }
    if (S.sub !== null && !rows.some((f) => lay.sub.get(f.path) === S.sub && (S.folder === null || topOf(f) === S.folder))) S.sub = null;
    const inPeer = S.peer !== null;   // inside the folder of another machine its designs only: the own ones are hidden
    const v = inPeer ? { mode: "files", rows: [], subs: [] } : view(rows, dirs, { folder: S.folder, sub: S.sub, q: S.q, taskRows: taskList, lay });
    const inFolder = S.folder !== null || S.sub !== null;
    setHidden(crumb, !inFolder && !inPeer);
    backLabel = S.sub !== null && S.folder !== null ? folderTitle(S.folder, dirs, taskList, lay) : t("crumb_all");
    const fullOf = (key) => folderTitle(key, dirs, taskList, lay);   // the tooltip is the name too: a path is never shown
    if (S.sub !== null) { setText(cname, folderTitle(S.sub, dirs, taskList, lay)); setTitle(cname, fullOf(S.sub)); }
    else if (S.folder !== null) { setText(cname, folderTitle(S.folder, dirs, taskList, lay)); setTitle(cname, fullOf(S.folder)); }
    // flat cards (a folder, a search or no direction folders at all)
    const list = v.mode === "files" ? v.rows : v.loose || [];
    items.clear();
    const named = !inFolder;   // a search across folders tells where each design lies
    const nodes = list.map((f) => {
      const c = card(f);
      const fk = topOf(f);
      const where = named ? folderTitle(fk, dirs, taskList, lay) : "";
      setText(c.name, labels.get(f.path) || nameOf(f.path));
      setText(c.text, [f.session, named && fk ? where : "", editedText(f)].filter(Boolean).join(" · "));
      reg("c:" + f.path, c.node, c.check, [f.path]);
      return c.node;
    });
    place(files, nodes);   // move only the ones that shifted: a card put back replays its entrance animation
    // tiles
    const groups = sortGroups(v.mode === "folders" ? v.groups : (v.subs || []), S.sort, fullOf);
    const live = new Set();
    const tnodes = groups.map((g) => {
      const tl = tile(g.key);
      setText(tl.name, folderTitle(g.key, dirs, taskList, lay));
      setTitle(tl.node, isServiceKey(g.key) ? t("folder_service_hint") : isDesignerKey(g.key) ? t("folder_designer_hint") : fullOf(g.key));
      setText(tl.count, t("folder_count", { n: g.files.length }));
      reg("f:" + g.key, tl.node, tl.check, g.files.map((f) => f.path));
      newest(g.files).forEach((f, i) => {
        const c = thumb(f.path);
        live.add("t:" + f.path);
        if (tl.cells[i].firstChild !== c.shot) tl.cells[i].replaceChildren(c.shot);
      });
      for (let i = Math.min(g.files.length, PREVIEWS); i < PREVIEWS; i++) if (tl.cells[i].firstChild) tl.cells[i].replaceChildren();
      return tl.node;
    });
    place(folders, tnodes);
    for (const key of [...tiles.keys()]) if (!groups.some((g) => g.key === key)) tiles.delete(key);
    const shownNow = new Set(list.map((f) => f.path));
    for (const [key, c] of cards) {
      const thumbOnly = key.startsWith("t:");
      if (thumbOnly ? !live.has(key) : !all.some((f) => f.path === key)) { seen.unobserve(c.node); queue.drop(c); cards.delete(key); continue; }
      if (!thumbOnly && !shownNow.has(key)) { c.visible = false; queue.drop(c); }   // a card not on the screen now waits for no shot
    }
    setHidden(folders, !tnodes.length);
    setHidden(files, inPeer || !list.length);
    files.classList.toggle("compact", v.mode === "files" ? v.subs.length > 0 : list.length > 0);   // designs lying in no folder, next to the folders: a line each (icon and name), two columns
    const peerCount = paintPeers();
    // what the owner ticked is only what he sees: a design that left the screen (another folder, a search, deleted) is let go, so a delete never reaches what is out of sight
    const viewKey = [S.folder, S.sub, S.peer, S.pdir].join("|");
    if (viewKey !== lastView) { lastView = viewKey; S.sel.clear(); S.anchor = null; }
    const visible = new Set(list.map((f) => f.path));
    for (const g of groups) for (const f of g.files) visible.add(f.path);
    prune(S.sel, visible);
    order = [...groups.map((g) => "f:" + g.key), ...list.map((f) => "c:" + f.path)].filter((id) => items.has(id));
    paintSel();
    setHidden(empty, nodes.length > 0 || tnodes.length > 0 || peerCount > 0);
    // "Nothing found" only when the owner searched or picked a tab; on "All" with no search and no designs - "No designs yet"
    setText(empty, inFolder && !S.q.trim() && S.tab === "all" ? t("empty_folder") : S.q.trim() || S.tab !== "all" ? t("empty_found") : t("empty_none"));
    for (const c of cards.values()) load(c);   // the edit time of a design changed - its new shot
    folders.classList.toggle("list", S.list);
  }
  function paint() {
    // static texts are set here, not at creation: the hub language is read at use time
    // every write here only when the value changed: this runs on every snapshot of the hub
    setText(head, t("title"));
    if (search.placeholder !== t("search_ph")) search.placeholder = t("search_ph");
    if (pathIn.placeholder !== t("path_ph")) pathIn.placeholder = t("path_ph");
    setTitle(bMore, t("open_by_path"));
    setAttr(bMore, "aria-label", bMore.title);
    setAttr(search, "aria-label", t("search"));
    setTitle(bView, S.list ? t("tiles") : t("list"));
    setAttr(bView, "aria-label", bView.title);
    setTitle(bSort, t("sort") + ": " + t("sort_" + S.sort));
    setAttr(bSort, "aria-label", bSort.title);
    for (const [p, label] of labels) setText(label, p.title.replace("-", "\u2011").replace(/ (\u0432|in) /, " $1\u00a0"));   // wrap only between words: not at the hyphen, not after the preposition (0432 in Russian)
    for (const [id, b] of tabBtns) { setText(b, t("tab_" + id)); setTitle(b, t("tab_" + id + "_hint")); b.classList.toggle("on", S.tab === id); }
    bView.classList.toggle("on", S.list);
    const icon = S.list ? "grid" : "list";
    if (bView.dataset.icon !== icon) { bView.dataset.icon = icon; bView.innerHTML = CI[icon]; }
    bSort.classList.toggle("on", S.sort !== "recent");
    bMore.classList.toggle("on", S.path);
    setHidden(pathIn, !S.path);
    // the required specialist is missing - a banner; a wanted one - a quiet line by its preset
    const lack = app.lacking();
    need.paint(lack.filter((n) => n.need === "required"));
    for (const p of PRESETS) {
      const n = lack.find((x) => x.name === p.to && x.need !== "required");
      const sub = subs.get(p.id);
      setHidden(sub, !n);
      setText(sub, n ? t("no_specialist", { name: n.name }) : "");
    }
    files.classList.toggle("list", S.list);
    paintFiles();
    fade();
  }
  paint();
  return { node: root, paint, state: S, setFolder: (key) => { S.folder = key; S.sub = null; S.peer = null; S.pdir = null; paint(); } };
}
