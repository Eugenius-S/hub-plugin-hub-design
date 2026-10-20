// Hub Design: чистая логика без DOM — адреса, список файлов сессии, текст правок для дизайнера. Тесты: tests/lib.test.mjs

// ширина окна дизайна — переключатель «Окно» в панели настроек
export const SIZES = [
  { id: "fit", label: "По окну", w: 0 },
  { id: "desktop", label: "1440", w: 1440 },
  { id: "laptop", label: "1280", w: 1280 },
  { id: "tablet", label: "768", w: 768 },
  { id: "mobile", label: "390", w: 390 },
];

// масштаб: 0 — вписать по ширине
export const ZOOMS = [0, 50, 75, 100, 125, 150];

// порт процесса плагина: порт страницы хаба + 11 (8787 → 8798), как в server.py
export const canvasPort = (pagePort) => Number(pagePort || 8787) + 11;

// адрес файла у процесса: /f/Users/me/site/index.html, Windows — /f/C:/site/index.html
export function fileUrl(origin, path) {
  const p = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
  return `${origin}/f/${p.split("/").map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join("/")}`;
}

// путь в кавычках может быть с пробелами («…/!!Work/!!! 2M DESIGN/…/a.html»); без кавычек пробел обрывает путь, а откусывать от него хвост нельзя:
// «/analytics/weekly/a.html» из «Threads/analytics/weekly/a.html» — несуществующий файл, а на холсте он сырой ответ сервера (0.5.1)
const QUOTED_PATH = /(["'`])((?:~|\/|[A-Za-z]:[\\/])[^"'`\n<>]*?\.html?)\1/gu;
const HTML_PATH = /(?<![\p{L}\p{N}_\/.~:!-])(?:~|\/|[A-Za-z]:[\\/])[^\s"'`<>()\[\]{}|,;*]*?\.html?(?![\w])/gu;

export function htmlPaths(text) {
  const src = String(text || "");
  const found = [];
  let rest = src;
  for (const m of src.matchAll(QUOTED_PATH)) {
    found.push([m.index + 1, m[2]]);
    rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  for (const m of rest.matchAll(HTML_PATH)) found.push([m.index, m[0]]);
  return found.sort((a, b) => a[0] - b[0]).map((x) => x[1]).filter((p) => !p.includes("://"));
}

// HTML-файлы, с которыми работала сессия: что писала и правила, что прислала, что назвала — свежие первыми
export function recentHtml(items, limit = 12) {
  const out = [];
  const add = (p) => {
    if (!p || !/\.html?$/i.test(p) || p.startsWith("http")) return;
    const i = out.indexOf(p);
    if (i >= 0) out.splice(i, 1);
    out.push(p);
  };
  for (const it of items || []) {
    if (it.kind === "tool") {
      const inp = it.input || {};
      add(inp.file_path || inp.path || inp.notebook_path);
    } else if (it.kind === "file") add(it.path);
    else if (it.kind === "out" || it.kind === "in") htmlPaths(it.text).forEach(add);
  }
  return out.reverse().slice(0, limit);
}

// макеты всех сессий и их авторы: автор — кто писал файл инструментом (Write/Edit), иначе кто назвал его последним.
// timelines: {сессия: [элементы ленты]}; skip — сессии, которые макетов не ведут (хаб, исполнители)
const WRITE_TOOLS = /^(Write|Edit|MultiEdit)$/;
export function htmlAuthored(timelines, skip = () => false) {
  const best = new Map();
  const take = (path, session, ts, wrote) => {
    if (!path || !/\.html?$/i.test(path) || path.startsWith("http")) return;
    const cur = best.get(path);
    if (!cur) return best.set(path, { path, session, ts, wrote, last: ts });
    cur.last = Math.max(cur.last, ts);
    if (cur.wrote && !wrote) return;
    if (wrote && !cur.wrote || ts >= cur.ts) Object.assign(cur, { session, ts, wrote });
  };
  for (const [session, items] of Object.entries(timelines || {})) {
    if (skip(session)) continue;
    for (const it of items || []) {
      const ts = Number(it.ts) || 0;
      if (it.kind === "tool") {
        const inp = it.input || {};
        take(inp.file_path || inp.path, session, ts, WRITE_TOOLS.test(it.name || ""));
      } else if (it.kind === "file") take(it.path, session, ts, false);
      else if (it.kind === "out") htmlPaths(it.text).forEach((p) => take(p, session, ts, false));
    }
  }
  return [...best.values()].sort((a, b) => b.last - a.last);
}

// писала ли сессия файл (Write/Edit) в этих строках ленты или истории: ts последней записи, иначе 0
export function wroteAt(items, file) {
  let at = 0;
  for (const it of items || []) {
    if (it.kind !== "tool" || !WRITE_TOOLS.test(it.name || "")) continue;
    const inp = it.input || {};
    if ((inp.file_path || inp.path) === file) at = Math.max(at, Number(it.ts) || 1);
  }
  return at;
}

// кому уходит комментарий к макету: выбор владельца → писавший файл (в ленте или в истории) → только назвавший → никто.
// how: picked | wrote | named | none; none — получателя выбирает владелец, молча подставлять «дизайнера» нельзя
export function recipientOf(file, { picked = {}, authors = [], found = {}, frames = [] } = {}) {
  if (picked[file]) return { session: picked[file], how: "picked" };
  const a = authors.find((x) => x.path === file);
  if (a && a.wrote) return { session: a.session, how: "wrote" };
  if (found[file]) return { session: found[file], how: "wrote" };
  const f = frames.find((x) => x.path === file);
  if (f && f.author) return { session: f.author, how: "wrote" };
  if (a) return { session: a.session, how: "named" };
  return { session: "", how: "none" };
}

// в каких сессиях искать, кто писал файл, когда в живой ленте записи нет: назвавшие его, затем дизайнер, затем остальные
export function searchOrder(file, authors, names, first = "designer") {
  const named = (authors || []).filter((a) => a.path === file).map((a) => a.session);
  const all = [...new Set([...named, first, ...names])].filter((n) => names.includes(n));
  const head = new Set([...named, first]);
  return { near: all.filter((n) => head.has(n)), far: all.filter((n) => !head.has(n)) };
}

// строки разговора для чата: реплики владельца и сессии, присланные файлы; шаги инструментов и служебное — нет
export function chatLines(items, limit = 60) {
  return (items || [])
    .filter((it) => (it.kind === "in" || it.kind === "out") && String(it.text || "").trim() || it.kind === "file")
    .slice(-limit)
    .map((it) => ({ k: it.k ?? it.seq, kind: it.kind, ts: it.ts,
      text: it.kind === "file" ? `${it.caption ? it.caption + "\n" : ""}${it.path}` : String(it.text) }));
}

const px = (n) => `${Math.round(n)}`;
const signed = (n) => (n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`);
const cut = (s, n = 80) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

// свойства панели «Правка»: разделы и поля. kind: num (px), text, color, pick (список), box (4 стороны)
export const PROPS = [
  { title: "Текст", rows: [
    [{ p: "font-family", label: "Шрифт", kind: "text", wide: true }],
    [{ p: "font-size", label: "Размер", kind: "num" }, { p: "font-weight", label: "Насыщ.", kind: "pick", options: ["100", "200", "300", "400", "500", "600", "700", "800", "900"] }],
    [{ p: "color", label: "Цвет", kind: "color" }, { p: "text-align", label: "Выравн.", kind: "pick", options: ["left", "center", "right", "justify"] }],
    [{ p: "line-height", label: "Строка", kind: "num", unitless: true }, { p: "letter-spacing", label: "Трекинг", kind: "num" }]] },
  { title: "Размер", rows: [[{ p: "width", label: "Ширина", kind: "num" }, { p: "height", label: "Высота", kind: "num" }]] },
  { title: "Раскладка", flexOnly: true, rows: [
    [{ p: "gap", label: "Зазор", kind: "num" }, { p: "flex-direction", label: "Направл.", kind: "pick", options: ["row", "row-reverse", "column", "column-reverse"] }],
    [{ p: "justify-content", label: "Распред.", kind: "pick", options: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] },
      { p: "align-items", label: "Выравн.", kind: "pick", options: ["flex-start", "center", "flex-end", "stretch", "baseline"] }]] },
  { title: "Блок", rows: [
    [{ p: "opacity", label: "Прозр.", kind: "num", unitless: true }, { p: "background-color", label: "Фон", kind: "color" }],
    [{ p: "padding-top", label: "Внутр. В", kind: "num" }, { p: "padding-right", label: "П", kind: "num" }],
    [{ p: "padding-bottom", label: "Н", kind: "num" }, { p: "padding-left", label: "Л", kind: "num" }],
    [{ p: "margin-top", label: "Внеш. В", kind: "num" }, { p: "margin-bottom", label: "Н", kind: "num" }],
    [{ p: "border-top-width", label: "Рамка", kind: "num" }, { p: "border-top-style", label: "Вид", kind: "pick", options: ["none", "solid", "dashed", "dotted"] }],
    [{ p: "border-top-color", label: "Цвет рамки", kind: "color" }, { p: "border-radius", label: "Скругл.", kind: "num" }]] },
];

// значение поля → то, что пишем в style; пусто — не трогать
export function cssValue(field, raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (field.kind === "num") {
    if (/^-?\d*\.?\d+$/.test(v)) return field.unitless ? v : v + "px";
    return /^-?\d*\.?\d+(px|em|rem|%|vw|vh)$/.test(v) ? v : null;
  }
  return v;
}

const num = (v) => (/^-?\d*\.\d{3,}px$/.test(v) ? Math.round(parseFloat(v) * 100) / 100 + "px" : v);

// одна правка «править» — словами и цифрами
export function describeChange(c) {
  const parts = [];
  if (c.dx || c.dy) {
    const where = [c.dx ? `${signed(c.dx)} px по X` : "", c.dy ? `${signed(c.dy)} px по Y` : ""].filter(Boolean).join(", ");
    parts.push(`сдвиг ${where} (было x ${px(c.x0)}, y ${px(c.y0)} → стало x ${px(c.x0 + c.dx)}, y ${px(c.y0 + c.dy)})`);
  }
  if (c.w != null && c.h != null && (Math.round(c.w) !== Math.round(c.w0) || Math.round(c.h) !== Math.round(c.h0))) {
    parts.push(`размер ${px(c.w0)}×${px(c.h0)} → ${px(c.w)}×${px(c.h)} px`);
  }
  if (c.t != null && c.t !== c.t0) parts.push(`текст «${cut(c.t0, 200)}» → «${cut(c.t, 200)}»`);
  const css = Object.entries(c.css || {}).filter(([, v]) => v && v.from !== v.to);
  if (css.length) parts.push("стиль: " + css.map(([p, v]) => `${p} ${num(v.from)} → ${num(v.to)}`).join(", "));
  return parts.join("; ");
}

export const hasEffect = (c) => !!describeChange(c);

// рисунок от руки: что отмечено и где
export function describeDrawing(d) {
  const b = d.box || {};
  const area = `x ${px(b.x)}, y ${px(b.y)}, ${px(b.w)}×${px(b.h)} px`;
  const near = d.sel ? ` около \`${d.sel}\`${d.label ? ` «${cut(d.label)}»` : ""}` : "";
  if (d.kind === "arrow") return `стрелка от x ${px(d.from.x)}, y ${px(d.from.y)} к x ${px(d.to.x)}, y ${px(d.to.y)}${near}`;
  if (d.kind === "loop") return `обведена область ${area}${near}`;
  if (d.kind === "oval") return `обведена овалом область ${area}${near}`;
  if (d.kind === "box") return `выделена рамкой область ${area}${near}`;
  return `отмечена область ${area}${near}`;
}

// сообщение дизайнеру пачкой: комменты к точкам, правки руками, рисунки, заметки; файл правит он сам.
// Пункты с полем file разных файлов — отдельными разделами; без поля — один файл path
export function message({ path, round, view, views = {}, comments, changes, drawings = [], notes = [] }) {
  const files = [];
  const add = (f) => { if (!files.includes(f)) files.push(f); };
  const of = (x) => x.file || path;
  [...comments, ...changes, ...drawings].forEach((x) => add(of(x)));
  const blocks = [];
  for (const f of files) {
    const v = views[f] || view || { w: 0, h: 0 };
    const lines = [`Правки к дизайну \`${f}\` (Hub Design, раунд ${round}; окно ${v.w}×${v.h} px, координаты — от верхнего левого угла страницы).`];
    let n = 0;
    for (const c of comments.filter((x) => of(x) === f)) {
      if (!String(c.text || "").trim()) continue;
      n += 1;
      const el = c.sel ? `\`${c.sel}\`${c.label ? ` «${cut(c.label)}»` : ""}` : "точка";
      lines.push(`${n}. Коммент к ${el}, точка x ${px(c.x)}, y ${px(c.y)} (элемент ${px(c.w)}×${px(c.h)} в x ${px(c.ex)}, y ${px(c.ey)}): ${String(c.text).trim()}`);
    }
    const mine = changes.filter((x) => of(x) === f);
    for (const c of mine) {
      const what = describeChange(c);
      if (!what) continue;
      n += 1;
      lines.push(`${n}. Поправил руками \`${c.sel}\`${c.label ? ` «${cut(c.label)}»` : ""}: ${what}.`);
    }
    for (const d of drawings.filter((x) => of(x) === f)) {
      n += 1;
      lines.push(`${n}. Рисунок от руки: ${describeDrawing(d)}${String(d.text || "").trim() ? ` — ${String(d.text).trim()}` : ""}.`);
    }
    if (!n) continue;
    if (mine.some(hasEffect)) lines.push("Правки руками я сделал прямо в предпросмотре — перенеси их в код так, чтобы вышло так же (не transform поверх, а в вёрстку).");
    blocks.push(lines.join("\n"));
  }
  const said = notes.filter((x) => String(x.text || "").trim());
  if (said.length) {
    blocks.push((blocks.length ? "" : `Заметки с холста Hub Design (раунд ${round}):\n`) + said.map((x, i) => `${blocks.length ? "Заметка на холсте" : i + 1 + "."} ${cut(x.text, 500)}`).join("\n"));
  }
  return blocks.join("\n\n");
}

export const draftCount = (comments, changes, drawings = [], notes = []) =>
  comments.filter((c) => String(c.text || "").trim()).length + changes.filter(hasEffect).length + drawings.length +
  notes.filter((n) => String(n.text || "").trim()).length;

// --- холст: вид, масштаб, раскладка фреймов -------------------------------------------------------------------------
export const CANVAS_MIN = 0.05, CANVAS_MAX = 4;
export const clampK = (k) => Math.min(CANVAS_MAX, Math.max(CANVAS_MIN, k));

// колесо: масштаб вокруг точки (px, py) в координатах сцены; точка под курсором остаётся на месте
export function zoomAt(v, factor, px, py) {
  const k = clampK(v.k * factor);
  const r = k / v.k;
  return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
}

// вписать фреймы в окно сцены W×H с полями; не крупнее 100%
export function fitView(frames, W, H, pad = 56) {
  if (!frames.length || W < 10 || H < 10) return { x: pad, y: pad + 28, k: 1 };
  const x0 = Math.min(...frames.map((f) => f.x)), y0 = Math.min(...frames.map((f) => f.y));
  const x1 = Math.max(...frames.map((f) => f.x + f.w)), y1 = Math.max(...frames.map((f) => f.y + f.h));
  const top = 28;   // подпись над фреймом
  const k = clampK(Math.min(1, (W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2 - top) / Math.max(1, y1 - y0)));
  return { k, x: (W - (x1 - x0) * k) / 2 - x0 * k, y: Math.max(pad, (H - top - (y1 - y0) * k) / 2) + top - y0 * k };
}

// где поставить новый фрейм: справа от последнего, с зазором
export function nextSpot(frames, w, gap = 80) {
  if (!frames.length) return { x: 0, y: 0 };
  const last = frames.reduce((a, f) => (f.x + f.w > a.x + a.w ? f : a), frames[0]);
  return { x: last.x + last.w + gap, y: last.y };
}

// высота окна фрейма — экранная, по ширине (как у устройства); длинная страница прокручивается внутри рамки, а не растягивает её:
// иначе vh/svh в макете (min-height:100vh) растягиваются до высоты рамки
export const windowHeight = (w) => ({ 1440: 900, 1280: 800, 768: 1024, 390: 844 })[Number(w)] || 900;

// подпись фрейма: имя файла без .html
export const frameTitle = (path) => String(path).split(/[\\/]/).pop();

// тема кнопок холста: инструмент → режим скрипта в дизайне
export const TOOLS = { select: "edit", hand: "view", text: "text", note: "view", comment: "comment", pencil: "draw", shape: "draw" };
export const toolMode = (tool) => TOOLS[tool] || "view";

// быстрые цвета панели стилей
export const SWATCHES = ["#0b0b0b", "#52514e", "#ffffff", "#d97757", "#e5484d", "#f5a524", "#30a46c", "#257de0", "#6e56cf", "#e93d82", "#faf9f6", "#1f1e1d"];

// «5 мин назад» для карточек макетов
export function ago(ts, now = Date.now() / 1000) {
  const s = Math.max(0, now - Number(ts || 0));
  if (!ts) return "";
  if (s < 90) return "только что";
  if (s < 3600) return `${Math.round(s / 60)} мин назад`;
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
  return `${Math.round(s / 86400)} дн назад`;
}

// слова владельца перед текстом, когда макета ещё нет: дизайнер делает новый, а не правит открытый
export const NEW_DESIGN = "Новый макет (Hub Design): ";

// --- макеты по лентам сессий: по событиям, без таймера ------------------------------------------------------------
// В ленте остаётся только то, что про HTML. Страница тянет ленту сессии, когда её номер правки в снимке вырос (событие), и берёт только
// изменённые строки (since); весь набор — когда у ядра другая эпоха или оно отдало ленту целиком.
const isHtml = (p) => /\.html?$/i.test(p || "");
export function slimItems(items) {
  return (items || []).filter((it) => (it.kind === "tool" && isHtml((it.input || {}).file_path || (it.input || {}).path))
    || (it.kind === "file" && isHtml(it.path)) || (it.kind === "out" && htmlPaths(it.text).length))
    .map((it) => ({ kind: it.kind, name: it.name, ts: it.ts, path: it.path, input: it.input && { file_path: (it.input.file_path || it.input.path) },
      text: it.kind === "out" ? htmlPaths(it.text).join(" ") : undefined }));
}
// кого перечитать: ленты, чей номер правки вырос с прошлого раза (или сменилась эпоха ядра)
export const dueSessions = (names, revs, epoch, cache) => names.filter((n) => {
  const c = cache.get(n);
  return !c || c.epoch !== epoch || c.rev < (revs[n] ?? 0);
});
export const timelineQuery = (name, cached, epoch) => ({ session: name, since: String(cached && cached.epoch === epoch ? cached.rev : 0), ...(epoch != null ? { epoch: String(epoch) } : {}) });
const keyOf = (it) => [it.kind, it.name, it.ts, it.path, (it.input || {}).file_path, it.text].join("|");
export function mergeTimeline(cached, res, rev) {
  const fresh = slimItems(res.items);
  const whole = !cached || res.full !== false || cached.epoch !== res.epoch;
  const seen = new Set();
  const items = (whole ? fresh : cached.items.concat(fresh)).filter((it) => { const k = keyOf(it); return !seen.has(k) && seen.add(k); });
  return { rev: typeof res.rev === "number" ? res.rev : rev, epoch: res.epoch, items };
}

// --- файл макета на месте ------------------------------------------------------------------------------------------
// состояние от процесса плагина: ok | missing (нет на диске) | denied (вне папок сессий и проектов хаба, показать нечем)
export const isGone = (state) => state === "missing" || state === "denied";
export const goneText = (state, path) => (state === "denied" ? `Файл вне папок проектов и сессий хаба, плагин его не покажет: ${path}` : `Файл не найден: ${path}`);

// --- «Убрать» из очереди с отменой ---------------------------------------------------------------------------------
// как в очереди ядра: сообщение не убирается сразу, а на delay мс получает строку «Убрано · Отменить»; настоящая отмена уходит по истечении
export function createCancels({ post, isQueued, onChange, delay = 6000, setT = setTimeout, clearT = clearTimeout }) {
  const rows = new Map();
  const api = {
    rows,
    get: (id) => rows.get(id),
    start(session, it) {
      if (rows.has(it.id)) return;
      const e = { session, text: it.text, failed: false, done: false, timer: null };
      rows.set(it.id, e);
      e.timer = setT(() => api.send(it.id), delay);
      onChange();
    },
    undo(id) {
      const e = rows.get(id);
      if (e) clearT(e.timer);
      rows.delete(id);
      onChange();
    },
    async send(id) {
      const e = rows.get(id);
      if (!e || e.done) return;
      e.timer = null;
      if (!isQueued(id)) { rows.delete(id); return onChange(); }   // сообщение уже ушло само — не трогаем
      e.failed = false;
      const r = await post("/api/queue/cancel", { session: e.session, id });
      if (r && r.error) e.failed = true; else e.done = true;
      onChange();
    },
    sig: () => [...rows].map(([id, e]) => id + (e.failed ? "f" : e.done ? "d" : "p")).join(),
  };
  return api;
}

// куда ведёт «Exit Hub Design»: в чат того, с кем шёл разговор (он есть в хабе), иначе туда, откуда пришли (не из самого плагина), иначе на главную
export function exitTarget(session, known, back, id) {
  if (session && (known || []).includes(session)) return "#/s/" + encodeURIComponent(session);
  return back && !String(back).startsWith("#/x/" + id) ? back : "#/";
}
