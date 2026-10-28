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
    bi_ls: "Tracking {v}: add to the letter-spacing of all texts",
    bi_lh: "Leading {v}: add to the line-height of all texts (in font sizes)",
    a_lost: "; element not found: the layout changed, the point stayed where it was",
    a_tag: "tag {tag}", a_text: "text {s}", a_attr: "attributes {s}", a_inside: "inside #{anc}", a_cls: "classes {list}", a_near: "next to {s}",
    a_noid: "; no id, hints: {bits}",
    m_head: "Edits to the design `{f}` (Hub Design, round {round}; window {w}\u00d7{h} px, coordinates from the top-left corner of the page).",
    m_grid: "Grid over the frame (a layout guide, on the canvas only; it is not in the design): {g}.",
    m_point: "point",
    m_region: "Comment on the area x {x}, y {y}, {w}\u00d7{h} px (inside {el}{note}; in it: {els}): {text}",
    m_region_none: "nothing but the background",
    m_comment: "Comment on {el}, point x {x}, y {y} (element {w}\u00d7{h} at x {ex}, y {ey}{note}): {text}",
    m_hand: "Hand edit `{sel}`{label}: {what}{inFile}.",
    m_infile: ", already in the file",
    undone: "undone, back to the original",
    m_drawing: "Freehand drawing: {d}{text}.",
    m_auto: "These are my own actions in the Hub Design panel, sent automatically. No report needed: reply with a single line \u201c\u2014\u201d.",
    m_style: "Style reference: {path}",   // the same line in every language: the designer's skill looks for it
    m_tweaks: "Tweaks: values from the Hub Design panel (#hub-tweaks). Make the new ones the defaults and move them into the code.",
    m_hand_note: "The hand edits were made right in the preview. Put them into the code with the same look and the same numbers. Keep the owner's manual positions as is \u2014 do not fix, align or revert them without asking.",
    m_file_note: "Hub Design wrote the items marked \u201calready in the file\u201d into the design itself, point by point: an inline style or the element's own text, tweaks on <html>{copy}. The look on screen is right: keep it. Keep the owner's manual positions as is \u2014 do not fix, align or revert them without asking.",
    m_copy: "; the copy of the file before these edits is `{c}`, do not overwrite or delete it",
    m_notes: "Notes from the Hub Design canvas (round {round}):\n",
    m_note: "Canvas note",
    selected: "Selected: {file} `{sel}` {tag}{label}",
    element: "element", none: "none",
    g_columns: "Columns", g_rows: "Rows", g_grid: "Cells",
    g_line: "{title} {count} (gutter {gutter}, margin {margin}, color {color})",
    e_more: "and {n} more",
    e_head: "Errors in the design ({n}):\n",
    ago_now: "just now", ago_min: "{n} min ago", ago_h: "{n} h ago", ago_d: "{n} d ago",
    new_design: "New design (Hub Design): ",
    based_on: "Make a design based on {f}",
    save_to: "Save it in a task folder of the direction: {dir}/<task>/ (<task> - a short Latin kind-gist name, like poster-bf-sale), every variant and round in a folder of its own inside: <design-name>-1a/index.html, its assets inside; not in your own working folder.",
    save_home: "Save it in a task folder: {dir}<task>/ (<task> - a short Latin kind-gist name, like poster-bf-sale), every variant and round in a folder of its own inside: <design-name>-1a/index.html, its assets inside; not loose files.",
    save_task: "All the designs of this task go into one folder: {dir}, every variant and round in a folder of its own inside: <design-name>-1a/index.html, its assets inside; not next to the files and not in your own working folder.",
    m_place: "The next round of this design goes into the same task folder {dir} as a folder of its own: <design-name>-<round>/index.html, its assets inside.",
    gone_denied: "The file is outside the hub's project and session folders, so the plugin will not show it: {path}",
    gone_missing: "File not found: {path}",
    t_designer: "designer", t_writer: "writer",
    install: "Install the specialist for Hub Design: specialists install {name}",
    banner: "Hub Design needs the {title}",
    k_email: "Email", k_post: "Post", k_story: "Story", k_banner: "Banner", k_landing: "Landing", k_slides: "Slides", k_poster: "Poster", k_ad: "Ad", k_screen: "Screen", k_design: "Design",
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
    bi_ls: "Трекинг {v}: добавь к letter-spacing всех текстов",
    bi_lh: "Интерлиньяж {v}: добавь к line-height всех текстов (в размерах шрифта)",
    tw_line: "Крутилка `{key}`: {a} \u2192 {b}",
    a_lost: "; элемент не найден: в макете изменилась вёрстка, точка осталась на прежнем месте",
    a_tag: "тег {tag}", a_text: "текст {s}", a_attr: "атрибуты {s}", a_inside: "внутри #{anc}", a_cls: "классы {list}", a_near: "рядом {s}",
    a_noid: "; нет id, приметы: {bits}",
    m_head: "Правки к дизайну `{f}` (Hub Design, раунд {round}; окно {w}\u00d7{h} px, координаты от верхнего левого угла страницы).",
    m_grid: "Сетка поверх рамки (ориентир раскладки, на холсте; в макете её нет): {g}.",
    m_point: "точка",
    m_region: "Комментарий к области x {x}, y {y}, {w}\u00d7{h} px (внутри {el}{note}; в ней: {els}): {text}",
    m_region_none: "только фон",
    m_comment: "Комментарий к {el}, точка x {x}, y {y} (элемент {w}\u00d7{h} в x {ex}, y {ey}{note}): {text}",
    m_hand: "Правка руками `{sel}`{label}: {what}{inFile}.",
    m_infile: ", уже в файле",
    undone: "отменено, снова как было",
    m_drawing: "Рисунок от руки: {d}{text}.",
    m_auto: "Это мои действия в панели Hub Design, отправились сами. Отчёт не нужен: ответь одной строкой \u00ab\u2014\u00bb.",
    m_style: "Style reference: {path}",
    m_tweaks: "Крутилки: значения из панели Hub Design (#hub-tweaks). Сделай новые значениями по умолчанию и перенеси их в код.",
    m_hand_note: "Правки руками сделаны прямо в предпросмотре. Перенеси их в код с тем же видом и теми же числами. Позиции, которые владелец поставил руками, оставь как есть: не чини, не выравнивай и не откатывай без спроса.",
    m_file_note: "Пункты \u00abуже в файле\u00bb Hub Design записал в макет сам, точечно: inline-стиль или текст самого элемента, крутилки на <html>{copy}. Вид на экране верный: сохрани его. Позиции, которые владелец поставил руками, оставь как есть: не чини, не выравнивай и не откатывай без спроса.",
    m_copy: "; копия файла до этих правок: `{c}`, её не перезаписывай и не удаляй",
    m_notes: "Заметки с холста Hub Design (раунд {round}):\n",
    m_note: "Заметка на холсте",
    selected: "Выделено: {file} `{sel}` {tag}{label}",
    element: "элемент", none: "нет",
    g_columns: "Колонки", g_rows: "Строки", g_grid: "Клетки",
    g_line: "{title} {count} (зазор {gutter}, поле {margin}, цвет {color})",
    e_more: "и ещё {n}",
    e_head: "Ошибки в макете ({n}):\n",
    ago_now: "только что", ago_min: "{n} мин назад", ago_h: "{n} ч назад", ago_d: "{n} дн назад",
    new_design: "Новый макет (Hub Design): ",
    based_on: "Сделай макет на основе {f}",
    save_to: "Сохрани в папку задачи направления: {dir}/<задача>/ (<задача> — короткое латинское имя «вид-суть», вроде poster-bf-sale), каждый вариант и раунд — своей папкой внутри: <имя-макета>-1a/index.html, ресурсы в ней; не в свою рабочую папку.",
    save_home: "Сохрани в папку задачи: {dir}<задача>/ (<задача> — короткое латинское имя «вид-суть», вроде poster-bf-sale), каждый вариант и раунд — своей папкой внутри: <имя-макета>-1a/index.html, ресурсы в ней; не файлами россыпью.",
    save_task: "Все макеты этой задачи — в одну папку: {dir}, каждый вариант и раунд — своей папкой внутри: <имя-макета>-1a/index.html, ресурсы в ней; не рядом с файлами и не в свою рабочую папку.",
    m_place: "Следующий раунд этого макета — в ту же папку задачи {dir} своей папкой: <имя-макета>-<раунд>/index.html, ресурсы в ней.",
    gone_denied: "Файл вне папок проектов и сессий хаба, плагин его не покажет: {path}",
    gone_missing: "Файл не найден: {path}",
    t_designer: "дизайнер", t_writer: "райтер",
    install: "Поставь специалиста для Hub Design: specialists install {name}",
    banner: "Для Hub Design нужен {title}",
    k_email: "Email", k_post: "Пост", k_story: "Сторис", k_banner: "Баннер", k_landing: "Лендинг", k_slides: "Слайды", k_poster: "Постер", k_ad: "Реклама", k_screen: "Экран", k_design: "Макет",
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

// the link that opens a design on the canvas: <page of the hub>/#/x/hub-design?open=<full path>. The core keeps the params of a view address
// through a reload and "back", so the link works on a fresh page load and on an open page alike
export const designLink = (page, path, id = "hub-design") => `${String(page).replace(/\/+$/, "")}/#/x/${id}?open=${encodeURIComponent(path)}`;
// the path out of such an address ("" - the address is not an open request of this view)
export function designPathOf(hash, id = "hub-design") {
  const m = String(hash || "").match(new RegExp(`^#/x/${id}\\?(.*)$`));
  const hit = m && m[1].split("&").find((q) => q.startsWith("open="));
  if (!hit) return "";
  try { return decodeURIComponent(hit.slice(5)); } catch { return ""; }
}

// the file address at the process: /f/Users/me/site/index.html, Windows - /f/C:/site/index.html
export function fileUrl(origin, path) {
  const p = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
  return `${origin}/f/${p.split("/").map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join("/")}`;
}

// a quoted path may contain spaces ("…/My Projects/Demo Site/…/a.html"); without quotes a space ends the path, and a tail must not be bitten off it:
// "/analytics/weekly/a.html" out of "Threads/analytics/weekly/a.html" is a nonexistent file, and on the canvas it is a raw server response (0.5.1)
const QUOTED_PATH = /(["'`])((?:~|\/|[A-Za-z]:[\\/])[^"'`\n<>]*?\.html?)\1/gu;
const HTML_PATH = /(?<![\p{L}\p{N}_\/.~:!-])(?:~|\/|[A-Za-z]:[\\/])[^\s"'`<>()\[\]{}|,;*]*?\.html?(?![\w])/gu;

// the core copy of a file sent to the owner (`hub send-file`): <state>/attachments/<id>/<name>, with no assets beside it and outside the folders of the
// hub. It is never a design: the design is the file the session sent (`source` of the feed row). Without a source there is no design to show
export const isCopy = (p) => /[\\/]attachments[\\/][0-9a-f]{12}[\\/][^\\/]+$/i.test(String(p || ""));
// the design file of a feed row of the kind "file": the source, otherwise the path unless that is the core copy
export const fileOf = (it) => { const p = it.source || it.path; return isCopy(p) ? "" : p; };

export function htmlPaths(text) {
  const src = String(text || "");
  const found = [];
  let rest = src;
  for (const m of src.matchAll(QUOTED_PATH)) {
    found.push([m.index + 1, m[2]]);
    rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  for (const m of rest.matchAll(HTML_PATH)) found.push([m.index, m[0]]);
  return found.sort((a, b) => a[0] - b[0]).map((x) => x[1]).filter((p) => !p.includes("://") && !isCopy(p));
}

// HTML files the session worked with: what it wrote and edited, what it sent, what it named - the freshest first
export function recentHtml(items, limit = 12) {
  const out = [];
  const add = (p) => {
    if (!p || !/\.html?$/i.test(p) || p.startsWith("http") || isCopy(p)) return;
    const i = out.indexOf(p);
    if (i >= 0) out.splice(i, 1);
    out.push(p);
  };
  for (const it of items || []) {
    if (it.kind === "tool") {
      const inp = it.input || {};
      add(inp.file_path || inp.path || inp.notebook_path);
    } else if (it.kind === "file") add(fileOf(it));
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
    if (!path || !/\.html?$/i.test(path) || path.startsWith("http") || isCopy(path)) return;
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
      } else if (it.kind === "file") take(fileOf(it), session, ts, 1);
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
    if (!a || !a.path || isCopy(a.path)) continue;
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
      text: it.kind === "file" ? (it.image ? String(it.caption || "") : `${it.caption ? it.caption + "\n" : ""}${it.source || it.path}`) : String(it.text),
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
// a circle that grows from the centre of the dot until it covers the whole box (the hover of the Style button): the centre
// and the radius, in the box's own coordinates; both are DOMRect-like {left, top, width, height}
export function spread(box, dot) {
  const x = dot.left + dot.width / 2 - box.left, y = dot.top + dot.height / 2 - box.top;
  return { x, y, r: Math.ceil(Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y))) + 2 };
}
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
  return tr("cols", { a: a || tr("none"), b: b || tr("none"), from: num(v.from), to: num(v.to) });
};

// one "edit" change - in words and numbers
export function describeChange(c) {
  if (c.undone) return tr("undone");
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

// the agent reports the whole state of one element after every step (move, resize, undo, redo): the list of changes after it.
// A state with no effect (undone to the original) removes the draft and the record already written to the file (it is rolled back from the copy);
// if the designer had got that edit (sent), a draft "undone" tells him the file is back as it was
export function foldChange(changes, c) {
  const same = (q) => q.file === c.file && q.sel === c.sel;
  const draft = changes.find((q) => same(q) && q.state === "draft");
  const next = changes.filter((q) => !(same(q) && (q.state === "draft" || q.state === "sent" && q.inFile)));
  // the designer already has an edit of this element (sent), or an undo of it is still waiting to go: the file must not silently differ from what he knows
  const told = changes.some((q) => same(q) && q.state === "sent" && hasEffect(q) && !q.undone) || !!(draft && (draft.undone || draft.told));
  const rec = { ...c, state: "draft" };
  if (hasEffect(rec)) {
    if (told) rec.told = true;
    if (!draft) return [...changes, rec];
    return changes.map((q) => (q === draft ? rec : q));
  }
  return told ? [...next, { ...rec, undone: true }] : next;
}

// Ctrl+Z / Ctrl+Shift+Z over everything the owner did by hand, in the order he did it: element edits (k "e": the frame keeps its own stack and is told
// to step) and tweaks (k "t": the value goes back to `before`). A run of one tweak's steps (a slider drag) is one step
export function createSteps({ merge = 800, max = 200 } = {}) {
  let done = [], undone = [];
  return {
    push(step) {
      const at = step.at || Date.now();
      const last = done[done.length - 1];
      if (step.k === "t" && last && last.k === "t" && last.file === step.file && last.key === step.key && at - last.at < merge) { last.after = step.after; last.at = at; }
      else { done.push({ ...step, at }); if (done.length > max) done.shift(); }
      undone = [];
    },
    undo() { const s = done.pop(); if (s) undone.push(s); return s || null; },
    redo() { const s = undone.pop(); if (s) done.push(s); return s || null; },
    drop(file) { done = done.filter((s) => s.file !== file); undone = undone.filter((s) => s.file !== file); },
    size: () => [done.length, undone.length],
  };
}

// the message to the designer as a batch: comments on points, hand edits, drawings, notes; the designer edits the file.
// Items with a `file` field of different files go in separate sections; without the field - one file `path`
// --- hand edits straight into the file (server.py /__canvas/write): what to send and what to mark "already in the file" -------------------------------
// drafts and sent but not yet accepted by the designer: the file is always rebuilt from the copy - as one full set
export const writable = (changes, file) => [...new Map(changes.filter((c) => c.file === file && c.state !== "done" && !c.handed && !c.undone && hasEffect(c))
  .map((c) => [c.sel, { sel: c.sel, label: c.label || "", tag: c.tag || "", t0: c.t0 ?? null, t: c.t ?? null, dx: c.dx || 0, dy: c.dy || 0, w: c.w ?? null, h: c.h ?? null, css: c.css || {} }])).values()];   // one element - one record, the last
// handed - went to the designer in words, not as a write to the file: from then on the designer edits it, Hub Design does not write it to the file
// the server response -> marks on the edits: inFile - written to the file, noWrite - why it was skipped (the code from handwrite.py; left to the designer)
export function markWritten(changes, tweaks, file, res) {
  const done = new Set((res && res.done) || []);
  const why = Object.fromEntries(((res && res.skipped) || []).map((x) => [x.sel, x.code || x.why]));
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
export function message({ path, round, view, views = {}, comments, changes, drawings = [], notes = [], tweaks = [], errors = [], copies = {}, auto = false, style = "", place = false }) {
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
      lines.push(`${n}. ` + tr("m_hand", { sel: c.sel, label: c.label ? ` ${tr("quote", { s: cut(c.label) })}` : "", what, inFile: c.inFile || c.undone ? tr("m_infile") : "" }));
    }
    for (const d of drawings.filter((x) => of(x) === f)) {
      n += 1;
      lines.push(`${n}. ` + tr("m_drawing", { d: describeDrawing(d), text: String(d.text || "").trim() ? ` (${String(d.text).trim()})` : "" }));
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
    if (mine.some((c) => hasEffect(c) && !c.inFile && !c.undone)) lines.push(tr("m_hand_note"));
    if (mine.some((c) => hasEffect(c) && (c.inFile || c.undone)) || turned.some((c) => c.inFile)) {
      const copy = copyPath(f, copies[f]);
      lines.push(tr("m_file_note", { copy: copy ? tr("m_copy", { c: copy }) : "" }));
    }
    blocks.push(lines.join("\n"));
  }
  const said = notes.filter((x) => String(x.text || "").trim());
  if (said.length) {
    blocks.push((blocks.length ? "" : tr("m_notes", { round })) + said.map((x, i) => `${blocks.length ? tr("m_note") : i + 1 + "."} ${cut(x.text, 500)}`).join("\n"));
  }
  if (place && blocks.length && placeOf(path)) blocks.push(tr("m_place", { dir: placeOf(path) }));
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

// --- labels of designs: "<kind>-<N>: <gist>" (Email-1: Kyoto, Post-2: 50% off) instead of the file name -----------------------------------------------
// the kind comes from the title of the design (else from the file name), the gist is its headline: the part of the title next to the kind, 1-3 words;
// N counts the designs of one kind in one folder by the time they were made
const W = "(?<![\\p{L}])", E = "(?![\\p{L}])";
const KINDS = [
  ["email", new RegExp(W + "(e-?mails?|письм[оа]|рассылк[аи]|newsletter)" + E, "iu")],
  ["story", new RegExp(W + "(stor(y|ies)|сторис|истори[яи])" + E, "iu")],
  ["banner", new RegExp(W + "(banners?|баннер(ы|а|ов)?)" + E, "iu")],
  ["landing", new RegExp(W + "(landing|лендинг(и|а)?)" + E, "iu")],
  ["slides", new RegExp(W + "(slides?|decks?|слайд(ы|а|ов)?|презентаци[яи])" + E, "iu")],
  ["poster", new RegExp(W + "(posters?|постер(ы|а|ов)?|афиш[аиы])" + E, "iu")],
  ["ad", new RegExp(W + "(ads?|креатив(ы|а|ов)?|реклам[аыу])" + E, "iu")],
  ["post", new RegExp(W + "(posts?|пост(ы|а|ов)?)" + E, "iu")],
  ["screen", new RegExp(W + "(screens?|экран(ы|а|ов)?)" + E, "iu")],
];
const kindName = (id) => ({
  email: () => tr("k_email"), post: () => tr("k_post"), story: () => tr("k_story"), banner: () => tr("k_banner"), landing: () => tr("k_landing"),
  slides: () => tr("k_slides"), poster: () => tr("k_poster"), ad: () => tr("k_ad"), screen: () => tr("k_screen"),
}[id] || (() => tr("k_design")))();
const kindIn = (text) => (KINDS.find(([, re]) => re.test(text || "")) || [])[0] || "";
// the kind of a design: its title first, then its file name ("welcome-email.html")
export const kindOf = (title, path) => kindIn(title) || kindIn(String(nameOf(path || "")).replace(/[_.-]+/g, " "));

const SEP = /\s*[,;:|·•–—]\s*|\s+-\s+/u;
const NUM = /(?<![\p{L}\p{N}])([#№]?\d+[a-zA-Z]?|[rR]\d+)(?![\p{L}\p{N}])/gu;
const trim = (s) => s.replace(/\s+/g, " ").replace(/^[\s\-–—_.,:;|]+|[\s\-–—_.,:;|]+$/gu, "");
const MAX_WORDS = 3, MAX_GIST = 26;
const clip = (s) => {
  const w = trim(s).replace(/^(для|про|for|about)\s+/iu, "").split(" ").slice(0, MAX_WORDS);
  while (w.length > 1 && w.join(" ").length > MAX_GIST) w.pop();
  const out = w.join(" ");
  return out.length > MAX_GIST ? out.slice(0, MAX_GIST - 1) + "…" : out;
};
// the gist of a design: next to the kind in the title ("Black Friday post 01, 50% off" - "50% off"), else the title without the kind and the numbers,
// else the file name without the kind and the round numbers
export function gistOf(title, path = "") {
  const kre = (KINDS.find(([id]) => id === kindIn(title)) || [])[1];
  const segs = String(title || "").split(SEP).map((x) => x.trim()).filter(Boolean);
  const own = (x) => trim(x.replace(kre || /$^/, " ").replace(NUM, " "));
  const i = kre ? segs.findIndex((x) => kre.test(x)) : -1;
  const letters = (x) => /\p{L}/u.test(x);
  const cand = i < 0 ? segs.filter(letters).map(trim) : [...segs.slice(i + 1).filter(letters).map(trim), own(segs[i]), ...segs.slice(0, i).reverse().filter(letters).map(own)];
  const got = cand.find((x) => letters(x));
  if (got) return clip(got);
  const file = String(nameOf(path || "")).replace(/[_.-]+/g, " ");
  const kf = (KINDS.find(([id]) => id === kindIn(file)) || [])[1];
  return clip(trim(file.replace(kf || /$^/, " ").replace(NUM, " ")));
}
// the labels for the designs of one list: items [{key, title, path, group, ts}] - the number counts the designs of one kind in one group (folder) by ts.
// returns Map key -> label
export function labelsOf(items = []) {
  const n = new Map(), out = new Map();
  const order = [...items].sort((a, b) => (a.ts || 0) - (b.ts || 0) || String(a.path).localeCompare(String(b.path)));
  for (const f of order) {
    const kind = kindOf(f.title, f.path), c = (n.get((f.group || "") + "|" + kind) || 0) + 1;
    n.set((f.group || "") + "|" + kind, c);
    const gist = gistOf(f.title, f.path);
    out.set(f.key, kindName(kind) + "-" + c + (gist ? ": " + gist : ""));
  }
  return out;
}

// which kind of paths this machine has: by the cwd of the hub sessions. A path of another OS ("C:\\…" on a Mac, "!Projects/…" without a root) is not shown on the dashboard
export function nativePath(path, cwds = []) {
  const p = String(path || "");
  const win = (cwds || []).some((c) => /^[A-Za-z]:[\\/]/.test(c || "")) && !(cwds || []).some((c) => String(c || "").startsWith("/"));
  return win ? /^([A-Za-z]:[\\/]|\\\\)/.test(p) : /^(\/|~\/)/.test(p);
}

// a design's key whatever way its path was written: the separators, the drive letter's case (the feed says "C:\a\b.html", the registry "c:/a/b.html")
export const pathKey = (p) => {
  const s = String(p || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[A-Za-z]:/.test(s) ? s.toLowerCase() : s;
};

// designs for the dashboard: authors by timelines, the registry of every design ever made (the plugin process keeps it: a session may be gone, the design stays),
// and those open on the canvas (not written by a hub specialist - a design added by path). One entry per file; the live feeds come first.
// registry: [{path, session, ts, last, rank}]; skip(session) - sessions whose designs are not listed (the hub's own)
export function dashboardFiles(authors, frames, cwds, { who = () => "", time = () => 0, registry = [], skip = () => false } = {}) {
  const out = [], seen = new Map();
  const add = (a) => {
    const k = pathKey(a.path), cur = seen.get(k);
    if (cur) { cur.last = Math.max(cur.last || 0, a.last || a.ts || 0); if (a.task && !cur.task) cur.task = a.task; if (a.title && !cur.title) cur.title = a.title; return; }
    seen.set(k, a);
    out.push(a);
  };
  for (const a of authors || []) if (isCanvasFile(a.path) && nativePath(a.path, cwds)) add({ ...a });
  for (const r of registry || []) {
    if (!r || !r.path || !isCanvasFile(r.path) || !nativePath(r.path, cwds) || skip(r.session)) continue;
    add({ path: r.path, session: r.session || "", ts: Number(r.ts) || 0, last: Number(r.last || r.ts) || 0, rank: r.rank || 0, wrote: r.rank === 2, sent: r.rank === 1, ...(r.task ? { task: String(r.task) } : {}), ...(r.title ? { title: String(r.title) } : {}) });
  }
  for (const path of (frames || []).map((f) => (typeof f === "string" ? f : f.path))) {
    if (!isCanvasFile(path) || seen.has(pathKey(path))) continue;
    const t = Number(time(path)) || 0;   // open only on the canvas: the author is who wrote the file (if known), the time is the file edit on disk
    add({ path, session: who(path) || "", ts: t, last: t, wrote: false });
  }
  return out;
}

// --- folders of directions: designs live where they were asked for -----------------------------------------------------------
// A direction is a worker session (the hub's own role "worker") or a name from snapshot.directions; its folder is its cwd. Directions of one project may share a cwd:
// each of them is still a folder of its own (key "<cwd>#<name>", label - its name); which of them a design in that cwd belongs to is told by homeOf.
const SHARED = "#";
const rootOf = (d) => d.root || d.key;
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
  const out = [];
  for (const d of by.values()) {
    if (d.names.length === 1) out.push({ ...d, root: d.key, label: d.names[0] });
    else for (const n of d.names) out.push({ key: d.key + SHARED + n, cwd: d.cwd, root: d.key, names: [n], label: n, shared: true });
  }
  return out;
}
// the directions whose cwd is the deepest one that contains the file: none, one, or several (the directions sharing that cwd)
export function dirsAt(path, dirs = []) {
  const p = dirKey(path);
  const win = /^[A-Za-z]:/.test(p);
  const norm = (x) => (win ? x.toLowerCase() : x);
  let best = "", at = [];
  for (const d of dirs) {
    const r = rootOf(d);
    if (!norm(p).startsWith(norm(r) + "/") || r.length < best.length) continue;
    if (r.length > best.length) { best = r; at = []; }
    at.push(d);
  }
  return at;
}
// the folder a design file sits in: the deepest direction folder that contains it ("" - no direction, or several directions share it: homeOf tells which)
export function folderOf(path, dirs = []) {
  const at = dirsAt(path, dirs);
  return at.length === 1 ? at[0].key : "";
}
// --- folders of tasks: all the designs made for one task of the owner (every round, every session of the chain) lie in one folder ----------
// the registry of the plugin process gives each design the root of the chain of tasks it was made for (f.task). A task gets a folder when it has several designs
export const TASK_MIN = 2;
export const TASK_PREFIX = "task:";
export const isTaskKey = (key) => String(key || "").startsWith(TASK_PREFIX);
export const taskOfKey = (key) => (isTaskKey(key) ? String(key).slice(TASK_PREFIX.length) : "");
// a subfolder inside a direction is a folder of a project on disk (<home>/design/<project>/): "proj:<project>"
export const PROJECT_PREFIX = "proj:";
export const isProjectKey = (key) => String(key || "").startsWith(PROJECT_PREFIX);
export const projectOfKey = (key) => (isProjectKey(key) ? String(key).slice(PROJECT_PREFIX.length) : "");
// the other subfolder inside a direction is a family: the variants and rounds of one thing lying side by side ("tv-price-b-2a", "tv-price-c-4a"): "kind:<folder>|<family>"
export const KIND_PREFIX = "kind:";
export const isKindKey = (key) => String(key || "").startsWith(KIND_PREFIX);
export const kindOfKey = (key) => (isKindKey(key) ? String(key).slice(KIND_PREFIX.length).split("|").pop() : "");
export const isSubKey = (key) => isProjectKey(key) || isKindKey(key);
// the family of a design: the name of its folder (index.html) or of its file without the variant letter and the round at its end ("tv-price-b-2a" -> "tv-price",
// "style-frames-v4" -> "style-frames"), and the folder that holds it; none - the name is nothing but variants
const ROUND = /(?:[-_ ](?:v?\d+[a-z]?|[a-e]))+$/i;
export function familyOf(path) {
  const parts = dirKey(path).split("/").filter(Boolean);
  let name = (parts.pop() || "").replace(/\.[^.]+$/, "");
  if (name.toLowerCase() === "index") name = parts.pop() || "";
  const slug = name.replace(ROUND, "").trim();
  return slug && !/^(?:v?\d+[a-z]?|[a-e])$/i.test(slug) ? { slug, dir: parts.join("/") } : null;
}
// the name of a family from the title of a design: the version and the variant letter at its end are not the name ("Ad BF end card 2, title v6" -> "Ad BF end card 2, title");
// a title that is no name (empty, a path, a long brief) gives "" - the folder name is used then
const VARIANT = /[\s,]+(?:v\d+[a-z]?|[a-e])$/i;
export function familyTitle(title) {
  let x = shortTitle(title);
  for (let i = 0; i < 2; i++) x = x.replace(VARIANT, "").trim();
  return x.length >= 3 && !/[\/…]/.test(x) ? x : "";
}
// a design that no direction owns is a tile of the top level named for its own task: "name:<the name>"; the name is short, readable and has no path
export const NAME_PREFIX = "name:";
export const isNameKey = (key) => String(key || "").startsWith(NAME_PREFIX);
export const nameOfKey = (key) => (isNameKey(key) ? String(key).slice(NAME_PREFIX.length) : "");
// the folder of the task in a readable form: "poster-bf-sale" -> "Poster bf sale"
export const readableSlug = (slug) => {
  const x = String(slug || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return x.charAt(0).toUpperCase() + x.slice(1);
};
// the title of a task is a headline when it reads as a name and not as the start of a brief: a few words, not cut ("..."), no "Role:", no path in it
export const HEADLINE_WORDS = 4, HEADLINE_MAX = 32;
const BRIEF = /^(?:role|trial|task|brief|\u0440\u043e\u043b\u044c|\u0437\u0430\u0434\u0430\u0447\u0430)\s*:/i;
// the id of a task in a title ("(d95926)", "d95926") is no name, nor is the service name the hub gives a task of the owner ("Owner task", "Task from ..."): the headline is what is left of the title
const TASK_ID = /\s*\([dmq]\d+\)|(?:^|\s)[dmq]\d{3,}(?=\s|$)/gi;
const SERVICE = /^(?:задача владельца|задача от(?: .*)?|owner(?:'s)? task|task from(?: .*)?)$/i;
export function headlineOf(title) {
  const x = String(title || "").replace(TASK_ID, " ").replace(/\s+/g, " ").trim().replace(/[\s,;:.—–-]+$/, "");
  if (!x || SERVICE.test(x) || x.length > HEADLINE_MAX || /[\u2026]|\.\.\.$/.test(x) || BRIEF.test(x) || shortTitle(x) !== x) return "";
  return x.split(" ").length <= HEADLINE_WORDS ? x : "";
}
// the name of a design's own task: the folder of the task (design/<task>/), else the title of the task when it is a headline, else the title of the design, else its file
// (index.html is named by its folder)
export function placeNameOf(f, taskRows = []) {
  const row = f.task ? (taskRows || []).find((x) => x.id === f.task) : null;
  const parts = String(f.path || "").split(/[\\/]/).filter(Boolean), file = (parts.pop() || "").replace(/\.[^.]+$/, "");
  return readableSlug(projectOf(f.path)) || headlineOf(row && row.title) || shortTitle(f.title) || readableSlug(file === "index" ? parts.pop() : file) || "?";
}
export const placeKeyOf = (f, taskRows = []) => NAME_PREFIX + placeNameOf(f, taskRows);
// Two folders no direction owns: the service files (covers, icons, test pages: what the owner never asked for) and the designer's own designs outside any project.
export const SERVICE_KEY = "service:", DESIGNER_KEY = "designer:";
export const isServiceKey = (key) => key === SERVICE_KEY;
export const isDesignerKey = (key) => key === DESIGNER_KEY;
// a design is a service file when it is an icon file (svg), lies in a scratch or plugin folder, or its file (or the folder it lies in) is named cover, icon, preview, stage, test, harness, loader, check;
// a design in a project folder (design/<project>/) is the designer's work: only the folder's own name (motion-loader) can make it a service one
const SERVICE_WORDS = new Set(["cover", "icon", "icons", "preview", "stage", "test", "tests", "harness", "loader", "check"]);
const SERVICE_DIRS = new Set(["work-tmp", "hub-plugins", "temp", "tmp"]);
export function isService(f) {
  if (!f) return false;
  const project = projectOf(f.path);
  if (project) return rawWords(project).some((w) => SERVICE_WORDS.has(w));
  const parts = dirKey(f.path).split("/").filter(Boolean).map((x) => x.toLowerCase());
  const file = parts.pop() || "";
  if (/\.(?:svg|ico)$/.test(file) || parts.some((x) => SERVICE_DIRS.has(x))) return true;
  return [file.replace(/\.[^.]+$/, ""), parts[parts.length - 1] || ""].some((x) => rawWords(x).some((w) => SERVICE_WORDS.has(w)));
}
// the designer is the session of that name (and the lanes of its hand edits: designer-2, hd-edits-1); so is whoever saved the design into a project folder (design/<project>/)
export const isDesigner = (f) => /^(?:designer|hd-edits)(?:-\d+)?$/i.test(String((f && f.session) || "")) || !!(f && projectOf(f.path));
// the top folder of a design: its direction, else the service folder, else the tile of its own task. The tile of a task that holds one design only is not
// a folder (see layoutOf): that design goes to the designer's folder, or lies loose ("")
export const topKeyOf = (f, dirs = [], taskRows = []) => homeOf(f, dirs, taskRows) || (isService(f) ? SERVICE_KEY : placeKeyOf(f, taskRows));
// the layout of the dashboard over all the designs (a search or a tab does not change it): the top folder of each design is its direction, else the tile of its own task;
// a folder of a project on disk (<home>/design/<project>/) makes a subfolder inside a direction when the direction holds several designs of it: the place on disk, not the task id
// (one task makes several folders, one folder holds the designs of several tasks). A design with no project folder lies loose.
// A design in no project folder joins a family subfolder: the designs of one folder whose names differ by the variant and the round only ("kind:<folder>|<family>").
// returns {top: Map(path -> direction folder), sub: Map(path -> "proj:<project>" | "kind:<folder>|<family>"), names: Map(sub key -> the name of the subfolder)}
export function layoutOf(files = [], dirs = [], taskRows = [], min = TASK_MIN) {
  const top = new Map(), n = new Map(), named = new Map(), fam = new Map(), famOf = new Map(), famTitle = new Map(), own = new Set(dirs.map((d) => d.key));
  for (const f of files) {
    if (!f) continue;
    const k = topKeyOf(f, dirs, taskRows), project = projectOf(f.path);
    top.set(f.path, k);
    if (project && !isNameKey(k)) n.set(k + "|" + project, (n.get(k + "|" + project) || 0) + 1);
    if (isNameKey(k)) named.set(k, (named.get(k) || 0) + 1);
    const fm = !project && own.has(k) ? familyOf(f.path) : null;
    if (fm) {
      const id = k + "|" + fm.dir + "|" + fm.slug.toLowerCase();
      famOf.set(f.path, { id, slug: fm.slug });
      fam.set(id, (fam.get(id) || 0) + 1);
      const last = Number(f.last || f.ts) || 0, title = familyTitle(f.title);   // the name of the family is the title of its newest design
      if (title && (!famTitle.has(id) || last > famTitle.get(id).last)) famTitle.set(id, { last, title });
    }
  }
  // a tile of a task needs several designs; one design alone is the designer's (the designer's folder) or lies loose among the folders ("")
  for (const f of files) {
    const k = f && top.get(f.path);
    if (isNameKey(k) && named.get(k) < min) top.set(f.path, isDesigner(f) ? DESIGNER_KEY : "");
  }
  const sub = new Map();
  const names = new Map();
  for (const f of files) {
    const project = f && projectOf(f.path), fm = f && famOf.get(f.path);
    if (fm && fam.get(fm.id) >= min) {
      const key = KIND_PREFIX + fm.id.split("|").slice(1).join("|");
      sub.set(f.path, key);
      if (!names.has(key)) names.set(key, (famTitle.get(fm.id) || {}).title || readableSlug(fm.slug));
      continue;
    }
    if (!project || !(n.get(top.get(f.path) + "|" + project) >= min)) continue;
    sub.set(f.path, PROJECT_PREFIX + project);
    if (!names.has(PROJECT_PREFIX + project)) names.set(PROJECT_PREFIX + project, readableSlug(project));
  }
  return { top, sub, names };
}
// A design lies in the folder of the direction by the first rule that fits: the file is inside the cwd of the direction; the direction itself made it (its session is the author);
// the direction asked for the task the design was made for, or the hub named it raising the task (taskRows: [{id, by, dir, who}] of the registry). Nothing fits - "" (no direction).
// Last rule: the design lies in a folder named for a project (<home>/design/<project>/file.html, how the designer saves) - the direction whose name says the same;
// else the words of the title and of the file name. The list of directions is the one of the snapshot, nothing is hard-coded.
const homeByName = (dirs, name) => (name && (dirs.find((d) => d.names && d.names.includes(name)) || {}).key) || "";
const taskHome = (t, dirs) => (t ? homeByName(dirs, t.by) || homeByName(dirs, t.dir) || homeByName(dirs, t.who) : "");
export function homeOf(f, dirs = [], taskRows = []) {
  const at = dirsAt(f.path, dirs);
  if (at.length === 1) return at[0].key;
  const task = f.task ? (taskRows || []).find((x) => x.id === f.task) : null;
  const member = at.length > 1 ? memberOf(f, at, task) : "";
  return member || homeByName(dirs, f.session) || taskHome(task, dirs) || projectDirOf(f, dirs, taskRows);
}
// several directions share the cwd the file lies in: the one that made it, else the one that asked for its task, else the one a folder on the way to the file is named for
// (<cwd>/rewarded-ads/Black Friday 2026/file.html); none of them - "" (the other rules go on)
function memberOf(f, at, task) {
  const by = (n) => homeByName(at, n);
  const hit = by(f.session) || (task ? by(task.by) || by(task.dir) || by(task.who) : "");
  if (hit) return hit;
  const rel = dirKey(f.path).slice(rootOf(at[0]).length + 1).split("/").slice(0, -1);
  for (const seg of rel) { const k = nearestDir(seg, at); if (k) return k; }
  return "";
}
// the words of a name: lower case, letters and digits, three signs and more (a lone "b" or "a" is a label, not a word), without the words every design folder has
const COMMON = new Set(["design", "designs", "template", "templates", "page", "pages", "index", "html", "v1", "v2", "v3", "hub", "icons8"]);
export const wordsOf = (s) => String(s || "").normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !COMMON.has(w));
// the project name in <...>/design/<project>/<file>: the folder right under "design" (a file lying right in "design" has none)
export function projectOf(path) {
  const parts = dirKey(path).split("/").filter(Boolean);
  const i = parts.lastIndexOf("design");
  return i >= 0 && i < parts.length - 2 ? parts[i + 1] : "";
}
// a word of the name and a word of a direction: the same word (100), or one is the beginning of the other, four signs at least ("anim" - "animations"): 60
const STEM_MIN = 4;
const near = (a, b) => (a === b ? 100 : a.length >= STEM_MIN && b.length >= STEM_MIN && !/\d/.test(a + b) && (a.startsWith(b) || b.startsWith(a)) ? 60 : 0);
// "hd" and "hub" are the hub's own sign: a design called hd-spacing or hub-recap (a lone "hub" is not enough) is about the hub - it belongs to a direction that says "hub" in its name, to none else
const rawWords = (s) => String(s || "").normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const HUBBY = new Set(["hd", "hub"]);
const saysHub = (s) => rawWords(s).some((w) => HUBBY.has(w));
const hubby = (s) => saysHub(s) && rawWords(s).length > 1;   // "hub" alone says nothing
// the direction a name belongs to: its words are the words of the direction's name (or begin the same way), more shared words win, fewer foreign words next;
// two directions equally near - nothing (no guessing). Names of a direction: its sessions, its label, its folder name.
// A name with "hd" or "hub" is looked for among the directions with "hub" in their names only.
export function nearestDir(name, dirs = []) {
  const w = [...new Set(wordsOf(name))];
  const hub = hubby(name);
  if (!w.length && !hub) return "";
  const names = (d) => [...(d.names || []), d.label, ...(d.shared ? [] : [lastPart(rootOf(d))])];
  let best = null, tie = false;
  for (const d of dirs) {
    if (hub && !names(d).some(saysHub)) continue;
    const own = [...new Set(names(d).flatMap(wordsOf))];
    let points = 0, hit = 0;
    const used = new Set();
    for (const x of w) {
      let top = 0, at = "";
      for (const o of own) { const n = near(x, o); if (n > top) { top = n; at = o; } }
      if (top) { points += top; hit++; used.add(at); }
    }
    if (!hit && !hub) continue;
    // hub names with no other word to compare (hd-motion against "hub-design"): the hub direction itself is the answer
    const score = points - (own.length - used.size) - (w.length - hit);   // more shared words first, then fewer foreign words
    if (!best || score > best.score) { best = { key: d.key, score }; tie = false; } else if (score === best.score && best.key !== d.key) tie = true;
  }
  return best && !tie ? best.key : "";
}
// a name that no direction owns but a task does ("ouch-templates" - "Rewarded-ads Ouch, beat 8"): the words of the name against the titles of the tasks;
// the direction that asked for the nearest tasks - its folder; two directions equally near or nothing in common - ""
export function taskNear(name, taskRows = [], dirs = []) {
  const w = [...new Set(wordsOf(name))];
  const by = new Map();
  for (const t of taskRows || []) {
    const home = taskHome(t, dirs);
    if (!home) continue;
    const own = [...new Set(wordsOf(t.title))];
    const points = w.reduce((s, x) => s + Math.max(0, ...own.map((o) => near(x, o))), 0);
    if (points > (by.get(home) || 0)) by.set(home, points);
  }
  let best = "", top = 0, tie = false;
  for (const [home, points] of by) { if (points > top) { best = home; top = points; tie = false; } else if (points === top) tie = true; }
  return top && !tie ? best : "";
}
export function projectDirOf(f, dirs = [], taskRows = []) {
  // a design lying in a project folder is judged by the name of that folder only: the words of its title are no place on disk
  const project = projectOf(f.path);
  if (project) return nearestDir(project, dirs) || taskNear(project, taskRows, dirs);
  const file = String(f.path || "").split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  return nearestDir(f.title, dirs) || nearestDir(file, dirs) || taskNear(f.title, taskRows, dirs) || taskNear(file, taskRows, dirs);
}
// the name of a task folder: the title of the task (tasks: [{id, title}]); the same name for the folder on disk
export const taskTitle = (id, tasks = []) => String(((tasks || []).find((x) => x.id === id) || {}).title || "").trim() || id;
// the name of a task tile on the dashboard: the title cut where a path or a long tail begins ("Ouch, beat 8: D:/work/..." -> "Ouch, beat 8")
export const SHORT_MAX = 48;
const TAIL = /[:\u2014\u2013]\s*(?:[A-Za-z]:[\\/]|[\\/~])|\s[A-Za-z]:[\\/]|\s\/\S/;
export function shortTitle(title) {
  let x = String(title || "").replace(/\s+/g, " ").trim();
  const cut = x.search(TAIL);
  if (cut > 0) x = x.slice(0, cut).trim();
  x = x.replace(/[\s,;:.\u2014\u2013-]+$/, "");
  if (x.length <= SHORT_MAX) return x;
  const at = x.lastIndexOf(" ", SHORT_MAX);
  return (at > SHORT_MAX / 2 ? x.slice(0, at) : x.slice(0, SHORT_MAX)).replace(/[\s,;:.\u2014\u2013-]+$/, "") + "\u2026";
}
// a short Latin name of a task folder: "Постер к Чёрной пятнице" -> "poster-chernoy-pyatnitse" (the same as slug() of layout.py)
export const SLUG_MAX = 32, SLUG_WORDS = 4;
const SLUG_STOP = new Set(["the", "a", "an", "of", "for", "to", "in", "on", "and", "with", "v", "i", "na", "po", "dlya", "s", "k", "iz", "ot", "do", "za", "kak", "eto"]);
const SLUG_TR = { "\u0430": "a", "\u0431": "b", "\u0432": "v", "\u0433": "g", "\u0434": "d", "\u0435": "e", "\u0451": "e", "\u0437": "z", "\u0438": "i", "\u0439": "y", "\u043a": "k", "\u043b": "l", "\u043c": "m", "\u043d": "n", "\u043e": "o", "\u043f": "p", "\u0440": "r", "\u0441": "s", "\u0442": "t", "\u0443": "u", "\u0444": "f", "\u0445": "h", "\u044a": "", "\u044b": "y", "\u044c": "", "\u044d": "e", "\u0436": "zh", "\u0446": "ts", "\u0447": "ch", "\u0448": "sh", "\u0449": "sch", "\u044e": "yu", "\u044f": "ya" };
export function taskSlug(title) {
  const low = [...String(title || "").toLowerCase()].map((c) => (c in SLUG_TR ? SLUG_TR[c] : c)).join("");
  const parts = (low.match(/[a-z0-9]+/g) || []).filter((w) => !SLUG_STOP.has(w)).slice(0, SLUG_WORDS);
  let out = "";
  for (const w of parts) { const nxt = out ? out + "-" + w : w; if (nxt.length > SLUG_MAX) break; out = nxt; }
  return out || (parts[0] || "").slice(0, SLUG_MAX);
}
// files by top folder; a folder holds its files in the order they came in (the caller sorts). Folders: the newest design first.
// lay: layoutOf() of all the designs; without it the folders of the given files only
export function groupFiles(files = [], dirs = [], taskRows = [], lay = null) {
  const top = (lay || layoutOf(files, dirs, taskRows)).top;
  const by = new Map();
  for (const f of files) {
    const key = top.has(f.path) ? top.get(f.path) : topKeyOf(f, dirs, taskRows);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(f);
  }
  const last = (rows) => Math.max(0, ...rows.map((f) => Number(f.last || f.ts) || 0));
  return [...by.entries()].map(([key, rows]) => ({ key, files: rows, dir: dirs.find((d) => d.key === key) || null, last: last(rows) }))
    .sort((a, b) => b.last - a.last);
}
// the subfolders (projects and families) inside one folder: [{key: "proj:<project>" | "kind:<folder>|<family>", files, last}], the newest first; loose - the designs that lie in no subfolder
export function subGroups(files = [], lay) {
  const by = new Map(), loose = [];
  for (const f of files) {
    const k = lay.sub.get(f.path);
    if (!k) { loose.push(f); continue; }
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(f);
  }
  const last = (rows) => Math.max(0, ...rows.map((f) => Number(f.last || f.ts) || 0));
  return { subs: [...by.entries()].map(([key, rows]) => ({ key, files: rows, last: last(rows) })).sort((a, b) => b.last - a.last), loose };
}
// the cwd of the direction a session is (nothing for the hub, specialists, executors, an unknown name): new designs go into <cwd>/design
export function saveDirOf(name, sessions = [], directions = []) {
  if (!name) return "";
  const d = directionDirs(sessions, directions).find((x) => x.names.includes(name));
  return d ? d.cwd : "";
}
// the dashboard folder of a direction (its key: the cwd, or cwd#name when several directions share the cwd); "" - none
export function dirKeyOf(name, sessions = [], directions = []) {
  if (!name) return "";
  const d = directionDirs(sessions, directions).find((x) => x.names.includes(name));
  return d ? d.key : "";
}
const sepOf = (p) => (/\\/.test(p) && !p.includes("/") ? "\\" : "/");
// the folder of a task on disk: <the direction that asked>/design/<slug>/; no direction - <the designer's folder>/<slug>/
export function taskDir(cwd, title, home = "") {
  return slugDir(cwd, taskSlug(title) || "task", home);
}
// the folder of a project: <the direction>/design/<project>/; no direction - <the designer's folder>/<project>/
export function projectDir(cwd, project, home = "") {
  return project ? slugDir(cwd, project, home) : "";
}
function slugDir(cwd, name, home) {
  const root = cwd || home;
  if (!root) return "";
  const sep = sepOf(root);
  return String(root).replace(/[\\/]+$/, "") + sep + (cwd ? "design" + sep : "") + name + sep;
}
// the task folder of a design: <task>/<design>/index.html -> <task>/; a loose <task>/x.html -> <task>/
export function placeOf(path) {
  const p = String(path || "");
  const sep = sepOf(p), parts = p.split(/[\\/]/);
  if (parts.length < 2) return "";
  const up = /^index\.html?$/i.test(parts[parts.length - 1]) && parts.length > 2 ? 2 : 1;
  return parts.slice(0, -up).join(sep) + sep;
}
// the line for the designer: where to put the new design (a task folder - the folder of the task)
export function taskLine(dir) {
  return dir ? tr("save_task", { dir }) : "";
}
// a design moved to its task folder by layout.py (moves = /__canvas/moves: {files: {key: new}, dirs: {key: new}}): its new path, or the path itself
const moveKey = (p) => { const k = String(p).trim().replace(/\\/g, "/").replace(/\/+$/, ""); return /^[A-Za-z]:\//.test(k) ? k.toLowerCase() : k; };
export function movedPath(p, moves) {
  if (typeof p !== "string" || !p || !moves) return p;
  const k = moveKey(p), files = moves.files || {}, dirs = moves.dirs || {};
  if (Object.hasOwn(files, k)) return files[k];
  for (const [old, now] of Object.entries(dirs)) if (k.startsWith(old + "/")) return now + k.slice(old.length);
  return p;
}
// the board, the known designs, any stored object: every string and key that is a moved path gets the new one. -> [the object, changed]
export function moveAll(x, moves) {
  let changed = false;
  const walk = (v) => {
    if (typeof v === "string") { const n = movedPath(v, moves); if (n !== v) changed = true; return n; }
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const out = {};
    for (const [k, val] of Object.entries(v)) { const nk = movedPath(k, moves); if (nk !== k) changed = true; out[nk] = walk(val); }
    return out;
  };
  const out = walk(x);
  return [out, changed];
}
// the line for the designer: where to put the new design (a direction: <cwd>/design/<task>/; none - <the designer's folder>/<task>/)
export function saveLine(cwd, home = "") {
  if (cwd) return tr("save_to", { dir: String(cwd).replace(/[\\/]+$/, "") + sepOf(cwd) + "design" });
  return home ? tr("save_home", { dir: String(home).replace(/[\\/]+$/, "") + sepOf(home) }) : "";
}

// who gets the edits of the open design: its author; no author (the path was only mentioned) - the designer if the hub has one, not the session we came from
export const whoGets = (author, current, ok, dflt = "designer") => author || (ok && ok.has(dflt) ? dflt : current);
// where the manual edits of a design go by themselves: to its author whoever the chat at the bottom is with (the chat is a talk, the edits are the author's work)
export const editsTo = (file, authorOf, current, ok, dflt = "designer") => whoGets(file ? authorOf(file) : "", current, ok, dflt);

// the canvas button theme: tool -> the script mode in the design
export const TOOLS = { select: "edit", hand: "view", text: "text", note: "view", comment: "comment", pencil: "draw", shape: "draw" };
export const toolMode = (tool) => TOOLS[tool] || "view";

// quick colors of the style panel
// the ink that reads on a color: dark on light, white on dark (for the chip that shows a text color)
export function inkOn(color) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(color || ""));
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0b0b0b" : "#ffffff";
}
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
    || (it.kind === "file" && isHtml(fileOf(it))) || (it.kind === "out" && htmlPaths(it.text).length))
    .map((it) => ({ kind: it.kind, name: it.name, ts: it.ts, path: it.kind === "file" ? fileOf(it) : it.path, input: it.input && { file_path: (it.input.file_path || it.input.path) },
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
  { name: "writer", need: "required", get title() { return tr("t_writer"); } },
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
// what the canvas and the dashboard show: html, pdf, svg - never a text file (an .md the owner once opened or a session once named stays out of every list, even from older saved data)
export const isCanvasFile = (path) => /\.(?:html?|pdf|svg)$/i.test(String(path || ""));
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
  en: { by: "Hub Design", hide: "Collapse", show: "Expand", share: "Copy link", copied: "Link copied", open: "Open in Hub Design", hd: "Hub Design", open_file: "Open", open_file_title: "Open the file", hide_title: "Collapse the card into one line", show_title: "Expand the card", design: "design", video: "video", pdf: "PDF", svg: "SVG", gone: "file unavailable" },
  ru: { by: "Hub Design", hide: "Свернуть", show: "Развернуть", share: "Скопировать ссылку", copied: "Ссылка скопирована", open: "Открыть в Hub Design", hd: "Hub Design", open_file: "Открыть", open_file_title: "Открыть файл", hide_title: "Свернуть карточку в строку", show_title: "Развернуть карточку", design: "макет", video: "видео", pdf: "PDF", svg: "SVG", gone: "файл недоступен" },
};
export const cardText = (lang) => CARD_STR[String(lang || "").slice(0, 2)] || CARD_STR.en;

// a wait for the design of a session (after a handoff from its chat): fresh for FROM_TTL seconds; a stale or empty one - null
export const FROM_TTL = 180;
export const waitFresh = (w, now) => (w && now - w.ts <= FROM_TTL ? w : null);

// a handoff from a session chat with an empty input opens the dashboard; with text - the chat with the specialist (and the session's last design)
export const handoffHome = (h) => !String((h && h.text) || "").trim();
