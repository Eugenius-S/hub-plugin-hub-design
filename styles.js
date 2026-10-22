// Hub Design: the style picker - a panel over the canvas with the style reference library of this hub (see styles.py): search by name, category and
// tags, a grid of previews, a card of a style (description, palette, fonts). "Attach" puts the style on the next message to the designer
// (lib.js styleLine). Only previews, a page at a time and lazily: the library has over a thousand styles, they are never loaded at once.
import { CANVAS_ICONS as CI } from "./icons.js";
import { makeT } from "./i18n.js";

export const PAGE = 24;   // previews on a screen; the next ones come by the pager, not by scrolling: the page never holds more than this
export const STR = {
  en: {
    btn: "Style", btn_title: "Pick a style reference for the designer",
    title: "Style reference", count: "{n} styles", found: "Found: {n}",
    search_ph: "Search by name, category or tag", all: "All",
    prev: "Back", next: "Next", page: "{a} / {b}",
    nothing: "Nothing found.", loading: "Loading…", failed: "The plugin process did not answer.",
    close: "Close", back: "All styles",
    attach: "Attach to the message", detach: "Detach", attached: "Attached: the designer gets the file with your next message",
    open_md: "Open DESIGN.md", site: "Site", palette: "Palette", fonts: "Fonts", tags: "Tags",
    theme_light: "light", theme_dark: "dark",
    chip: "Style: {name}", chip_title: "The designer gets the path of this style file with your next message",
  },
  ru: {
    btn: "Стиль", btn_title: "Выбрать стиль-референс для дизайнера",
    title: "Стили-референсы", count: "Стилей: {n}", found: "Найдено: {n}",
    search_ph: "Поиск по названию, категории или тегу", all: "Все",
    prev: "Назад", next: "Дальше", page: "{a} / {b}",
    nothing: "Ничего не нашлось.", loading: "Загрузка…", failed: "Процесс плагина не ответил.",
    close: "Закрыть", back: "Все стили",
    attach: "Прикрепить к сообщению", detach: "Открепить", attached: "Прикреплён: дизайнер получит файл с вашим следующим сообщением",
    open_md: "Открыть DESIGN.md", site: "Сайт", palette: "Палитра", fonts: "Шрифты", tags: "Теги",
    theme_light: "светлая", theme_dark: "тёмная",
    chip: "Стиль: {name}", chip_title: "Дизайнер получит путь к файлу этого стиля с вашим следующим сообщением",
  },
};
export const t = makeT(STR);

// --- pure parts (tests/styles.test.mjs) -------------------------------------------------------------------------------
// the paging of a result: where we are, how many pages, the offsets of the neighbours (null - none)
export function pager(total, offset, size = PAGE) {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.floor(Math.max(0, offset) / size) + 1);
  return { page, pages, prev: page > 1 ? (page - 2) * size : null, next: page < pages ? page * size : null };
}
// the request to the plugin process
export const listQuery = ({ q = "", cat = "", offset = 0, limit = PAGE } = {}) =>
  new URLSearchParams({ q: String(q).trim(), cat, offset: String(offset), limit: String(limit) }).toString();
// what is stored and sent about the chosen style: only its id, name and the path of the file; anything else is dropped
export function chosen(raw) {
  const s = raw && typeof raw === "object" ? raw : null;
  return s && typeof s.id === "string" && typeof s.path === "string" && s.path ? { id: s.id, name: String(s.name || s.id).slice(0, 120), path: s.path } : null;
}
// a readable label color over a swatch: black or white by the perceived brightness (#rgb, #rrggbb, #rrggbbaa)
export function textOn(hex) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (h.length < 6 || Number.isNaN(n)) return "#000";
  const y = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return y > 150 ? "#000" : "#fff";
}
const initials = (name) => String(name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// --- the panel ---------------------------------------------------------------------------------------------------------
// base: () => the address of the plugin process; get/set: the style attached now (the page keeps it); hub.el builds the nodes
export function createStyles({ hub, base, get, set, onChange = () => {} }) {
  const el = hub.el;
  const S = { avail: false, q: "", cat: "", offset: 0, total: 0, items: [], cats: [], count: 0, detail: null, state: "idle", seq: 0, timer: 0 };
  const node = el("div", "hds");
  node.hidden = true;
  node.setAttribute("role", "dialog");
  const head = el("div", "hds-head");
  const h1 = el("h2", "hds-h1");
  const sub = el("span", "hds-sub");
  const x = el("button", "hds-x");
  x.type = "button";
  x.innerHTML = CI.close || "×";
  x.addEventListener("click", () => close());
  head.append(h1, sub, x);
  const bar = el("div", "hds-bar");
  const search = el("input", "hds-search");
  search.type = "search";
  search.addEventListener("input", () => { clearTimeout(S.timer); S.timer = setTimeout(() => { S.q = search.value; S.offset = 0; load(); }, 250); });
  bar.append(search);
  const cats = el("div", "hds-cats");
  const body = el("div", "hds-body");
  const foot = el("div", "hds-foot");
  node.append(head, bar, cats, body, foot);
  node.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); S.detail ? back() : close(); } });

  const url = (route, params) => `${base()}/__canvas/${route}?${params}`;
  const preview = (id) => url("style-preview", new URLSearchParams({ id }).toString());
  async function ask(route, params) {
    const res = await fetch(url(route, params), { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  // is there a library: the button is shown only if so; asked when Hub Design opens and when the process wakes up
  async function probe() {
    let ok = false;
    let answered = false;
    try { const r = await ask("styles", listQuery({ limit: 0 })); ok = !!r.ok; answered = true; S.count = r.count || 0; } catch { ok = false; }
    if (ok !== S.avail) { S.avail = ok; onChange(); }
    await recheck(answered, ok);
    return ok;
  }

  // a style kept from an earlier visit: the library may have changed since. The library is gone or the style is not in it - drop the choice,
  // the file moved - take the new path; the process not answering at all proves nothing, the choice stays
  async function recheck(answered, ok) {
    const cur = get();
    if (!cur || !answered) return;
    if (!ok) return set(null);
    try {
      const d = await ask("style", new URLSearchParams({ id: cur.id }).toString());
      if (d && typeof d.path === "string" && d.path && d.path !== cur.path) set({ ...cur, path: d.path });
    } catch (e) {
      if (String(e && e.message) === "404") set(null);
    }
  }

  async function load() {
    const my = ++S.seq;
    S.state = "loading";
    paintBody();
    try {
      const r = await ask("styles", listQuery({ q: S.q, cat: S.cat, offset: S.offset }));
      if (my !== S.seq) return;
      if (!r.ok) { S.avail = false; onChange(); return close(); }
      Object.assign(S, { items: r.items, total: r.total, cats: r.cats || [], count: r.count, state: "ok" });
    } catch {
      if (my !== S.seq) return;
      S.state = "failed";
    }
    paint();
  }

  async function open() {
    S.detail = null;
    node.hidden = false;
    paint();
    search.focus();
    await load();
  }
  function close() { node.hidden = true; S.seq += 1; }
  function back() { S.detail = null; paint(); }
  async function show(id) {
    const my = ++S.seq;
    S.detail = { id, loading: true };
    paint();
    try {
      const d = await ask("style", new URLSearchParams({ id }).toString());
      if (my !== S.seq) return;
      S.detail = d;
    } catch {
      if (my !== S.seq) return;
      S.detail = { id, failed: true };
    }
    paint();
  }
  const attached = (id) => { const s = get(); return !!s && s.id === id; };
  function attach(d) {
    set(attached(d.id) ? null : chosen({ id: d.id, name: d.name, path: d.path }));
    close();
  }

  const btn = (cls, text, fn) => { const b = el("button", cls, text); b.type = "button"; b.addEventListener("click", fn); return b; };

  function paintCats() {
    cats.hidden = !!S.detail || !S.cats.length;
    if (cats.hidden) return;
    const chip = (name, label, n) => { const b = btn("hds-cat" + (S.cat === name ? " on" : ""), label + (n != null ? ` ${n}` : ""), () => { S.cat = name; S.offset = 0; load(); }); return b; };
    cats.replaceChildren(chip("", t("all"), S.count), ...S.cats.map((c) => chip(c.name, c.name, c.n)));
  }

  function card(it) {
    const b = el("button", "hds-card" + (attached(it.id) ? " on" : ""));
    b.type = "button";
    b.title = it.name;
    let pic;
    if (it.preview) {
      pic = el("img", "hds-img");
      pic.loading = "lazy";
      pic.decoding = "async";
      pic.alt = "";
      pic.src = preview(it.id);
    } else {
      pic = el("span", "hds-img hds-none", initials(it.name));
    }
    b.append(pic, el("span", "hds-name", it.name), el("span", "hds-cat-name", it.category || ""));
    b.addEventListener("click", () => show(it.id));
    return b;
  }

  function paintDetail(d) {
    const wrap = el("div", "hds-detail");
    if (d.loading || d.failed) { wrap.append(el("div", "hds-empty", d.failed ? t("failed") : t("loading"))); return wrap; }
    const left = el("div", "hds-dl");
    if (d.preview) { const img = el("img", "hds-big"); img.alt = ""; img.src = preview(d.id); left.append(img); }
    const right = el("div", "hds-dr");
    const meta = [d.category, d.theme === "dark" ? t("theme_dark") : d.theme === "light" ? t("theme_light") : ""].filter(Boolean).join(" · ");
    right.append(el("h3", "hds-dname", d.name), el("div", "hds-dmeta", meta));
    if (d.tagline) right.append(el("p", "hds-tag", d.tagline));
    if (d.description) right.append(el("p", "hds-desc", d.description));
    const row = el("div", "hds-acts");
    const on = attached(d.id);
    row.append(btn("hds-go" + (on ? " on" : ""), on ? t("detach") : t("attach"), () => attach(d)));
    const md = el("a", "hds-link", t("open_md"));
    md.href = url("style-md", new URLSearchParams({ id: d.id }).toString());
    md.target = "_blank";
    md.rel = "noopener";
    row.append(md);
    if (d.site) { const a = el("a", "hds-link", t("site")); a.href = d.site; a.target = "_blank"; a.rel = "noopener noreferrer"; row.append(a); }
    right.append(row);
    if (on) right.append(el("div", "hds-note", t("attached")));
    if (d.palette && d.palette.length) {
      right.append(el("h4", "hds-h4", t("palette")));
      const sw = el("div", "hds-sw");
      for (const c of d.palette) {
        const s = el("span", "hds-swatch", c.hex);
        s.style.background = c.hex;
        s.style.color = textOn(c.hex);
        s.title = [c.name, c.role].filter(Boolean).join(": ");
        sw.append(s);
      }
      right.append(sw);
    }
    if (d.fonts && d.fonts.length) right.append(el("h4", "hds-h4", t("fonts")), el("div", "hds-fonts", d.fonts.join(", ")));
    if (d.tags && d.tags.length) { right.append(el("h4", "hds-h4", t("tags"))); const tg = el("div", "hds-tags"); for (const x of d.tags) tg.append(el("span", "hds-tagc", x)); right.append(tg); }
    wrap.append(left, right);
    return wrap;
  }

  function paint() {
    h1.textContent = S.detail ? "" : t("title");
    if (S.detail) h1.replaceChildren(btn("hds-backb", "← " + t("back"), back));
    sub.textContent = S.detail ? "" : S.q.trim() || S.cat ? t("found", { n: S.total }) : S.count ? t("count", { n: S.count }) : "";
    x.title = t("close");
    search.placeholder = t("search_ph");
    bar.hidden = !!S.detail;
    paintCats();
    paintBody();
  }

  function paintBody() {
    if (S.detail) { body.replaceChildren(paintDetail(S.detail)); foot.hidden = true; return; }
    if (S.state === "failed") { body.replaceChildren(el("div", "hds-empty", t("failed"))); foot.hidden = true; return; }
    if (S.state === "loading" && !S.items.length) { body.replaceChildren(el("div", "hds-empty", t("loading"))); foot.hidden = true; return; }
    if (!S.items.length) { body.replaceChildren(el("div", "hds-empty", t("nothing"))); foot.hidden = true; return; }
    const grid = el("div", "hds-grid");
    grid.append(...S.items.map(card));
    body.replaceChildren(grid);
    body.scrollTop = 0;
    const p = pager(S.total, S.offset);
    foot.hidden = p.pages < 2;
    const go = (to) => () => { S.offset = to; load(); };
    const prev = btn("hds-pg", t("prev"), go(p.prev));
    const next = btn("hds-pg", t("next"), go(p.next));
    prev.disabled = p.prev == null;
    next.disabled = p.next == null;
    foot.replaceChildren(prev, el("span", "hds-pages", t("page", { a: p.page, b: p.pages })), next);
  }

  return { node, open, close, probe, avail: () => S.avail, state: S, repaint: () => { if (!node.hidden) paint(); } };
}
