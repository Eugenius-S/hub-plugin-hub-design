// Hub Design: стартовый экран, как дашборд Claude Design: заголовок, вкладки «Все / Мои / Чужие», поиск, вид и сортировка,
// ряд пресетов (новый файл этого вида) и прошлые макеты карточками с живым превью. Цвета, шрифты и тень — тема хаба.
import { ago, frameTitle, isGone } from "./lib.js";
import { CANVAS_ICONS as CI } from "./icons.js";

// пресет — новый файл этого вида: чат уходит специалисту вида, в поле ввода ложится заготовка «новый <вид>: …»
export const PRESETS = [
  { id: "slides", title: "Презентация", badge: "Новое", to: "designer", lead: "новая презентация: " },
  { id: "design", title: "Дизайн", badge: "Новое", to: "designer", lead: "новый дизайн: " },
  { id: "codebase", title: "Дизайн в коде", to: "designer", lead: "новый дизайн в коде проекта: " },
  { id: "system", title: "Дизайн-система", to: "designer", lead: "новая дизайн-система: " },
  { id: "motion", title: "Анимация", badge: "Бета", to: "animator", lead: "новая анимация: " },
];
export const TABS = [["all", "Все"], ["mine", "Мои"], ["others", "Чужие"]];
export const SORTS = [["recent", "Сначала новые"], ["name", "По названию"]];
const STUBS = new Set(PRESETS.map((p) => p.lead));

// заготовка в поле: заменяем прежнюю заготовку, но не слова владельца
export const isStub = (text) => STUBS.has(text);
export const stubText = (current, lead) => (!current.trim() || isStub(current) ? lead : current);

// index.html называют по папке: «kolo», а не «index»
export const nameOf = (path) => {
  const parts = String(path).split(/[\\/]/).filter(Boolean);
  const name = frameTitle(path).replace(/\.html?$/i, "");
  return name.toLowerCase() === "index" && parts.length > 1 ? parts[parts.length - 2] : name;
};

// «Мои» — макеты, которые владелец держит на холсте; «Чужие» — остальные (их написали специалисты и сессии хаба)
export function shown(files, { tab = "all", q = "", sort = "recent", mine = new Set() } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  const rows = files.filter((f) => (tab === "all" || (tab === "mine") === mine.has(f.path))
    && (!needle || (nameOf(f.path) + " " + f.path + " " + (f.session || "")).toLowerCase().includes(needle)));
  const by = sort === "name" ? (a, b) => nameOf(a.path).localeCompare(nameOf(b.path)) : (a, b) => (b.last || b.ts || 0) - (a.last || a.ts || 0);
  return rows.sort(by);
}
export const editedText = (f, now) => {
  const t = ago(f.last || f.ts, now);
  return t ? `изменён ${t}` : "";
};

// рисунки пресетов — как плитки в Claude Design, на цветах темы
const ART = {
  slides: '<i class="a-card" style="left:14%;top:20%;width:72%;height:60%"><i class="a-bar" style="left:9%;top:14%;width:52%;height:13%"></i><i class="a-line" style="left:9%;top:44%;width:40%;height:8%"></i><i class="a-line" style="left:9%;top:62%;width:30%;height:8%"></i><i class="a-pic" style="left:66%;top:42%;width:24%;height:30%"></i></i>',
  design: '<i class="a-card" style="left:36%;top:6%;width:30%;height:88%;border-radius:12px"><i class="a-dot" style="left:16%;top:30%"></i><i class="a-line" style="left:40%;top:32%;width:44%;height:6%"></i><i class="a-dot" style="left:16%;top:50%"></i><i class="a-line" style="left:40%;top:52%;width:34%;height:6%"></i></i>',
  codebase: '<i class="a-card" style="left:44%;top:14%;width:36%;height:40%;opacity:.8"></i><i class="a-term" style="left:16%;top:38%;width:50%;height:48%"><b>&gt;_</b></i>',
  system: '<i class="a-card" style="left:14%;top:14%;width:72%;height:72%"><i class="a-sw s1" style="left:10%;top:14%"></i><i class="a-sw s2" style="left:30%;top:14%"></i><i class="a-sw s3" style="left:50%;top:14%"></i><i class="a-sw s4" style="left:70%;top:14%"></i><i class="a-bar" style="left:10%;top:58%;width:42%;height:10%"></i><i class="a-line" style="left:10%;top:76%;width:80%;height:8%"></i></i>',
  motion: '<i class="a-card" style="left:14%;top:16%;width:72%;height:68%"><i class="a-ball b1"></i><i class="a-ball b2"></i><i class="a-ball b3"></i><i class="a-ball b4"></i></i>',
};

// createDashboard(app): app = { hub, files(), mine(), alive(), fileState(path), fileUrl(path), open(path), preset(p), openPath(path) }
export function createDashboard(app) {
  const el = (tag, cls, text) => app.hub.el(tag, cls, text);
  const S = { tab: "all", q: "", sort: "recent", list: false, search: false, path: false };
  const root = el("div", "hdd");
  const page = el("div", "hdd-page");

  const head = el("h1", "hdd-h1", "Дизайн");
  const tabs = el("div", "hdd-tabs");
  const tabBtns = TABS.map(([id, label]) => {
    const b = el("button", "hdd-tab", label);
    b.type = "button";
    b.addEventListener("click", () => { S.tab = id; paint(); });
    return [id, b];
  });
  tabs.append(...tabBtns.map(([, b]) => b));
  const tool = (icon, title, fn) => {
    const b = el("button", "hdd-tool");
    b.type = "button";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = CI[icon];
    b.addEventListener("click", fn);
    return b;
  };
  const search = el("input", "hdd-search");
  search.type = "search";
  search.placeholder = "Поиск по макетам";
  search.addEventListener("input", () => { S.q = search.value; paintFiles(); });
  const bSearch = tool("search", "Поиск", () => { S.search = !S.search; if (!S.search) { S.q = ""; search.value = ""; } paint(); if (S.search) search.focus(); });
  const bView = tool("list", "Список", () => { S.list = !S.list; paint(); });
  const bSort = tool("sliders", "Сортировка", () => { S.sort = S.sort === "recent" ? "name" : "recent"; paint(); });
  const bMore = tool("more", "Открыть макет по пути", () => { S.path = !S.path; paint(); if (S.path) pathIn.focus(); });
  bMore.classList.add("hdd-more");
  const tools = el("div", "hdd-tools");
  tools.append(search, bSearch, bView, bSort, bMore);
  const bar = el("div", "hdd-bar");
  bar.append(tabs, tools);

  const pathIn = el("input", "hdd-path");
  pathIn.placeholder = "Открыть по пути: /…/index.html";
  pathIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && pathIn.value.trim()) app.openPath(pathIn.value); });

  const presets = el("div", "hdd-presets");
  for (const p of PRESETS) {
    const b = el("button", "hdd-preset");
    b.type = "button";
    b.dataset.preset = p.id;
    const art = el("span", "hdd-art a-" + p.id);
    art.innerHTML = ART[p.id];
    const label = el("span", "hdd-plabel", p.title);
    if (p.badge) label.append(el("span", "hdd-badge " + (p.badge === "Бета" ? "beta" : "new"), p.badge));
    b.append(art, label);
    b.addEventListener("click", () => app.preset(p));
    presets.append(b);
  }

  const files = el("div", "hdd-files");
  const empty = el("div", "hdd-empty");
  page.append(head, bar, pathIn, presets, files, empty);
  root.append(page);
  // клавиши в поиске и пути не доходят до горячих клавиш холста
  root.addEventListener("keydown", (e) => e.stopPropagation());

  // превью — настоящий документ в уменьшенном iframe, грузим только то, что на виду (и не больше LIVE_MAX разом)
  const LIVE_MAX = 16;
  const cards = new Map();   // путь → {node, shot, frame, meta, name, live}
  const fit = (c) => {
    const w = c.shot.clientWidth, h = c.shot.clientHeight;
    if (!w || !h) return;
    const k = Math.min(w / 1440, h / 900);
    c.frame.style.transform = `translate(-50%,-50%) scale(${k})`;
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
  function card(f) {
    let c = cards.get(f.path);
    if (c) return c;
    const node = el("button", "hdd-card");
    node.type = "button";
    node.dataset.path = f.path;
    node.title = f.path;
    const shot = el("span", "hdd-shot");
    const frame = el("iframe", "hdd-frame");
    frame.setAttribute("tabindex", "-1");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("title", nameOf(f.path));
    shot.append(frame);
    const tile = el("span", "hdd-tile");
    tile.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 3a9 9 0 1 0 0 18c1.4 0 2.2-.9 2.2-2 0-.6-.3-1.1-.3-1.7 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Zm-5 9a1.4 1.4 0 1 1 0-2.8A1.4 1.4 0 0 1 7 12Zm3-4a1.4 1.4 0 1 1 0-2.8A1.4 1.4 0 0 1 10 8Zm5 0a1.4 1.4 0 1 1 0-2.8A1.4 1.4 0 0 1 15 8Z"/></svg>';
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
  function paintFiles() {
    const all = app.files();
    // макеты, чьих файлов нет (или плагин их показать не может), в списке не показываем вовсе; открытый на холсте — сообщением в рамке
    const rows = shown(all, { tab: S.tab, q: S.q, sort: S.sort, mine: app.mine() }).filter((f) => !isGone(app.fileState(f.path)));
    const nodes = rows.map((f) => {
      const c = card(f);
      c.text.textContent = [f.session, editedText(f)].filter(Boolean).join(" · ");
      return c.node;
    });
    // двигаем только сместившиеся: перенос iframe в DOM перезагружает его
    nodes.forEach((n, i) => { if (files.children[i] !== n) files.insertBefore(n, files.children[i] || null); });
    while (files.children.length > nodes.length) files.lastChild.remove();
    for (const [path, c] of cards) if (!all.some((f) => f.path === path)) { sizes.unobserve(c.shot); seen.unobserve(c.node); cards.delete(path); }
    empty.hidden = nodes.length > 0;
    empty.textContent = all.length
      ? "Ничего не нашлось."
      : "Макетов пока нет. Выберите вид выше или напишите слева, что нужно, — специалист сделает новый файл.";
    for (const c of cards.values()) { load(c); fit(c); }
  }
  function paint() {
    for (const [id, b] of tabBtns) b.classList.toggle("on", S.tab === id);
    search.hidden = !S.search;
    bSearch.classList.toggle("on", S.search);
    bView.classList.toggle("on", S.list);
    bView.innerHTML = CI[S.list ? "grid" : "list"];
    bView.title = S.list ? "Плитки" : "Список";
    bSort.title = "Сортировка: " + SORTS.find(([id]) => id === S.sort)[1];
    bSort.classList.toggle("on", S.sort !== "recent");
    bMore.classList.toggle("on", S.path);
    pathIn.hidden = !S.path;
    files.classList.toggle("list", S.list);
    paintFiles();
  }
  paint();
  return { node: root, paint, state: S };
}
