// Hub Design: the start screen, like the Claude Design dashboard: a title, tabs "All / Mine / Others", search, view and sort,
// a row of presets (a new file of that kind) and past designs as cards with a live preview. Colors, fonts and shadow come from the hub theme.
import { ago, bannerText, folderOf, groupFiles, isGone, nameOf, scrollsRight } from "./lib.js";
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
    peer_note: "A picture only: the file, the canvas and the edits are on {where}",
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
    peer_note: "Только картинка: файл, холст и правки лежат на машине {where}",
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
export function shown(files, { tab = "all", q = "", sort = "recent", mine = new Set() } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  const rows = files.filter((f) => (tab === "all" || (tab === "mine") === mine.has(f.path))
    && (!needle || (nameOf(f.path) + " " + f.path + " " + (f.session || "")).toLowerCase().includes(needle)));
  const by = sort === "name" ? (a, b) => nameOf(a.path).localeCompare(nameOf(b.path)) : (a, b) => (b.last || b.ts || 0) - (a.last || a.ts || 0);
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
export const folderTitle = (key, dirs = []) => (key ? ((dirs.find((d) => d.key === key) || {}).label || key.split("/").pop()) : t("folder_none"));
// what the dashboard shows: "folders" (tiles), "files" (the cards of one folder or all the designs). Tiles - only when there are direction folders and nothing is searched
export function view(rows, dirs, { folder = null, q = "" } = {}) {
  if (folder !== null) return { mode: "files", rows: rows.filter((f) => folderOf(f.path, dirs) === folder) };
  const groups = groupFiles(rows, dirs);
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
export const peerName = (it) => it.name || nameOf(it.file || "") || it.id;

export const newest = (rows, n = PREVIEWS) => [...rows].sort((a, b) => (b.last || b.ts || 0) - (a.last || a.ts || 0)).slice(0, n);

// createDashboard(app): app = { hub, files(), dirs(), mine(), alive(), fileState(path), fileUrl(path), open(path), preset(p), openPath(path), lacking(), install(name),
//   peers() - [{machine, os, items}] of the other machines, peerShot(machine, shot) - the url of a picture }
export function createDashboard(app) {
  const el = (tag, cls, text) => app.hub.el(tag, cls, text);
  const S = { tab: "all", q: "", sort: "recent", list: false, search: false, path: false, folder: null };   // folder: null - all folders, "" - no direction, otherwise the folder key (its cwd)
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
  const search = el("input", "hdd-search");
  search.type = "search";
  search.addEventListener("input", () => { S.q = search.value; paintFiles(); });
  const bSearch = tool("search", () => { S.search = !S.search; if (!S.search) { S.q = ""; search.value = ""; } paint(); if (S.search) search.focus(); });
  const bView = tool("list", () => { S.list = !S.list; paint(); });
  const bSort = tool("sliders", () => { S.sort = S.sort === "recent" ? "name" : "recent"; paint(); });
  const bMore = tool("more", () => { S.path = !S.path; paint(); if (S.path) pathIn.focus(); });
  bMore.classList.add("hdd-more");
  const tools = el("div", "hdd-tools");
  tools.append(search, bSearch, bView, bSort, bMore);
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
  back.addEventListener("click", () => { S.folder = null; paint(); });
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
  // returns how many cards of other machines are shown
  function paintPeers(inFolder) {
    const list = (!inFolder && app.peers && app.peers()) || [];
    const live = new Set();
    let count = 0;
    const blocks = list.map((peer) => {
      const rows = peerRows(peer.items || [], { tab: S.tab, q: S.q });
      if (!rows.length) return null;
      const where = peerWhere(peer, list);
      const box = el("section", "hdd-peer");
      box.dataset.machine = peer.machine;
      const h = el("h2", "hdd-phead", t("peer_head", { where, n: rows.length }));
      const grid = el("div", "hdd-files hdd-pfiles");
      grid.classList.toggle("list", S.list);
      grid.append(...rows.map((it) => {
        const c = pcard(peer, it);
        live.add(peer.machine + "/" + it.id);
        Object.assign(c, { peer, it, where });
        c.node.title = it.file || "";
        c.name.textContent = peerName(it);
        c.badge.textContent = where;
        c.text.textContent = [it.session, editedText(it)].filter(Boolean).join(" · ");
        const src = it.shot ? app.peerShot(peer.machine, it.shot) + "&v=" + encodeURIComponent(it.stamp || it.last || "") : "";
        if (c.src !== src) { c.src = src; if (src) c.img.src = src; else c.img.removeAttribute("src"); }
        c.img.hidden = !src;
        c.none.hidden = !!src;
        c.none.textContent = src ? "" : t("peer_noshot");
        return c.node;
      }));
      count += rows.length;
      box.append(h, grid);
      return box;
    }).filter(Boolean);
    others.replaceChildren(...blocks);
    others.hidden = !blocks.length;
    for (const key of [...pcards.keys()]) if (!live.has(key)) pcards.delete(key);
    return count;
  }

  // a preview is the real document in a scaled-down iframe; only what is in view is loaded (and no more than LIVE_MAX at once)
  const LIVE_MAX = 16;
  const cards = new Map();   // path -> {path, node, shot, frame, meta, name, live}; the previews of folder tiles are "t:<path>"
  const fit = (c) => {
    const w = c.shot.clientWidth, h = c.shot.clientHeight;
    if (!w || !h) return;
    c.frame.style.transform = `scale(${w / 1440})`;   // fit to width, no side margins: the lower part is cropped
  };
  const sizes = new ResizeObserver((rows) => { for (const r of rows) { const c = [...cards.values()].find((x) => x.shot === r.target); if (c) fit(c); } });
  const seen = new IntersectionObserver((rows) => {
    for (const r of rows) {
      const c = [...cards.values()].find((x) => x.node === r.target);
      if (c) { c.visible = r.isIntersecting; load(c); }
    }
  }, { root, rootMargin: "200px" });
  function load(c) {
    const want = c.visible && app.alive() && !S.list && !isGone(app.fileState(c.path));
    if (want && !c.frame.src && [...cards.values()].filter((x) => x.frame.src).length < LIVE_MAX) {
      c.frame.src = app.fileUrl(c.path);
      c.shot.dataset.live = "1";
    }
  }
  // a live preview: the real document in a scaled-down iframe
  function shotOf(path, cls) {
    const shot = el("span", cls);
    const frame = el("iframe", "hdd-frame");
    frame.setAttribute("tabindex", "-1");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("title", nameOf(path));
    shot.append(frame);
    return { shot, frame };
  }
  function thumb(path) {
    const key = "t:" + path;
    let c = cards.get(key);
    if (c) return c;
    const { shot, frame } = shotOf(path, "hdd-shot hdd-tshot");
    c = { path, node: shot, shot, frame, visible: false };
    cards.set(key, c);
    sizes.observe(shot);
    seen.observe(shot);
    return c;
  }
  function card(f) {
    let c = cards.get(f.path);
    if (c) return c;
    const node = el("button", "hdd-card");
    node.type = "button";
    node.dataset.path = f.path;
    node.title = f.path;
    const { shot, frame } = shotOf(f.path, "hdd-shot");
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
    c = { path: f.path, node, shot, frame, name, text, visible: false };
    cards.set(f.path, c);
    sizes.observe(shot);
    seen.observe(node);
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
    // designs whose files are gone (or that the plugin cannot show) are not listed at all; one open on the canvas gets a message in its frame
    const rows = shown(all, { tab: S.tab, q: S.q, sort: S.sort, mine: app.mine() }).filter((f) => !isGone(app.fileState(f.path)));
    // a folder that has nothing in it any more (and is not a known direction) is closed
    if (S.folder && !dirs.some((d) => d.key === S.folder) && !rows.some((f) => folderOf(f.path, dirs) === S.folder)) S.folder = null;
    const v = view(rows, dirs, { folder: S.folder, q: S.q });
    const inFolder = S.folder !== null;
    crumb.hidden = !inFolder;
    if (inFolder) { cname.textContent = folderTitle(S.folder, dirs); cname.title = S.folder; }
    // flat cards (a folder, a search or no direction folders at all)
    const list = v.mode === "files" ? v.rows : [];
    const named = !inFolder && dirs.length > 0;   // a search across folders tells where each design lies
    const nodes = list.map((f) => {
      const c = card(f);
      const where = named ? folderTitle(folderOf(f.path, dirs), dirs) : "";
      c.text.textContent = [f.session, named && folderOf(f.path, dirs) ? where : "", editedText(f)].filter(Boolean).join(" · ");
      return c.node;
    });
    // move only the ones that shifted: moving an iframe in the DOM reloads it
    nodes.forEach((n, i) => { if (files.children[i] !== n) files.insertBefore(n, files.children[i] || null); });
    while (files.children.length > nodes.length) files.lastChild.remove();
    // tiles
    const groups = v.mode === "folders" ? v.groups : [];
    const live = new Set();
    const tnodes = groups.map((g) => {
      const tl = tile(g.key);
      tl.name.textContent = folderTitle(g.key, dirs);
      tl.node.title = g.key || t("folder_none");
      tl.count.textContent = t("folder_count", { n: g.files.length });
      newest(g.files).forEach((f, i) => {
        const c = thumb(f.path);
        live.add("t:" + f.path);
        if (tl.cells[i].firstChild !== c.shot) tl.cells[i].replaceChildren(c.shot);
      });
      for (let i = Math.min(g.files.length, PREVIEWS); i < PREVIEWS; i++) tl.cells[i].replaceChildren();
      return tl.node;
    });
    tnodes.forEach((n, i) => { if (folders.children[i] !== n) folders.insertBefore(n, folders.children[i] || null); });
    while (folders.children.length > tnodes.length) folders.lastChild.remove();
    for (const key of [...tiles.keys()]) if (!groups.some((g) => g.key === key)) tiles.delete(key);
    const shownNow = new Set(list.map((f) => f.path));
    for (const [key, c] of cards) {
      const thumbOnly = key.startsWith("t:");
      if (thumbOnly ? !live.has(key) : !all.some((f) => f.path === key)) { sizes.unobserve(c.shot); seen.unobserve(c.node); cards.delete(key); continue; }
      // what is not on the screen now gives its live frame back: only visible previews take the LIVE_MAX places
      if (!thumbOnly && !shownNow.has(key) && c.frame.src) { c.frame.removeAttribute("src"); delete c.shot.dataset.live; c.visible = false; }
    }
    folders.hidden = !tnodes.length;
    files.hidden = v.mode !== "files";
    const peerCount = paintPeers(inFolder);
    empty.hidden = nodes.length > 0 || tnodes.length > 0 || peerCount > 0;
    // "Nothing found" only when the owner searched or picked a tab; on "All" with no search and no designs - "No designs yet"
    empty.textContent = inFolder && !S.q.trim() && S.tab === "all" ? t("empty_folder") : S.q.trim() || S.tab !== "all" ? t("empty_found") : t("empty_none");
    for (const c of cards.values()) { load(c); fit(c); }
    folders.classList.toggle("list", S.list);
  }
  function paint() {
    // static texts are set here, not at creation: the hub language is read at use time
    head.textContent = t("title");
    search.placeholder = t("search_ph");
    pathIn.placeholder = t("path_ph");
    for (const [b, key] of [[bSearch, "search"], [bMore, "open_by_path"]]) { b.title = t(key); b.setAttribute("aria-label", b.title); }
    bView.title = S.list ? t("tiles") : t("list");
    bView.setAttribute("aria-label", bView.title);
    bSort.title = t("sort") + ": " + t("sort_" + S.sort);
    bSort.setAttribute("aria-label", bSort.title);
    for (const [p, label] of labels) label.textContent = p.title.replace("-", "\u2011").replace(/ (\u0432|in) /, " $1\u00a0");   // wrap only between words: not at the hyphen, not after the preposition (0432 in Russian)
    for (const [id, b] of tabBtns) { b.textContent = t("tab_" + id); b.classList.toggle("on", S.tab === id); }
    back.textContent = "\u2190 " + t("crumb_all");
    search.hidden = !S.search;
    bSearch.classList.toggle("on", S.search);
    bView.classList.toggle("on", S.list);
    bView.innerHTML = CI[S.list ? "grid" : "list"];
    bSort.classList.toggle("on", S.sort !== "recent");
    bMore.classList.toggle("on", S.path);
    pathIn.hidden = !S.path;
    // the required specialist is missing - a banner; a wanted one - a quiet line by its preset
    const lack = app.lacking();
    need.paint(lack.filter((n) => n.need === "required"));
    for (const p of PRESETS) {
      const n = lack.find((x) => x.name === p.to && x.need !== "required");
      const sub = subs.get(p.id);
      sub.hidden = !n;
      sub.textContent = n ? t("no_specialist", { name: n.name }) : "";
    }
    files.classList.toggle("list", S.list);
    paintFiles();
    fade();
  }
  paint();
  return { node: root, paint, state: S, setFolder: (key) => { S.folder = key; paint(); } };
}
