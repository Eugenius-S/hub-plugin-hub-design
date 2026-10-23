// Hub Design: the start screen, like the Claude Design dashboard: a title, tabs "All / Mine / Others", search, view and sort,
// a row of presets (a new file of that kind) and past designs as cards with a live preview. Colors, fonts and shadow come from the hub theme.
import { ago, bannerText, folderKeyOf, groupFiles, isGone, isTaskKey, labelsOf, nameOf, scrollsRight, taskFolders, taskOfKey, taskTitle } from "./lib.js";
import { CANVAS_ICONS as CI } from "./icons.js";
import { allLangs, makeT } from "./i18n.js";

// UI strings: en by default, ru when the hub language is Russian (see i18n.js); texts are resolved at use time, never at load
export const STR = {
  en: {
    preset_slides: "Presentation", preset_design: "Design", preset_codebase: "Your code", preset_system: "Design system", preset_motion: "Animation",
    lead_slides: "new presentation: ", lead_design: "new design: ", lead_codebase: "new design in the project code: ", lead_system: "new design system: ", lead_motion: "new animation: ",
    tab_all: "All", tab_mine: "Mine", tab_others: "Others",
    sort_recent: "Newest first", sort_name: "By name",
    edited: "edited {ago}",
    asked: "Request sent to the hub, waiting",
    install: "Install",
    title: "Design",
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
    folder_count: "Designs: {n}",
    empty_folder: "No designs in this folder yet. Write on the left what you need: the designer will save it here.",
    os_mac: "Mac", os_windows: "Windows", os_linux: "Linux",
    peer_head: "{where} · designs: {n}",
    peer_note: "A picture only: the file, the canvas and the edits stay in the hub \u201c{where}\u201d",
    peer_noshot: "No picture yet",
    peer_close: "Close",
  },
  ru: {
    preset_slides: "Презентация", preset_design: "Дизайн", preset_codebase: "Свой код", preset_system: "Дизайн-система", preset_motion: "Анимация",
    lead_slides: "новая презентация: ", lead_design: "новый дизайн: ", lead_codebase: "новый дизайн в коде проекта: ", lead_system: "новая дизайн-система: ", lead_motion: "новая анимация: ",
    tab_all: "Все", tab_mine: "Мои", tab_others: "Остальные",
    sort_recent: "Сначала новые", sort_name: "По названию",
    edited: "изменён {ago}",
    asked: "Запрос отправлен хабу, ждём",
    install: "Поставить",
    title: "Дизайн",
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
    folder_count: "Макетов: {n}",
    empty_folder: "В этой папке пока нет макетов. Напишите слева, что нужно: дизайнер сохранит его сюда.",
    os_mac: "Mac", os_windows: "Windows", os_linux: "Linux",
    peer_head: "{where} · макетов: {n}",
    peer_note: "Только картинка: файл, холст и правки остались в хабе \u00ab{where}\u00bb",
    peer_noshot: "Снимка пока нет",
    peer_close: "Закрыть",
  },
};
export const t = makeT(STR);

// a preset is a new file of that kind: the chat goes to the specialist of the kind, a stub "new <kind>: …" lands in the input.
// title and lead are getters: they follow the hub language at the moment they are read
const preset = (id, to) => ({ id, to, get title() { return t("preset_" + id); }, get lead() { return t("lead_" + id); } });
export const PRESETS = [preset("slides", "designer"), preset("design", "designer"), preset("system", "designer"), preset("motion", "animator"), preset("codebase", "designer")];
export const TABS = ["all", "mine", "others"];   // ids; the label is t("tab_<id>")
export const SORTS = ["recent", "name"];         // ids; the label is t("sort_<id>")
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
  const by = sort === "name" ? (a, b) => label(a).localeCompare(label(b)) : (a, b) => (b.last || b.ts || 0) - (a.last || a.ts || 0);
  return rows.sort(by);
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
  motion: '<i class="a-card" style="left:14%;top:16%;width:72%;height:68%"><i class="a-ball b1"></i><i class="a-ball b2"></i><i class="a-ball b3"></i><i class="a-ball b4"></i></i>',
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
export const folderTitle = (key, dirs = [], tasks = []) => (isTaskKey(key) ? taskTitle(taskOfKey(key), tasks) : key ? ((dirs.find((d) => d.key === key) || {}).label || key.split("/").pop()) : t("folder_none"));
// what the dashboard shows: "folders" (tiles), "files" (the cards of one folder or all the designs). Tiles - only when there are direction folders and nothing is searched
// tasks: the Set of the ids of the tasks that have a folder (taskFolders of all the designs): their designs lie in the folder of the task, not of the direction
export function view(rows, dirs, { folder = null, q = "", tasks = new Set() } = {}) {
  if (folder !== null) return { mode: "files", rows: rows.filter((f) => folderKeyOf(f, dirs, tasks) === folder) };
  const groups = groupFiles(rows, dirs, tasks);
  if (String(q || "").trim() || !groups.some((g) => g.key)) return { mode: "files", rows };
  return { mode: "folders", groups };
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
  const put = (c, src) => { c.shown = src; if (c.img.src !== src) c.img.src = src; if (c.shot.dataset.live !== "1") c.shot.dataset.live = "1"; };
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
  // folder: null - all folders, "" - no direction, otherwise the folder key (its cwd); peer: the machine whose folder is open (null - none), pdir: the direction inside it (null - all)
  const S = { tab: "all", q: "", sort: "recent", list: false, path: false, folder: null, peer: null, pdir: null };
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
  const bSort = tool("sort", () => { S.sort = S.sort === "recent" ? "name" : "recent"; paint(); });
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
  back.addEventListener("click", () => { if (S.peer !== null && S.pdir !== null) S.pdir = null; else { S.peer = null; S.folder = null; } paint(); });
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
  root.append(page, lb);
  // keys typed in the search and path fields do not reach the canvas hotkeys
  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lb.hidden) closeLb(); e.stopPropagation(); });
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
      node.append(shot, body);
      c = { node, img, none, name, badge, text, src: "" };
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
    node.append(shots, body);
    tl = { node, cells, name, count };
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
  // returns how many cards and tiles of other machines are shown
  function paintPeers() {
    const list = (S.folder === null && app.peers && app.peers()) || [];
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
      setText(cname, S.pdir !== null ? (S.pdir || t("folder_none")) : hubName);
      setTitle(cname, hubName);
    } else {
      setText(back, "\u2190 " + t("crumb_all"));   // set here only: paint() setting it too made it flip on every snapshot inside a machine
    }
    // the folders of the machines: one tile each, as long as nothing is searched and no machine is open
    const tilesOnly = !open && !S.q.trim();
    const blocks = (open ? [open] : list).map((peer) => {
      const rows = peerRows(peer.items || [], { tab: S.tab, q: S.q });
      if (!rows.length) return null;
      const where = peerHub(peer, list);
      if (tilesOnly) {
        const tl = ptile(peer.machine, () => { S.peer = peer.machine; S.pdir = null; paint(); });
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
          fillTile(tl, peer, g.files, g.key || t("folder_none"));
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
    node.append(shot, tile, body);
    node.addEventListener("click", () => app.open(f.path));
    c = { path: f.path, node, shot, img, name, text, visible: false };
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
    node.append(shots, body);
    node.addEventListener("click", () => { S.folder = key; paint(); });
    tl = { node, cells, name, count };
    tiles.set(key, tl);
    return tl;
  }
  function paintFiles() {
    const all = app.files();
    const dirs = app.dirs ? app.dirs() : [];
    const taskList = app.tasks ? app.tasks() : [];
    const alive = all.filter((f) => !isGone(app.fileState(f.path)));
    const tset = taskFolders(alive);   // counted over all the designs: a search or a tab does not dissolve a folder
    // the labels ("Email-1: Kyoto") are numbered over all the designs of the folder too: a search or a tab does not renumber them
    const labels = labelsOf(alive.map((f) => ({ key: f.path, title: f.title, path: f.path, group: folderKeyOf(f, dirs, tset), ts: f.ts || f.last })));
    // designs whose files are gone (or that the plugin cannot show) are not listed at all; one open on the canvas gets a message in its frame
    const rows = shown(all, { tab: S.tab, q: S.q, sort: S.sort, mine: app.mine(), labels }).filter((f) => !isGone(app.fileState(f.path)));
    // a folder that has nothing in it any more (and is not a known direction) is closed
    if (S.folder && !dirs.some((d) => d.key === S.folder) && !rows.some((f) => folderKeyOf(f, dirs, tset) === S.folder)) S.folder = null;
    const inPeer = S.peer !== null;   // inside the folder of another machine its designs only: the own ones are hidden
    const v = inPeer ? { mode: "files", rows: [] } : view(rows, dirs, { folder: S.folder, q: S.q, tasks: tset });
    const inFolder = S.folder !== null;
    setHidden(crumb, !inFolder && !inPeer);
    if (inFolder) { setText(cname, folderTitle(S.folder, dirs, taskList)); setTitle(cname, isTaskKey(S.folder) ? folderTitle(S.folder, dirs, taskList) : S.folder); }
    // flat cards (a folder, a search or no direction folders at all)
    const list = v.mode === "files" ? v.rows : [];
    const named = !inFolder && (dirs.length > 0 || tset.size > 0);   // a search across folders tells where each design lies
    const nodes = list.map((f) => {
      const c = card(f);
      const fk = folderKeyOf(f, dirs, tset);
      const where = named ? folderTitle(fk, dirs, taskList) : "";
      setText(c.name, labels.get(f.path) || nameOf(f.path));
      setText(c.text, [f.session, named && fk ? where : "", editedText(f)].filter(Boolean).join(" · "));
      return c.node;
    });
    place(files, nodes);   // move only the ones that shifted: a card put back replays its entrance animation
    // tiles
    const groups = v.mode === "folders" ? v.groups : [];
    const live = new Set();
    const tnodes = groups.map((g) => {
      const tl = tile(g.key);
      setText(tl.name, folderTitle(g.key, dirs, taskList));
      setTitle(tl.node, isTaskKey(g.key) ? folderTitle(g.key, dirs, taskList) : g.key || t("folder_none"));
      setText(tl.count, t("folder_count", { n: g.files.length }));
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
    setHidden(files, inPeer || v.mode !== "files");
    const peerCount = paintPeers();
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
    for (const [id, b] of tabBtns) { setText(b, t("tab_" + id)); b.classList.toggle("on", S.tab === id); }
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
  return { node: root, paint, state: S, setFolder: (key) => { S.folder = key; S.peer = null; S.pdir = null; paint(); } };
}
