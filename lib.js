// Hub Design: pure logic without DOM - addresses, the session's file list, the text of edits for the designer. Tests: tests/lib.test.mjs
import { makeT } from "./i18n.js";

// UI and message texts: en by default, ru when the hub language is Russian (see i18n.js); resolved at use time, never at load.
// The message to the designer (message()) is built from the same table: the same structure in both languages.
export const STR = {
  en: {
    size_fit: "Fit to window",
    you: "You", who_core: "core", who_hub: "hub", who_schedule: "schedule", who_module: "module", who_plugin: "plugin", who_session: "session",
    p_text: "Text", p_font: "Font", p_size: "Size", p_weight: "Weight", p_color: "Color", p_align: "Align", p_line: "Line", p_tracking: "Tracking",
    p_width: "Width", p_height: "Height", p_layout: "Layout", p_gap: "Gap", p_dir: "Direction", p_justify: "Justify", p_grid: "Grid", p_cols: "Columns",
    p_block: "Block", p_opacity: "Opacity", p_bg: "Fill", p_pad_t: "Padding T", p_r: "R", p_b: "B", p_l: "L", p_margin_t: "Margin T",
    p_border: "Border", p_style: "Style", p_border_color: "Border color", p_radius: "Radius",
    quote: "\u201c{s}\u201d",
    cols: "grid columns {a} \u2192 {b} (grid-template-columns: {from} \u2192 {to})",
    along_x: "{v} px along X", along_y: "{v} px along Y",
    shift: "shift {where} (was x {x0}, y {y0} \u2192 now x {x1}, y {y1})",
    resize: "size {w0}\u00d7{h0} \u2192 {w}\u00d7{h} px",
    retext: "text {a} \u2192 {b}",
    style: "style: ",
    near: " near `{sel}`{label}",
    d_arrow: "arrow from x {x0}, y {y0} to x {x1}, y {y1}{near}",
    d_loop: "circled area {area}{near}",
    d_oval: "circled with an oval, area {area}{near}",
    d_box: "framed area {area}{near}",
    d_mark: "marked area {area}{near}",
    tw_on: "on", tw_off: "off",
    tw_line: "Tweak `{key}`: {a} \u2192 {b}",
    bi_pad: "Margins {v}: add this to the padding of the page root and sections (every side that already has padding)",
    bi_fs: "Font sizes {v}: multiply the font-size of all texts",
    bi_ls: "Letter spacing {v}: add to the letter-spacing of all texts",
    bi_lh: "Line spacing {v}: add to the line-height of all texts (in font sizes)",
    a_lost: "; element not found \u2014 the design was relaid out, the point stayed where it was",
    a_tag: "tag {tag}", a_text: "text {s}", a_attr: "attributes {s}", a_inside: "inside #{anc}", a_cls: "classes {list}", a_near: "next to {s}",
    a_noid: "; no id, hints: {bits}",
    m_head: "Edits to the design `{f}` (Hub Design, round {round}; window {w}\u00d7{h} px, coordinates from the top-left corner of the page).",
    m_grid: "Grid over the frame (a layout guide, on the canvas only; it is not in the design): {g}.",
    m_point: "point",
    m_region: "Comment on the area x {x}, y {y}, {w}\u00d7{h} px (inside {el}{note}; in it: {els}): {text}",
    m_region_none: "nothing but the background",
    m_comment: "Comment on {el}, point x {x}, y {y} (element {w}\u00d7{h} at x {ex}, y {ey}{note}): {text}",
    m_hand: "Edited by hand `{sel}`{label}: {what}{inFile}.",
    m_infile: " \u2014 already in the file",
    m_drawing: "Freehand drawing: {d}{text}.",
    m_auto: "These are my own moves in the Hub Design panel, sent automatically \u2014 no report needed: end the turn with a single line \u201c\u2014\u201d.",
    m_style: "Style reference: {path}",   // the same line in every language: the designer's skill looks for it
    m_tweaks: "Tweaks are values from the Hub Design panel (#hub-tweaks): make the new ones the defaults and move them into the code.",
    m_hand_note: "I made the hand edits right in the preview \u2014 move them into the code so that it looks the same (not a transform on top, but in the layout).",
    m_file_note: "Hub Design wrote the items marked \u201calready in the file\u201d into the design itself, point by point: an inline style or the text of the element itself, tweaks on <html>{copy}. The look on screen is right \u2014 keep it; you may replace the inline with ordinary layout if the look does not change.",
    m_copy: "; the copy of the file before these edits is `{c}`, do not overwrite or delete it",
    m_notes: "Notes from the Hub Design canvas (round {round}):\n",
    m_note: "Canvas note",
    selected: "Selected: {file} `{sel}` {tag}{label}",
    element: "element",
    g_columns: "Columns", g_rows: "Rows", g_grid: "Cells",
    g_line: "{title} {count} (gutter {gutter}, margin {margin}, color {color})",
    e_more: "and {n} more",
    e_head: "Errors in the design ({n}):\n",
    ago_now: "just now", ago_min: "{n} min ago", ago_h: "{n} h ago", ago_d: "{n} d ago",
    new_design: "New design (Hub Design): ",
    based_on: "Make a design based on {f}",
    save_to: "Save it in the direction folder: {dir}/<design-name>/ (index.html, assets next to it), not in your own working folder.",
    gone_denied: "The file is outside the hub's project and session folders, the plugin will not show it: {path}",
    gone_missing: "File not found: {path}",
    t_designer: "designer", t_animator: "animator",
    install: "Install the specialist for Hub Design: specialists install {name}",
    banner: "Hub Design needs the {title}",
  },
  ru: {
    size_fit: "По окну",
    you: "Вы", who_core: "ядро", who_hub: "хаб", who_schedule: "расписание", who_module: "модуль", who_plugin: "плагин", who_session: "сессия",
    p_text: "Текст", p_font: "Шрифт", p_size: "Размер", p_weight: "Насыщ.", p_color: "Цвет", p_align: "Выравн.", p_line: "Строка", p_tracking: "Трекинг",
    p_width: "Ширина", p_height: "Высота", p_layout: "Раскладка", p_gap: "Зазор", p_dir: "Направл.", p_justify: "Распред.", p_grid: "Сетка", p_cols: "Колонки",
    p_block: "Блок", p_opacity: "Прозр.", p_bg: "Фон", p_pad_t: "Внутр. В", p_r: "П", p_b: "Н", p_l: "Л", p_margin_t: "Внеш. В",
    p_border: "Рамка", p_style: "Вид", p_border_color: "Цвет рамки", p_radius: "Скругл.",
    quote: "\u00ab{s}\u00bb",
    cols: "колонки сетки {a} \u2192 {b} (grid-template-columns: {from} \u2192 {to})",
    along_x: "{v} px по X", along_y: "{v} px по Y",
    shift: "сдвиг {where} (было x {x0}, y {y0} \u2192 стало x {x1}, y {y1})",
    resize: "размер {w0}\u00d7{h0} \u2192 {w}\u00d7{h} px",
    retext: "текст {a} \u2192 {b}",
    style: "стиль: ",
    near: " около `{sel}`{label}",
    d_arrow: "стрелка от x {x0}, y {y0} к x {x1}, y {y1}{near}",
    d_loop: "обведена область {area}{near}",
    d_oval: "обведена овалом область {area}{near}",
    d_box: "выделена рамкой область {area}{near}",
    d_mark: "отмечена область {area}{near}",
    tw_on: "вкл", tw_off: "выкл",
    bi_pad: "Поля {v}: добавь это к padding корня страницы и секций (к каждой стороне, где padding уже есть)",
    bi_fs: "Размер шрифтов {v}: умножь font-size всех текстов",
    bi_ls: "Межбуквенный {v}: добавь к letter-spacing всех текстов",
    bi_lh: "Межстрочный {v}: добавь к line-height всех текстов (в размерах шрифта)",
    tw_line: "Крутилка `{key}`: {a} \u2192 {b}",
    a_lost: "; элемент не найден \u2014 макет перевёрстан, точка осталась на прежнем месте",
    a_tag: "тег {tag}", a_text: "текст {s}", a_attr: "атрибуты {s}", a_inside: "внутри #{anc}", a_cls: "классы {list}", a_near: "рядом {s}",
    a_noid: "; нет id, приметы: {bits}",
    m_head: "Правки к дизайну `{f}` (Hub Design, раунд {round}; окно {w}\u00d7{h} px, координаты \u2014 от верхнего левого угла страницы).",
    m_grid: "Сетка поверх рамки (ориентир раскладки, на холсте; в макете её нет): {g}.",
    m_point: "точка",
    m_region: "Коммент к области x {x}, y {y}, {w}\u00d7{h} px (внутри {el}{note}; в ней: {els}): {text}",
    m_region_none: "только фон",
    m_comment: "Коммент к {el}, точка x {x}, y {y} (элемент {w}\u00d7{h} в x {ex}, y {ey}{note}): {text}",
    m_hand: "Поправил руками `{sel}`{label}: {what}{inFile}.",
    m_infile: " \u2014 уже в файле",
    m_drawing: "Рисунок от руки: {d}{text}.",
    m_auto: "Это мои собственные действия в панели Hub Design, ушли сами \u2014 отчёт не нужен: итог хода одной строкой \u00ab\u2014\u00bb.",
    m_style: "Style reference: {path}",
    m_tweaks: "Крутилки\u2014 это значения из панели Hub Design (#hub-tweaks): сделай новые значениями по умолчанию и перенеси их в код.",
    m_hand_note: "Правки руками я сделал прямо в предпросмотре \u2014 перенеси их в код так, чтобы вышло так же (не transform поверх, а в вёрстку).",
    m_file_note: "Пункты \u00abуже в файле\u00bb Hub Design записал в макет сам, точечно: inline-стиль или текст самого элемента, крутилки \u2014 на <html>{copy}. Вид на экране верный \u2014 сохрани его; заменить inline обычной вёрсткой можно, если вид не изменится.",
    m_copy: "; копия файла до этих правок \u2014 `{c}`, её не перезаписывай и не удаляй",
    m_notes: "Заметки с холста Hub Design (раунд {round}):\n",
    m_note: "Заметка на холсте",
    selected: "Выделено: {file} `{sel}` {tag}{label}",
    element: "элемент",
    g_columns: "Колонки", g_rows: "Строки", g_grid: "Клетки",
    g_line: "{title} {count} (зазор {gutter}, поле {margin}, цвет {color})",
    e_more: "и ещё {n}",
    e_head: "Ошибки в макете ({n}):\n",
    ago_now: "только что", ago_min: "{n} мин назад", ago_h: "{n} ч назад", ago_d: "{n} дн назад",
    new_design: "Новый макет (Hub Design): ",
    based_on: "Сделай макет на основе {f}",
    save_to: "Сохрани в папку направления: {dir}/<имя-макета>/ (index.html, ресурсы рядом), не в свою рабочую папку.",
    gone_denied: "Файл вне папок проектов и сессий хаба, плагин его не покажет: {path}",
    gone_missing: "Файл не найден: {path}",
    t_designer: "дизайнер", t_animator: "аниматор",
    install: "Поставь специалиста для Hub Design: specialists install {name}",
    banner: "Для Hub Design нужен {title}",
  },
};
const tr = makeT(STR);

// width of the design window - the "Window" switch in the settings panel
export const SIZES = [
  { id: "fit", get label() { return tr("size_fit"); }, w: 0 },
  { id: "desktop", label: "1440", w: 1440 },
  { id: "laptop", label: "1280", w: 1280 },
  { id: "tablet", label: "768", w: 768 },
  { id: "mobile", label: "390", w: 390 },
];

// zoom: 0 - fit to width
export const ZOOMS = [0, 50, 75, 100, 125, 150];

// port of the plugin process: the hub page port + 11 (8787 -> 8798), as in server.py
export const canvasPort = (pagePort) => Number(pagePort || 8787) + 11;

// the file address at the process: /f/Users/me/site/index.html, Windows - /f/C:/site/index.html
export function fileUrl(origin, path) {
  const p = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
  return `${origin}/f/${p.split("/").map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join("/")}`;
}

// a quoted path may contain spaces ("…/My Projects/Demo Site/…/a.html"); without quotes a space ends the path, and a tail must not be bitten off it:
// "/analytics/weekly/a.html" out of "Threads/analytics/weekly/a.html" is a nonexistent file, and on the canvas it is a raw server response (0.5.1)
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

// HTML files the session worked with: what it wrote and edited, what it sent, what it named - the freshest first
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

// designs of all sessions and their authors: the author is who wrote the file with a tool (Write/Edit), then who sent it to the owner (send-file);
// a session that only named the path in text (hub send, a reply) is not an author - the design stays in the list without the right to comments.
// timelines: {session: [timeline items]}; skip - sessions that keep no designs (the hub, workers)
const WRITE_TOOLS = /^(Write|Edit|MultiEdit)$/;
export function htmlAuthored(timelines, skip = () => false) {
  const best = new Map();
  const take = (path, session, ts, rank) => {
    if (!path || !/\.html?$/i.test(path) || path.startsWith("http")) return;
    const cur = best.get(path);
    const fresh = { path, session, ts, rank, wrote: rank === 2, sent: rank === 1, last: ts };
    if (!cur) return best.set(path, fresh);
    cur.last = Math.max(cur.last, ts);
    if (rank > cur.rank || rank === cur.rank && ts >= cur.ts) Object.assign(cur, { ...fresh, last: cur.last });
  };
  for (const [session, items] of Object.entries(timelines || {})) {
    if (skip(session)) continue;
    for (const it of items || []) {
      const ts = Number(it.ts) || 0;
      if (it.kind === "tool") {
        const inp = it.input || {};
        take(inp.file_path || inp.path, session, ts, WRITE_TOOLS.test(it.name || "") ? 2 : 0);
      } else if (it.kind === "file") take(it.path, session, ts, 1);
      else if (it.kind === "out") htmlPaths(it.text).forEach((p) => take(p, session, ts, 0));
    }
  }
  return [...best.values()].sort((a, b) => b.last - a.last);
}

// designs found earlier and now: one entry per path, the same rule as above (the higher rank wins, then the fresher). Lists of {path, session, ts, rank, last};
// the page keeps what it found: the feed tail (~150 rows) forgets a design as soon as the session works on something else
export function mergeAuthors(...lists) {
  const best = new Map();
  for (const a of lists.flat()) {
    if (!a || !a.path) continue;
    const cur = best.get(a.path);
    const rank = a.rank ?? (a.wrote ? 2 : a.sent ? 1 : 0);
    const fresh = { path: a.path, session: a.session, ts: a.ts || 0, rank, wrote: rank === 2, sent: rank === 1, last: a.last || a.ts || 0 };
    if (!cur) { best.set(a.path, fresh); continue; }
    cur.last = Math.max(cur.last, fresh.last);
    if (rank > cur.rank || rank === cur.rank && fresh.ts >= cur.ts) Object.assign(cur, { ...fresh, last: cur.last });
  }
  return [...best.values()].sort((a, b) => b.last - a.last);
}
export const KNOWN_MAX = 400;

// whether the session wrote the file (Write/Edit) in these timeline or history rows: ts of the last write, otherwise 0
export function wroteAt(items, file) {
  let at = 0;
  for (const it of items || []) {
    if (it.kind !== "tool" || !WRITE_TOOLS.test(it.name || "")) continue;
    const inp = it.input || {};
    if ((inp.file_path || inp.path) === file) at = Math.max(at, Number(it.ts) || 1);
  }
  return at;
}

// who gets a comment on a design: the owner's pick -> who wrote the file (in the timeline or in the history) -> who sent it to the owner -> nobody.
// how: picked | wrote | sent | named | none; named - the path was only mentioned (hub send, a reply): not an author, the owner picks the recipient
export function recipientOf(file, { picked = {}, authors = [], found = {}, frames = [] } = {}) {
  if (picked[file]) return { session: picked[file], how: "picked" };
  const a = authors.find((x) => x.path === file);
  if (a && a.wrote) return { session: a.session, how: "wrote" };
  if (found[file]) return { session: found[file], how: "wrote" };
  const f = frames.find((x) => x.path === file);
  if (f && f.author) return { session: f.author, how: "wrote" };
  if (a && a.sent) return { session: a.session, how: "sent" };
  return { session: "", how: a ? "named" : "none" };
}

// which sessions to search for who wrote the file when the live timeline has no record: those who named it, then the designer, then the rest
export function searchOrder(file, authors, names, first = "designer") {
  const named = (authors || []).filter((a) => a.path === file).map((a) => a.session);
  const all = [...new Set([...named, first, ...names])].filter((n) => names.includes(n));
  const head = new Set([...named, first]);
  return { near: all.filter((n) => head.has(n)), far: all.filter((n) => !head.has(n)) };
}

// who wrote a timeline row: "You" is the owner; other sessions, the core, the hub - by name; a specialist's answer - the chat session name
export function whoOf(it, session = "") {
  if (it.kind === "out" || it.kind === "file") return session;   // a file (hub send-file) lies in the timeline of whoever sent it
  const f = it.from;
  if (f && f.kind && f.kind !== "owner") {
    const w = { core: "who_core", hub: "who_hub", schedule: "who_schedule", module: "who_module", plugin: "who_plugin" };
    if (f.kind === "session") return f.name || it.sender || tr("who_session");
    return w[f.kind] ? (f.name ? `${tr(w[f.kind])} ${f.name}` : tr(w[f.kind])) : f.kind;
  }
  if (!f && it.sender) return String(it.sender).replace(/^(mod|ext):/, "");
  return tr("you");
}

// conversation rows for the chat: the owner's and the session's replies, sent files; tool steps and service rows - no; "—" (a result without words) - no
export function chatLines(items, limit = 60, session = "") {
  return (items || [])
    .filter((it) => (it.kind === "in" || it.kind === "out") && String(it.text || "").trim() && !/^[\u2014\u2013-]\.?$/.test(String(it.text).trim()) || it.kind === "file")
    .slice(-limit)
    .map((it, i, all) => ({ head: i === 0 || whoOf(all[i - 1], session) !== whoOf(it, session), k: it.k ?? it.seq, kind: it.kind, ts: it.ts, who: whoOf(it, session), mine: it.kind === "in" && whoOf(it) === tr("you"),
      text: it.kind === "file" ? (it.image ? String(it.caption || "") : `${it.caption ? it.caption + "\n" : ""}${it.path}`) : String(it.text),
      ...(it.kind === "file" && it.image ? { image: String(it.path) } : {}) }));
}

const px = (n) => `${Math.round(n)}`;
const signed = (n) => (n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`);
const cut = (s, n = 80) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

// properties of the "Edit" panel: sections and fields. kind: num (px), text, color, pick (a list), box (4 sides). Titles and labels are getters: they follow the language at read time
const field = (p, key, kind, extra) => ({ p, get label() { return tr(key); }, kind, ...extra });
export const PROPS = [
  { get title() { return tr("p_text"); }, rows: [
    [field("font-family", "p_font", "text", { wide: true })],
    [field("font-size", "p_size", "num"), field("font-weight", "p_weight", "pick", { options: ["100", "200", "300", "400", "500", "600", "700", "800", "900"] })],
    [field("color", "p_color", "color"), field("text-align", "p_align", "pick", { options: ["left", "center", "right", "justify"] })],
    [field("line-height", "p_line", "num", { unitless: true }), field("letter-spacing", "p_tracking", "num")]] },
  { get title() { return tr("p_size"); }, rows: [[field("width", "p_width", "num"), field("height", "p_height", "num")]] },
  { get title() { return tr("p_layout"); }, flexOnly: true, rows: [
    [field("gap", "p_gap", "num"), field("flex-direction", "p_dir", "pick", { options: ["row", "row-reverse", "column", "column-reverse"] })],
    [field("justify-content", "p_justify", "pick", { options: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] }),
      field("align-items", "p_align", "pick", { options: ["flex-start", "center", "flex-end", "stretch", "baseline"] })]] },
  { get title() { return tr("p_grid"); }, gridOnly: true, rows: [[field("grid-template-columns", "p_cols", "cols"), field("gap", "p_gap", "num")]] },
  { get title() { return tr("p_block"); }, rows: [
    [field("opacity", "p_opacity", "num", { unitless: true }), field("background-color", "p_bg", "color")],
    [field("padding-top", "p_pad_t", "num"), field("padding-right", "p_r", "num")],
    [field("padding-bottom", "p_b", "num"), field("padding-left", "p_l", "num")],
    [field("margin-top", "p_margin_t", "num"), field("margin-bottom", "p_b", "num")],
    [field("border-top-width", "p_border", "num"), field("border-top-style", "p_style", "pick", { options: ["none", "solid", "dashed", "dotted"] })],
    [field("border-top-color", "p_border_color", "color"), field("border-radius", "p_radius", "num")]] },
];

// the field value -> what is written to style; empty - leave alone
export function cssValue(field, raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (field.kind === "cols") return /^\d{1,2}$/.test(v) && +v >= 1 && +v <= GRID_MAX ? gridForm(+v) : null;
  if (field.kind === "num") {
    if (/^-?\d*\.?\d+$/.test(v)) return field.unitless ? v : v + "px";
    return /^-?\d*\.?\d+(px|em|rem|%|vw|vh)$/.test(v) ? v : null;
  }
  return v;
}

// grid: "Columns: N" is read from repeat(N, minmax(0,1fr)) (or repeat(N, 1fr)) and written back in the same form
export const GRID_MAX = 24;
export const gridForm = (n) => `repeat(${n}, minmax(0, 1fr))`;
export function parseGridCols(v) {
  const m = /^repeat\(\s*(\d+)\s*,\s*(?:minmax\(\s*0(?:px)?\s*,\s*1fr\s*\)|1fr)\s*\)$/i.exec(String(v || "").trim());
  return m && +m[1] >= 1 ? +m[1] : 0;
}
// number of columns: from the declaration in the design style, and if there is none - from the number of tracks of the computed value ("300px 300px 300px")
export function gridCols(decl, computed) {
  const n = parseGridCols(decl);
  if (n) return n;
  const t = String(computed || "").replace(/\[[^\]]*\]/g, " ").trim();
  if (!t || t === "none") return 0;
  let depth = 0, count = 0, inTok = false;
  for (const ch of t) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (/\s/.test(ch) && !depth) inTok = false;
    else if (!inTok) { inTok = true; count += 1; }
  }
  return count;
}

const num = (v) => (/^-?\d*\.\d{3,}px$/.test(v) ? Math.round(parseFloat(v) * 100) / 100 + "px" : v);

const describeCols = (v) => {
  const a = gridCols(v.from, v.from), b = gridCols(v.to, v.to);
  return tr("cols", { a: a || "—", b: b || "—", from: num(v.from), to: num(v.to) });
};

// one "edit" change - in words and numbers
export function describeChange(c) {
  const parts = [];
  if (c.dx || c.dy) {
    const where = [c.dx ? tr("along_x", { v: signed(c.dx) }) : "", c.dy ? tr("along_y", { v: signed(c.dy) }) : ""].filter(Boolean).join(", ");
    parts.push(tr("shift", { where, x0: px(c.x0), y0: px(c.y0), x1: px(c.x0 + c.dx), y1: px(c.y0 + c.dy) }));
  }
  if (c.w != null && c.h != null && (Math.round(c.w) !== Math.round(c.w0) || Math.round(c.h) !== Math.round(c.h0))) {
    parts.push(tr("resize", { w0: px(c.w0), h0: px(c.h0), w: px(c.w), h: px(c.h) }));
  }
  if (c.t != null && c.t !== c.t0) parts.push(tr("retext", { a: tr("quote", { s: cut(c.t0, 200) }), b: tr("quote", { s: cut(c.t, 200) }) }));
  const css = Object.entries(c.css || {}).filter(([, v]) => v && v.from !== v.to);
  if (css.length) parts.push(tr("style") + css.map(([p, v]) => (p === "grid-template-columns" ? describeCols(v) : `${p} ${num(v.from)} → ${num(v.to)}`)).join(", "));
  return parts.join("; ");
}

export const hasEffect = (c) => !!describeChange(c);

// a freehand drawing: what is marked and where
export function describeDrawing(d) {
  const b = d.box || {};
  const area = `x ${px(b.x)}, y ${px(b.y)}, ${px(b.w)}×${px(b.h)} px`;
  const near = d.sel ? tr("near", { sel: d.sel, label: d.label ? ` ${tr("quote", { s: cut(d.label) })}` : "" }) : "";
  if (d.kind === "arrow") return tr("d_arrow", { x0: px(d.from.x), y0: px(d.from.y), x1: px(d.to.x), y1: px(d.to.y), near });
  if (d.kind === "loop") return tr("d_loop", { area, near });
  if (d.kind === "oval") return tr("d_oval", { area, near });
  if (d.kind === "box") return tr("d_box", { area, near });
  return tr("d_mark", { area, near });
}

// --- design tweaks: <script type="application/json" id="hub-tweaks"> ---------------------------------------------------------
// {"accent": {"editor": "color", "default": "#2a78d6", "options": ["#2a78d6", "#b45309"], "var": "--accent"},
//  "density": {"editor": "enum", "options": ["compact", "cozy"], "attr": "data-density"}}
// var - a CSS variable on :root, attr - an attribute on <html>; the hub page applies the values, inside the design there is only a write to style/attribute
export const TWEAK_EDITORS = ["text", "color", "int", "float", "range", "boolean", "enum"];
export const TWEAK_MAX = 24;
const BAD_ATTR = /^(on|style$|src|href|action|formaction|srcdoc|xlink)/i;
const small = (s, n) => String(s ?? "").trim().slice(0, n);
const numOr = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
// is the string a CSS color (not a keyword like inherit): hex, functions, a few names; the page also asks the browser (CSS.supports)
const COLOR_NAMES = new Set(["black", "white", "red", "green", "blue", "yellow", "orange", "purple", "pink", "gray", "grey", "brown", "cyan", "magenta", "teal", "navy", "lime", "maroon", "olive", "silver", "gold", "coral", "salmon", "tomato", "crimson", "indigo", "violet", "beige", "ivory", "khaki", "lavender", "tan", "turquoise", "aqua", "fuchsia"]);
export function isColor(v) {
  const s = String(v ?? "").trim();
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true;
  if (/^(rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\([^()]*\)$/i.test(s)) return true;
  return COLOR_NAMES.has(s.toLowerCase());
}
// the browser's "rgb(12, 34, 56)" or "#abc" -> "#0c2238" for <input type=color>; not a color - ""
export function toHex(v) {
  const s = String(v ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return "#" + [...s.slice(1)].map((c) => c + c).join("").toLowerCase();
  const m = s.match(/^rgba?\(\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/i);
  return m ? "#" + [m[1], m[2], m[3]].map((n) => Math.min(255, Math.round(Number(n))).toString(16).padStart(2, "0")).join("") : "";
}
// parsing a declaration: junk is dropped silently - a tweak without var/attr, with a foreign attribute or without options is not drawn
export function normTweaks(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out = [];
  for (const [key, d] of Object.entries(raw)) {
    if (out.length >= TWEAK_MAX) break;
    if (!d || typeof d !== "object" || !/^[\w.-]{1,40}$/.test(key)) continue;
    const cssVar = /^--[\w-]{1,60}$/.test(d.var || "") ? d.var : "";
    const attr = /^[a-z][\w:-]{0,40}$/i.test(d.attr || "") && !BAD_ATTR.test(d.attr) ? d.attr : "";
    if (!cssVar && !attr) continue;
    const options = Array.isArray(d.options) ? d.options.filter((o) => ["string", "number"].includes(typeof o)).slice(0, 24).map((o) => small(o, 80)) : [];
    let editor = TWEAK_EDITORS.includes(d.editor) ? d.editor : options.length ? "enum" : "text";
    if (editor === "enum" && options.length > 1 && options.every(isColor)) editor = "color";   // the values are colors - draw them as swatches
    const t = { key, label: small(d.label, 40) || key, editor, section: small(d.section, 40), var: cssVar, attr };
    if (editor === "enum" || editor === "color") {
      if (editor === "color" && !options.length && d.default) options.push(small(d.default, 80));
      if (!options.length) continue;
      t.options = options;
      t.default = d.default == null ? undefined : small(d.default, 80);
    } else if (editor === "int" || editor === "float" || editor === "range") {
      const min = numOr(d.min, 0), max = Math.max(min, numOr(d.max, 100));
      const step = numOr(d.step, 0) > 0 ? d.step : editor === "float" ? 0.1 : 1;
      Object.assign(t, { min, max, step, unit: /^[a-z%]{0,4}$/i.test(d.unit || "") ? d.unit || "" : "" });
      t.default = typeof d.default === "number" ? Math.min(max, Math.max(min, d.default)) : undefined;
    } else if (editor === "boolean") {
      t.default = d.default === undefined ? undefined : d.default === true || d.default === "true";
    } else t.default = d.default == null ? undefined : small(d.default, 200);
    out.push(t);
  }
  return out;
}

// a tweak with its own color: a color, or a named option list whose colors the design showed (t.swatch) and whose color variable is known (t.via)
export const ownColor = (t) => t.editor === "color" || !!(t.swatch && t.via);
// the design reported what each option of a color-like enum looks like: {key: {colors: {option: css}, via: "--bg"}}; junk is dropped
export function withProbe(list, probe) {
  if (!probe || typeof probe !== "object") return list;
  return list.map((t) => {
    const p = t.editor === "enum" && probe[t.key];
    if (!p || typeof p.colors !== "object" || !p.colors) return t;
    const swatch = {};
    for (const o of t.options) { const c = String(p.colors[o] ?? "").trim(); if (c && !/^(rgba\(0, 0, 0, 0\)|transparent)$/i.test(c)) swatch[o] = c; }
    if (Object.keys(swatch).length !== t.options.length || new Set(Object.values(swatch)).size < 2) return t;
    const via = /^--[\w-]{1,60}$/.test(p.via || "") ? p.via : "";
    return { ...t, swatch, via };
  });
}

// what the owner entered -> the tweak value by its type; null - does not fit (a color and an option only from options)
export function tweakValue(t, raw) {
  if (t.editor === "boolean") return raw === true || raw === "true" || raw === "1" || raw === "on";
  if (t.editor === "int" || t.editor === "float" || t.editor === "range") {
    const n = Number(String(raw).replace(",", "."));
    if (raw === "" || raw == null || !Number.isFinite(n)) return null;
    const c = Math.min(t.max, Math.max(t.min, n));
    if (t.editor === "int") return Math.round(c);
    const dec = (String(t.step).split(".")[1] || "").length;
    return Number((Math.round(c / t.step) * t.step).toFixed(dec));
  }
  const s = String(raw ?? "");
  if (t.editor === "color" || t.editor === "enum") return t.options.includes(s) ? s : ownColor(t) && /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null;
  return s.slice(0, 200);
}

// the original tweak value: default from the declaration, otherwise what the design shows now (cur - read from :root/<html>)
export function tweakBase(t, cur) {
  if (t.default !== undefined) return t.default;
  const c = String(cur ?? "").trim();
  if (t.editor === "boolean") return c === "1" || c === "true";
  if (t.editor === "int" || t.editor === "float" || t.editor === "range") { const n = parseFloat(c); return Number.isFinite(n) ? tweakValue(t, n) : t.min; }
  if (t.editor === "color" || t.editor === "enum") return t.options.includes(c) ? c : t.options[0];
  return c;
}

// the tweak value -> what is written to the design: a variable on :root and/or an attribute on <html>; value null - remove
export function tweakApply(t, value) {
  const ops = [];
  if (t.editor === "enum" && t.swatch && t.via) {   // an option sets the attribute and removes our color; an own color is written to the variable the options set
    const own = !t.options.includes(value);
    if (t.attr && !own) ops.push({ kind: "attr", name: t.attr, value: String(value) });
    if (t.var && t.var !== t.via && !own) ops.push({ kind: "var", name: t.var, value: `${value}${t.unit || ""}` });
    ops.push({ kind: "var", name: t.via, value: own ? String(value) : null });
    return ops;
  }
  if (t.var) ops.push({ kind: "var", name: t.var, value: t.editor === "boolean" ? (value ? "1" : "0") : `${value}${t.unit || ""}` });
  if (t.attr) ops.push({ kind: "attr", name: t.attr, value: t.editor === "boolean" ? (value ? "" : null) : String(value) });
  return ops;
}

const tweakShow = (c, v) => (c.editor === "boolean" ? tr(v ? "tw_on" : "tw_off") : typeof v === "number" && c.unit ? `${v}${c.unit}` : String(v));
// a tweak change (a batch record: key, label, editor, unit, from, to) in words
export const describeTweak = (c) => c.editor === "builtin" ? describeBuiltin(c) : tr("tw_line", { key: c.key, a: tweakShow(c, c.from), b: tweakShow(c, c.to) });
export const tweakEffect = (c) => c.from !== c.to;

// built-in tweaks of any design (no #hub-tweaks needed): margins, font size, letter spacing, line spacing. The value is a shift from the design (0 = as is);
// the frame applies them live (agent.js), the author gets them as words
export const BUILTINS = [
  { key: "hd:pad", id: "pad", str: "bi_pad", min: -48, max: 160, step: 4, presets: [-16, 0, 16] },
  { key: "hd:fs", id: "fs", str: "bi_fs", min: -30, max: 60, step: 1, presets: [-10, 0, 10] },
  { key: "hd:ls", id: "ls", str: "bi_ls", min: -5, max: 30, step: 1, presets: [-2, 0, 4] },
  { key: "hd:lh", id: "lh", str: "bi_lh", min: -30, max: 60, step: 5, presets: [-10, 0, 15] },
];
export const isBuiltin = (t) => !!t && t.editor === "builtin";
const sgn = (n, d, u) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(n).toFixed(d)}${u}`;
export function builtinShow(id, v) {
  const n = Number(v) || 0;
  if (id === "pad") return sgn(n, 0, " px");
  if (id === "fs") return `\u00d7${(1 + n / 100).toFixed(2)}`;
  if (id === "ls") return sgn(n / 100, 2, "em");
  return sgn(n / 100, 2, "");
}
export const builtinValue = (b, raw) => {
  const n = Number(String(raw).replace(",", "."));
  if (raw === "" || raw == null || !Number.isFinite(n)) return null;
  return Math.round(Math.min(b.max, Math.max(b.min, n)) / b.step) * b.step;
};
const describeBuiltin = (c) => tr("bi_" + String(c.key).slice(3), { v: builtinShow(String(c.key).slice(3), c.to) });

// how to tell the element a pin holds on to when it has no id in the markup; a pin that lost its element says so
export function anchorNote(c) {
  if (c.lost) return tr("a_lost");
  const f = c.fp;
  if (!f || f.id) return "";
  const bits = [tr("a_tag", { tag: f.tag })];
  if (f.text) bits.push(tr("a_text", { s: tr("quote", { s: cut(f.text, 50) }) }));
  else if (f.attr) bits.push(tr("a_attr", { s: tr("quote", { s: cut(f.attr, 50) }) }));
  if (f.anc) bits.push(tr("a_inside", { anc: f.anc }));
  if (f.cls && f.cls.length) bits.push(tr("a_cls", { list: f.cls.map((k) => "." + k).join(" ") }));
  if (f.near && f.near !== f.text) bits.push(tr("a_near", { s: tr("quote", { s: cut(f.near, 40) }) }));
  return tr("a_noid", { bits: bits.join(", ") });
}

// the message to the designer as a batch: comments on points, hand edits, drawings, notes; the designer edits the file.
// Items with a `file` field of different files go in separate sections; without the field - one file `path`
// --- hand edits straight into the file (server.py /__canvas/write): what to send and what to mark "already in the file" -------------------------------
// drafts and sent but not yet accepted by the designer: the file is always rebuilt from the copy - as one full set
export const writable = (changes, file) => [...new Map(changes.filter((c) => c.file === file && c.state !== "done" && !c.handed && hasEffect(c))
  .map((c) => [c.sel, { sel: c.sel, label: c.label || "", tag: c.tag || "", t0: c.t0 ?? null, t: c.t ?? null, dx: c.dx || 0, dy: c.dy || 0, w: c.w ?? null, h: c.h ?? null, css: c.css || {} }])).values()];   // one element - one record, the last
// handed - went to the designer in words, not as a write to the file: from then on the designer edits it, Hub Design does not write it to the file
// the server response -> marks on the edits: inFile - written to the file, noWrite - why it was skipped (left to the designer)
export function markWritten(changes, tweaks, file, res) {
  const done = new Set((res && res.done) || []);
  const why = Object.fromEntries(((res && res.skipped) || []).map((x) => [x.sel, x.why]));
  for (const c of changes) {
    if (c.file !== file || c.state === "done") continue;
    c.inFile = done.has(c.sel);
    if (!c.inFile && why[c.sel]) c.noWrite = why[c.sel]; else delete c.noWrite;
  }
  for (const t of tweaks) if (t.file === file && t.state !== "done") t.inFile = !!res && res.ops === "done";
}
export function markUnwritten(changes, tweaks, file) {
  for (const c of changes) if (c.file === file) { c.inFile = false; delete c.noWrite; }
  for (const t of tweaks) if (t.file === file) t.inFile = false;
}
// auto-send of hand edits: the batch goes to the picked recipient after AUTO_MS of silence after the last move.
// sig - a snapshot of what would go now ("" - nothing to send); any change of the snapshot restarts the countdown
export const AUTO_MS = 8000;
export const autoSig = (items, session, home) => (home || !session || !(items.changes.length + items.tweaks.length + items.drawings.length) ? "" : JSON.stringify([session, items]));
export function createAuto({ fire, ms = AUTO_MS, set = setTimeout, clear = clearTimeout }) {
  let sig = "", timer = 0, failed = "";
  const arm = (wait) => { clear(timer); timer = set(() => { timer = 0; fire(); }, wait); };
  return {
    watch(next) {
      if (next === sig) return;
      sig = next;
      clear(timer);
      timer = 0;
      if (next && next !== failed) arm(ms);
    },
    sig: () => sig,
    fail() { failed = sig; },   // did not go: the same is not sent a second time on its own - only after a new edit
    retry(wait) { if (sig && sig !== failed) arm(wait); },   // the recipient is busy sending - a bit later
  };
}
// the full path of the copy next to the file
export const copyPath = (file, copy) => (copy ? String(file).replace(/[^/\\]*$/, copy) : "");

// the style chosen in the picker, one line for the designer: the full path of the style file (a DESIGN.md of the style reference library)
export const styleLine = (path) => (path ? tr("m_style", { path: String(path) }) : "");
export function message({ path, round, view, views = {}, comments, changes, drawings = [], notes = [], tweaks = [], errors = [], copies = {}, auto = false, style = "" }) {
  const files = [];
  const add = (f) => { if (!files.includes(f)) files.push(f); };
  const of = (x) => x.file || path;
  [...comments, ...changes, ...drawings, ...tweaks.filter(tweakEffect), ...errors.filter((x) => normErrors(x.items).length)].forEach((x) => add(of(x)));
  const blocks = [];
  for (const f of files) {
    const v = views[f] || view || { w: 0, h: 0 };
    const lines = [tr("m_head", { f, round, w: v.w, h: v.h })];
    if (normGrids(v.grids).length) lines.push(tr("m_grid", { g: describeGrids(v.grids) }));
    let n = 0;
    for (const c of comments.filter((x) => of(x) === f)) {
      if (!String(c.text || "").trim()) continue;
      n += 1;
      const el = c.sel ? `\`${c.sel}\`${c.label ? ` ${tr("quote", { s: cut(c.label) })}` : ""}` : tr("m_point");
      if (c.area) {
        const els = (c.els || []).map((e) => `\`${e.sel}\`${e.label ? ` ${tr("quote", { s: cut(e.label, 40) })}` : ""}`).join(", ") + (c.more ? `, +${c.more}` : "");
        lines.push(`${n}. ` + tr("m_region", { el, x: px(c.x), y: px(c.y), w: px(c.area.w), h: px(c.area.h), note: anchorNote(c), els: els || tr("m_region_none"), text: String(c.text).trim() }));
        continue;
      }
      lines.push(`${n}. ` + tr("m_comment", { el, x: px(c.x), y: px(c.y), w: px(c.w), h: px(c.h), ex: px(c.ex), ey: px(c.ey), note: anchorNote(c), text: String(c.text).trim() }));
    }
    const mine = changes.filter((x) => of(x) === f);
    for (const c of mine) {
      const what = describeChange(c);
      if (!what) continue;
      n += 1;
      lines.push(`${n}. ` + tr("m_hand", { sel: c.sel, label: c.label ? ` ${tr("quote", { s: cut(c.label) })}` : "", what, inFile: c.inFile ? tr("m_infile") : "" }));
    }
    for (const d of drawings.filter((x) => of(x) === f)) {
      n += 1;
      lines.push(`${n}. ` + tr("m_drawing", { d: describeDrawing(d), text: String(d.text || "").trim() ? ` — ${String(d.text).trim()}` : "" }));
    }
    const turned = tweaks.filter((x) => of(x) === f && tweakEffect(x));
    for (const c of turned) {
      n += 1;
      lines.push(`${n}. ${describeTweak(c)}${c.inFile ? tr("m_infile") : ""}.`);
    }
    for (const e of errors.filter((x) => of(x) === f)) {
      const err = describeErrors(e.items);
      if (!err) continue;
      n += 1;
      lines.push(`${n}. ${err}`);
    }
    if (!n) continue;
    if (turned.some((c) => !c.inFile)) lines.push(tr("m_tweaks"));
    if (mine.some((c) => hasEffect(c) && !c.inFile)) lines.push(tr("m_hand_note"));
    if (mine.some((c) => hasEffect(c) && c.inFile) || turned.some((c) => c.inFile)) {
      const copy = copyPath(f, copies[f]);
      lines.push(tr("m_file_note", { copy: copy ? tr("m_copy", { c: copy }) : "" }));
    }
    blocks.push(lines.join("\n"));
  }
  const said = notes.filter((x) => String(x.text || "").trim());
  if (said.length) {
    blocks.push((blocks.length ? "" : tr("m_notes", { round })) + said.map((x, i) => `${blocks.length ? tr("m_note") : i + 1 + "."} ${cut(x.text, 500)}`).join("\n"));
  }
  if (style && blocks.length) blocks.push(styleLine(style));
  if (auto && blocks.length) blocks.push(tr("m_auto"));
  return blocks.join("\n\n");
}

// the element selected on the canvas in one line - so that "make this block wider" works without a pin
export const selectedLine = (s) => (s && s.sel ? tr("selected", { file: s.file, sel: s.sel, tag: s.tag || tr("element"), label: s.label ? ` ${tr("quote", { s: cut(s.label) })}` : "" }) : "");

// grids over the frame (on the canvas only): columns - stripes along the width, rows - along the height, grid - square cells (the side = the column width)
export const GRIDS_MAX = 6, GRID_KINDS = ["columns", "rows", "grid"], GRID_LIMITS = { count: [1, 24], gutter: [0, 200], margin: [0, 400] };
export const gridTitle = (kind) => tr("g_" + kind);
export const GRID_COLORS = ["#ff3b30", "#0a84ff", "#30d158", "#ff9f0a", "#bf5af2"];
const clampInt = (v, [lo, hi], dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
export function normGrid(g) {
  const o = g && typeof g === "object" ? g : {};
  return {
    id: String(o.id || ""),
    kind: GRID_KINDS.includes(o.kind) ? o.kind : "columns",
    count: clampInt(o.count, GRID_LIMITS.count, 12),
    gutter: clampInt(o.gutter, GRID_LIMITS.gutter, 16),
    margin: clampInt(o.margin, GRID_LIMITS.margin, 0),
    color: /^#[0-9a-f]{6}$/i.test(String(o.color || "")) ? String(o.color).toLowerCase() : GRID_COLORS[0],
  };
}
export const normGrids = (list) => (Array.isArray(list) ? list.slice(0, GRIDS_MAX).map(normGrid) : []);
export const newGrid = (list) => normGrid({ id: "g" + Date.now().toString(36) + (list || []).length, kind: "columns", color: GRID_COLORS[(list || []).length % GRID_COLORS.length] });
// grid rectangles in the frame coordinates w×h: [x, y, w, h]
export function gridRects(g, w, h) {
  const { kind, count, gutter, margin } = normGrid(g);
  const out = [];
  const along = kind === "rows" ? h : w;
  const size = (along - 2 * margin - (count - 1) * gutter) / count;
  if (!(size > 0) || !(w > 0) || !(h > 0)) return out;
  if (kind === "columns") for (let i = 0; i < count; i++) out.push([margin + i * (size + gutter), 0, size, h]);
  else if (kind === "rows") for (let i = 0; i < count; i++) out.push([0, margin + i * (size + gutter), w, size]);
  else for (let y = margin; y + size <= h - margin + 0.01 && out.length < 4000; y += size + gutter) for (let i = 0; i < count; i++) out.push([margin + i * (size + gutter), y, size, size]);
  return out;
}
export function describeGrids(list) {
  return normGrids(list).map((g) => tr("g_line", { title: gridTitle(g.kind).toLowerCase(), count: g.count, gutter: g.gutter, margin: g.margin, color: g.color })).join("; ");
}

// design errors (window.onerror, unhandledrejection): unique by text, the text is cut, at most ERR_MAX go into the batch
export const ERR_MAX = 5, ERR_CUT = 300;
export function normErrors(raw) {
  const out = [], seen = new Set();
  for (const e of Array.isArray(raw) ? raw : []) {
    const text = cut(e && typeof e === "object" ? e.text : e, ERR_CUT);
    if (!text || text === "Script error." || seen.has(text)) continue;
    seen.add(text);
    out.push({ text, where: cut(e && e.where, 80) });
  }
  return out;
}
export function describeErrors(items) {
  const list = normErrors(items);
  if (!list.length) return "";
  const shown = list.slice(0, ERR_MAX).map((e) => `  • ${e.text}${e.where ? ` (${e.where})` : ""}`);
  if (list.length > ERR_MAX) shown.push(`  • ${tr("e_more", { n: list.length - ERR_MAX })}`);
  return tr("e_head", { n: list.length }) + shown.join("\n");
}

export const draftCount = (comments, changes, drawings = [], notes = [], tweaks = [], errors = []) =>
  comments.filter((c) => String(c.text || "").trim()).length + changes.filter(hasEffect).length + drawings.length + tweaks.filter(tweakEffect).length +
  notes.filter((n) => String(n.text || "").trim()).length + errors.filter((e) => normErrors(e.items).length).length;

// --- canvas: view, zoom, frame layout -------------------------------------------------------------------------
export const CANVAS_MIN = 0.05, CANVAS_MAX = 4;
export const clampK = (k) => Math.min(CANVAS_MAX, Math.max(CANVAS_MIN, k));

// the wheel: zoom around the point (px, py) in scene coordinates; the point under the cursor stays in place
export function zoomAt(v, factor, px, py) {
  const k = clampK(v.k * factor);
  const r = k / v.k;
  return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
}

// the top of the first frame on the scene: the floating toolbar (12 + 40 px) + 24 px of air + the frame label (28 px and a 4 px gap)
export const TOOLBAR_BOTTOM = 52, TOOLBAR_GAP = 24, LABEL_H = 28, LABEL_GAP = 4;
export const FRAME_TOP = TOOLBAR_BOTTOM + TOOLBAR_GAP + LABEL_H + LABEL_GAP;

// fit the frames into the scene window W×H with margins; not larger than 100%; room at the top for the toolbar and the label
export function fitView(frames, W, H, pad = 56) {
  if (!frames.length || W < 10 || H < 10) return { x: pad, y: FRAME_TOP, k: 1 };
  const x0 = Math.min(...frames.map((f) => f.x)), y0 = Math.min(...frames.map((f) => f.y));
  const x1 = Math.max(...frames.map((f) => f.x + f.w)), y1 = Math.max(...frames.map((f) => f.y + f.h));
  const room = H - FRAME_TOP - pad;
  const k = clampK(Math.min(1, (W - pad * 2) / Math.max(1, x1 - x0), room / Math.max(1, y1 - y0)));
  return { k, x: (W - (x1 - x0) * k) / 2 - x0 * k, y: FRAME_TOP + Math.max(0, (room - (y1 - y0) * k) / 2) - y0 * k };
}

// where to put a new frame: to the right of the last one, with a gap
export function nextSpot(frames, w, gap = 80) {
  if (!frames.length) return { x: 0, y: 0 };
  const last = frames.reduce((a, f) => (f.x + f.w > a.x + a.w ? f : a), frames[0]);
  return { x: last.x + last.w + gap, y: last.y };
}

// the frame window height is a screen one, by width (like a device); a long page scrolls inside the frame instead of stretching it:
// otherwise vh/svh in the design (min-height:100vh) stretch to the frame height
export const windowHeight = (w) => ({ 1440: 900, 1280: 800, 768: 1024, 390: 844 })[Number(w)] || 900;

// the frame label: the file name without .html
export const frameTitle = (path) => String(path).split(/[\\/]/).pop();

// one design name everywhere: index.html is named by its folder - "demo", not "index"
export const nameOf = (path) => {
  const parts = String(path).split(/[\\/]/).filter(Boolean);
  const name = frameTitle(path).replace(/\.(html?|pdf|svg)$/i, "");
  return name.toLowerCase() === "index" && parts.length > 1 ? parts[parts.length - 2] : name;
};

// which kind of paths this machine has: by the cwd of the hub sessions. A path of another OS ("C:\\…" on a Mac, "!Projects/…" without a root) is not shown on the dashboard
export function nativePath(path, cwds = []) {
  const p = String(path || "");
  const win = (cwds || []).some((c) => /^[A-Za-z]:[\\/]/.test(c || "")) && !(cwds || []).some((c) => String(c || "").startsWith("/"));
  return win ? /^([A-Za-z]:[\\/]|\\\\)/.test(p) : /^(\/|~\/)/.test(p);
}

// designs for the dashboard: authors by timelines and those open on the canvas (not written by a hub specialist - a design added by path)
export function dashboardFiles(authors, frames, cwds, { who = () => "", time = () => 0 } = {}) {
  const out = (authors || []).filter((a) => nativePath(a.path, cwds));
  for (const path of (frames || []).map((f) => (typeof f === "string" ? f : f.path))) {
    if (out.some((a) => a.path === path)) continue;
    const t = Number(time(path)) || 0;   // open only on the canvas: the author is who wrote the file (if known), the time is the file edit on disk
    out.push({ path, session: who(path) || "", ts: t, last: t, wrote: false });
  }
  return out;
}

// --- folders of directions: designs live where they were asked for -----------------------------------------------------------
// A direction is a worker session (the hub's own role "worker") or a name from snapshot.directions; its folder is its cwd. Directions of one project share a cwd -
// that is one folder (the label is then the folder name), a lone direction names its folder.
export const dirKey = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "");
const lastPart = (p) => dirKey(p).split("/").filter(Boolean).pop() || "";
export function directionDirs(sessions = [], directions = []) {
  const by = new Map();
  for (const s of sessions || []) {
    if (!s || !s.cwd || s.kind === "hub") continue;
    if (!((directions || []).includes(s.name) || s.role === "worker")) continue;
    const key = dirKey(s.cwd);
    if (!by.has(key)) by.set(key, { key, cwd: s.cwd, names: [] });
    by.get(key).names.push(s.name);
  }
  return [...by.values()].map((d) => ({ ...d, label: d.names.length === 1 ? d.names[0] : lastPart(d.key) || d.names[0] }));
}
// the folder a design file sits in: the deepest direction folder that contains it ("" - no direction)
export function folderOf(path, dirs = []) {
  const p = dirKey(path);
  const win = /^[A-Za-z]:/.test(p);
  const norm = (x) => (win ? x.toLowerCase() : x);
  let best = "";
  for (const d of dirs) if ((norm(p).startsWith(norm(d.key) + "/")) && d.key.length > best.length) best = d.key;
  return best;
}
// files by folder; a folder holds its files in the order they came in (the caller sorts). Folders: the newest design first; "" - no direction, always last
export function groupFiles(files = [], dirs = []) {
  const by = new Map();
  for (const f of files) {
    const key = folderOf(f.path, dirs);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(f);
  }
  const last = (rows) => Math.max(0, ...rows.map((f) => Number(f.last || f.ts) || 0));
  return [...by.entries()].map(([key, rows]) => ({ key, files: rows, dir: dirs.find((d) => d.key === key) || null, last: last(rows) }))
    .sort((a, b) => (a.key === "") - (b.key === "") || b.last - a.last);
}
// the cwd of the direction a session is (nothing for the hub, specialists, executors, an unknown name): new designs go into <cwd>/design
export function saveDirOf(name, sessions = [], directions = []) {
  if (!name) return "";
  const d = directionDirs(sessions, directions).find((x) => x.names.includes(name));
  return d ? d.cwd : "";
}
// the line for the designer: where to put the new design
export function saveLine(cwd) {
  if (!cwd) return "";
  const sep = /\\/.test(cwd) && !cwd.includes("/") ? "\\" : "/";
  return tr("save_to", { dir: String(cwd).replace(/[\\/]+$/, "") + sep + "design" });
}

// who gets the edits of the open design: its author; no author (the path was only mentioned) - the designer if the hub has one, not the session we came from
export const whoGets = (author, current, ok, dflt = "designer") => author || (ok && ok.has(dflt) ? dflt : current);

// the canvas button theme: tool -> the script mode in the design
export const TOOLS = { select: "edit", hand: "view", text: "text", note: "view", comment: "comment", pencil: "draw", shape: "draw" };
export const toolMode = (tool) => TOOLS[tool] || "view";

// quick colors of the style panel
export const SWATCHES = ["#0b0b0b", "#52514e", "#ffffff", "#d97757", "#e5484d", "#f5a524", "#30a46c", "#257de0", "#6e56cf", "#e93d82", "#faf9f6", "#1f1e1d"];

// "5 min ago" for the design cards
export function ago(ts, now = Date.now() / 1000) {
  const s = Math.max(0, now - Number(ts || 0));
  if (!ts) return "";
  if (s < 90) return tr("ago_now");
  if (s < 3600) return tr("ago_min", { n: Math.round(s / 60) });
  if (s < 86400) return tr("ago_h", { n: Math.round(s / 3600) });
  return tr("ago_d", { n: Math.round(s / 86400) });
}

// the owner's words before the text when there is no design yet: the designer makes a new one instead of editing an open one
export const newDesignPrefix = () => tr("new_design");
// "Design from this": the message to the designer for a document (pdf, svg) taken as the basis
export const basedOnText = (path) => tr("based_on", { f: path });

// --- designs by session timelines: by events, without a timer ------------------------------------------------------------
// The timeline keeps only what is about HTML. The page pulls the session timeline when its edit number in the snapshot has grown (an event) and takes only
// the changed rows (since); the whole set - when the core has another epoch or returned the whole timeline.
const isHtml = (p) => /\.html?$/i.test(p || "");
export function slimItems(items) {
  return (items || []).filter((it) => (it.kind === "tool" && isHtml((it.input || {}).file_path || (it.input || {}).path))
    || (it.kind === "file" && isHtml(it.path)) || (it.kind === "out" && htmlPaths(it.text).length))
    .map((it) => ({ kind: it.kind, name: it.name, ts: it.ts, path: it.path, input: it.input && { file_path: (it.input.file_path || it.input.path) },
      text: it.kind === "out" ? htmlPaths(it.text).join(" ") : undefined }));
}
// whom to re-read: timelines whose edit number has grown since last time (or the core epoch changed)
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

// --- the design file is in place ------------------------------------------------------------------------------------------
// the state from the plugin process: ok | missing (not on disk) | denied (outside the session and project folders of the hub, nothing to show it with)
export const isGone = (state) => state === "missing" || state === "denied";
export const goneText = (state, path) => tr(state === "denied" ? "gone_denied" : "gone_missing", { path });

// --- "Remove" from the queue with undo ---------------------------------------------------------------------------------
// as in the core queue: the message is not removed at once, but for `delay` ms gets the line "Removed · Undo"; the real cancel goes when it expires
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
      if (!isQueued(id)) { rows.delete(id); return onChange(); }   // the message has already gone on its own - leave it alone
      e.failed = false;
      const r = await post("/api/queue/cancel", { session: e.session, id });
      if (r && r.error) e.failed = true; else e.done = true;
      onChange();
    },
    sig: () => [...rows].map(([id, e]) => id + (e.failed ? "f" : e.done ? "d" : "p")).join(),
  };
  return api;
}

// where "Exit Hub Design" leads: to the chat of the one the conversation was with (it exists in the hub), otherwise to where we came from (not from the plugin itself), otherwise home
export function exitTarget(session, known, back, id) {
  if (session && (known || []).includes(session)) return "#/s/" + encodeURIComponent(session);
  return back && !String(back).startsWith("#/x/" + id) ? back : "#/";
}

// specialists without whom Hub Design works incompletely - one place; installed from the specialists catalog (`specialists install <name>`)
export const NEEDED = [
  { name: "designer", need: "required", get title() { return tr("t_designer"); } },
  { name: "animator", need: "wanted", get title() { return tr("t_animator"); } },
];
export const ASK_TTL = 30 * 60 * 1000;   // "asked the hub" lasts this long, then "Install" again
export const installText = (name) => tr("install", { name });
export const hubName = (sessions) => ((sessions || []).find((s) => s.kind === "hub") || {}).name || "hub";
// who is missing from the hub: NEEDED rows with the state "ask" (can be asked) or "wait" (asked, waiting - until the session appears in the snapshot)
export function lacking(sessions, asked = {}, now = Date.now(), needed = NEEDED) {
  const have = new Set((sessions || []).filter((s) => s.kind !== "hub").map((s) => s.name));
  return needed.filter((n) => !have.has(n.name)).map((n) => ({ ...n, state: asked[n.name] && now - asked[n.name] < ASK_TTL ? "wait" : "ask" }));
}
export const bannerText = (n) => tr("banner", { title: n.title });

// there is something to scroll to the right of the visible part of the row (1 px - tolerance for fractional sizes)
export function scrollsRight({ scrollLeft, clientWidth, scrollWidth }) {
  return scrollWidth - (scrollLeft + clientWidth) > 1;
}

// --- cards in the chat feed: a design, a document or a presentation the session sent as a file or named by a full path -----------------------
export const CARD_MAX = 4;   // cards in one reply; the other paths stay links
// design - HTML; pdf and svg - documents: opened on the canvas and taken as the basis of a new design; pptx - a presentation, opened as a file only. Videos, pictures and the rest are not cards.
// The one list of file types a card offers: .html/.htm, .pdf, .svg, .pptx - the same as the core modules/telegram/design_posts.py TYPES
export const cardKind = (path) => (/\.html?$/i.test(path || "") ? "design" : /\.pdf$/i.test(path || "") ? "pdf" : /\.svg$/i.test(path || "") ? "svg"
  : /\.pptx$/i.test(path || "") ? "pptx" : null);
export const isDocument = (path) => ["pdf", "svg"].includes(cardKind(path));
export const isAbsPath = (p) => /^(~[\\/]|\/|[A-Za-z]:[\\/])/.test(p || "");

// a human name: "hero-v2_final.html" -> "Hero v2 final"; a design with a <title> is named by it, index.html - by its folder
export function cardName(path, title = "") {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (t) return t.length > 80 ? t.slice(0, 79) + "…" : t;
  const base = cardKind(path) === "design" ? nameOf(path) : frameTitle(path).replace(/\.[^.]+$/, "");
  const s = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || frameTitle(path);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// the path from a file address in the feed: a file from `hub send-file` is /open?path=... (Files) or /api/file?path=... (player, image)
export function pathFromHref(href) {
  try { return new URL(href, "http://x").searchParams.get("path") || ""; } catch { return ""; }
}

// "Hide": the browser remembers collapsed cards; the list is short - old ones drop out
export const HIDDEN_MAX = 500;
export function hideToggle(list, path, hidden) {
  const rest = (list || []).filter((p) => p !== path);
  return (hidden ? [...rest, path] : rest).slice(-HIDDEN_MAX);
}

// card strings: the language is hub.lang (read at use time), any other - English
export const CARD_STR = {
  en: { by: "Hub Design", hide: "Hide", show: "Show", share: "Copy path", copied: "Path copied", open: "Open in Hub Design", hd: "Hub Design", open_file: "Open", open_file_title: "Open the file", hide_title: "Fold the card into one line", show_title: "Unfold the card", design: "design", video: "video", pdf: "PDF", svg: "SVG", gone: "file unavailable" },
  ru: { by: "Hub Design", hide: "Скрыть", show: "Показать", share: "Скопировать путь", copied: "Путь скопирован", open: "Открыть в Hub Design", hd: "Hub Design", open_file: "Открыть", open_file_title: "Открыть файл", hide_title: "Свернуть карточку в строку", show_title: "Развернуть карточку", design: "макет", video: "видео", pdf: "PDF", svg: "SVG", gone: "файл недоступен" },
};
export const cardText = (lang) => CARD_STR[String(lang || "").slice(0, 2)] || CARD_STR.en;
