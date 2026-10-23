// Hub Design: the "Download styles" tab of the hub settings. Paste links to a style site, press "Download": the process of the plugin
// (fetcher.py) saves the styles into the local library, the "Style" window sees them at once. All the work is in the process;
// the page only starts, stops and shows the run (GET /__canvas/fetch once a second while a run is on).
import { makeT } from "./i18n.js";

export const LINKS_MAX = 20;      // the same as fetcher.LINKS_MAX
export const STORE_KEY = "hub-design:fetch-links";
export const POLL_MS = 1000;

export const STR = {
  en: {
    title: "Hub Design: styles",
    lead: "Download style references (DESIGN.md and a preview each) into the local library. Paste a link, press Download. The link may be a whole site, a collection or a single style.",
    links: "Links", ph: "https://… (one link per line)",
    hosts: "Supported sites: {hosts}",
    go: "Download", stop: "Stop", stopping: "Stopping…",
    count: "In the library: {n}",
    prog: "{done} of {total}", counts: "added {added}, skipped {skipped}, failed {failed}",
    now: "Now: {name}",
    s_done: "Done. Added {added}, skipped as already downloaded {skipped}, failed {failed}.",
    s_stopped: "Stopped. Added {added}, skipped {skipped}, failed {failed}. Press Download to continue: what is saved is skipped.",
    e_no_links: "Paste at least one link.",
    e_too_many: "At most {max} links at once.",
    e_bad_link: "This is not a link: {link}",
    e_no_source: "No parser for this site yet: {link}. Supported: {hosts}.",
    e_busy: "A download is already running.",
    e_no_styles: "No styles found at this link.",
    e_forbidden: "The site refused (HTTP {http}). Stopped; try again later and not too often.",
    e_rate: "The site asks to slow down (HTTP {http}). Stopped; try again in an hour or so.",
    e_captcha: "The site asks for a captcha. Stopped; open it in a browser once, then try again later.",
    e_network: "No connection to the site. Stopped; press Download to continue from the same place.",
    e_site_changed: "The site pages look different from what the parser knows. Stopped; the parser needs an update.",
    e_index_broken: "The library index (index.json) is damaged and was left untouched. Fix or remove it, then try again.",
    e_disk: "Could not write to the library folder. Check the free space and the access rights.",
    e_internal: "The download failed unexpectedly. Press Download to continue.",
    e_page: "The plugin process does not answer. Open Hub Design once, or restart the plugin.",
    e_local: "Downloading works only on the machine where the hub runs (the page is opened by localhost).",
    terms: "You are responsible for the terms of the site you download from. Go slowly, do not publish what you download.",
  },
  ru: {
    title: "Hub Design: стили",
    lead: "Качает референсы стилей (DESIGN.md и превью) в локальную библиотеку. Вставь ссылку и нажми «Скачать». Ссылка может вести на весь сайт, на подборку или на один стиль.",
    links: "Ссылки", ph: "https://… (по ссылке в строке)",
    hosts: "Поддерживаются сайты: {hosts}",
    go: "Скачать", stop: "Стоп", stopping: "Останавливаю…",
    count: "В библиотеке: {n}",
    prog: "{done} из {total}", counts: "добавлено {added}, пропущено {skipped}, с ошибкой {failed}",
    now: "Сейчас: {name}",
    s_done: "Готово. Добавлено {added}, пропущено как уже скачанные {skipped}, с ошибкой {failed}.",
    s_stopped: "Остановлено. Добавлено {added}, пропущено {skipped}, с ошибкой {failed}. «Скачать» продолжит: сохранённое пропускается.",
    e_no_links: "Вставь хотя бы одну ссылку.",
    e_too_many: "Не больше {max} ссылок за раз.",
    e_bad_link: "Это не ссылка: {link}",
    e_no_source: "Для этого сайта пока нет разборщика: {link}. Поддерживаются: {hosts}.",
    e_busy: "Скачивание уже идёт.",
    e_no_styles: "По этой ссылке стилей не нашлось.",
    e_forbidden: "Сайт отказал (HTTP {http}). Остановлено; попробуй позже и не слишком часто.",
    e_rate: "Сайт просит помедленнее (HTTP {http}). Остановлено; попробуй через час-другой.",
    e_captcha: "Сайт просит капчу. Остановлено; открой его в браузере один раз, потом попробуй позже.",
    e_network: "Нет связи с сайтом. Остановлено; «Скачать» продолжит с того же места.",
    e_site_changed: "Страницы сайта не такие, как знает разборщик. Остановлено; разборщик надо обновить.",
    e_index_broken: "Индекс библиотеки (index.json) повреждён, его не тронули. Почини или удали его и повтори.",
    e_disk: "Не получилось записать в папку библиотеки. Проверь место на диске и права.",
    e_internal: "Скачивание сорвалось неожиданно. «Скачать» продолжит.",
    e_page: "Процесс плагина не отвечает. Открой Hub Design один раз или перезапусти плагин.",
    e_local: "Скачивание работает только на машине, где запущен хаб (страница открыта по localhost).",
    terms: "За условия сайта, с которого качаешь, отвечаешь ты. Не торопись и не публикуй скачанное.",
  },
};

export const t = makeT(STR);

// the pasted text -> the links: separated by spaces, commas or lines, no repeats, no empty
export function parseLinks(text) {
  const out = [];
  for (const x of String(text || "").split(/[\s,;]+/)) if (x && !out.includes(x)) out.push(x);
  return out;
}

const RUNNING = ["running", "stopping"];
export const isRunning = (st) => !!st && RUNNING.includes(st.state);

// 0..100 for the bar; before the plan is known (total 0) the bar is empty
export const percent = (st) => (st && st.total > 0 ? Math.max(0, Math.min(100, Math.round((100 * st.done) / st.total))) : 0);

// the word for a code of a refusal or a stop: from the status of the run or from the answer to a refused start
export function problem(st) {
  const code = st && (st.error || (["blocked", "error"].includes(st.state) ? st.code : ""));
  if (!code) return "";
  const key = "e_" + code;
  if (!(key in STR.en)) return t("e_internal");
  return t(key, { http: st.http || "", link: st.link || "", max: LINKS_MAX, hosts: (st.hosts || []).join(", ") });
}

// the line under the buttons: how the run ended (an error is shown by problem())
export function summary(st) {
  if (!st) return "";
  const v = { added: st.added || 0, skipped: st.skipped || 0, failed: st.failed || 0 };
  if (st.state === "done") return t("s_done", v);
  if (st.state === "stopped") return t("s_stopped", v);
  return "";
}

export function createFetchUi({ hub, base, local = () => true, onAdded = () => {}, store = globalThis.localStorage }) {
  const el = hub.el;
  const S = { st: null, count: null, err: "", timer: 0, busy: false, added: 0, off: false, tried: 0 };
  const ta = el("textarea", "hdf-links");
  ta.rows = 3;
  ta.spellcheck = false;
  ta.value = (store && store.getItem(STORE_KEY)) || "";
  ta.addEventListener("input", () => { if (store) store.setItem(STORE_KEY, ta.value); });
  const go = el("button", "hdf-go btn");
  go.type = "button";
  const stop = el("button", "hdf-stop btn quiet");
  stop.type = "button";
  const lead = el("p", "hdf-lead");
  const lab = el("label", "hdf-lab");
  const hosts = el("div", "hdf-hosts");
  const cnt = el("div", "hdf-count");
  const bar = el("div", "hdf-bar");
  const fill = el("div", "hdf-fill");
  bar.append(fill);
  bar.setAttribute("role", "progressbar");
  const prog = el("div", "hdf-prog");
  const now = el("div", "hdf-now");
  const msg = el("div", "hdf-msg");
  msg.setAttribute("role", "status");
  const terms = el("p", "hdf-terms");
  const row = el("div", "hdf-row");
  row.append(go, stop);
  const box = el("div", "hdf");
  box.append(lead, lab, ta, hosts, row, bar, prog, now, msg, cnt, terms);

  const call = async (method, body) => {
    const res = await fetch(`${base()}/__canvas/fetch`, {
      method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, data };
  };

  function paint() {
    const st = S.st;
    const run = isRunning(st);
    lead.textContent = t("lead");
    lab.textContent = t("links");
    ta.placeholder = t("ph");
    ta.disabled = run;
    terms.textContent = t("terms");
    go.textContent = t("go");
    go.disabled = run || S.busy || S.off;
    stop.textContent = st && st.state === "stopping" ? t("stopping") : t("stop");
    stop.hidden = !run;
    stop.disabled = !st || st.state === "stopping";
    const hs = (st && st.hosts) || [];
    hosts.textContent = hs.length ? t("hosts", { hosts: hs.join(", ") }) : "";
    cnt.textContent = S.count == null ? "" : t("count", { n: S.count });
    const show = !!st && (run || st.total > 0);
    bar.hidden = prog.hidden = !show;
    fill.style.width = percent(st) + "%";
    bar.setAttribute("aria-valuenow", String(percent(st)));
    prog.textContent = show ? `${t("prog", { done: st.done, total: st.total })} · ${t("counts", { added: st.added, skipped: st.skipped, failed: st.failed })}` : "";
    now.textContent = run && st.name ? t("now", { name: st.name }) : "";
    const bad = S.off ? t("e_local") : S.err || problem(st);
    msg.textContent = bad || (run ? "" : summary(st));
    msg.classList.toggle("bad", !!bad);
  }

  // the status arrived: the "Style" window is told about new styles (during a run too, so they appear while it goes)
  function take(st) {
    if (!st || typeof st !== "object") return;
    const was = S.st;
    S.st = st;
    if (typeof st.count === "number") S.count = st.count;
    const grew = (st.added || 0) > S.added || (was && isRunning(was) && !isRunning(st) && (st.added || 0) > 0);
    S.added = st.added || 0;
    if (grew) onAdded();
    if (isRunning(st)) schedule();
    paint();
  }

  const schedule = () => { clearTimeout(S.timer); S.timer = setTimeout(poll, POLL_MS); };

  async function poll() {
    clearTimeout(S.timer);
    try {
      const r = await call("GET");
      if (r.ok) { S.err = ""; return take(r.data); }
      S.err = t("e_page");
    } catch { S.err = t("e_page"); }
    paint();
    if (isRunning(S.st)) schedule();
  }

  go.addEventListener("click", async () => {
    const urls = parseLinks(ta.value);
    S.err = "";
    S.busy = true;
    paint();
    try {
      const r = await call("POST", { action: "start", urls });
      if (r.data && r.data.error && r.data.error !== "body") {
        S.err = problem({ error: r.data.error, link: r.data.link, hosts: r.data.hosts, http: r.data.http });
        if (r.data.error === "busy") take(r.data);
      } else if (r.ok) {
        S.added = 0;
        take({ ...r.data, added: r.data.added || 0 });
      } else S.err = t("e_internal");
    } catch { S.err = t("e_page"); }
    S.busy = false;
    paint();
  });
  stop.addEventListener("click", async () => {
    try { take((await call("POST", { action: "stop" })).data); } catch { S.err = t("e_page"); paint(); }
  });

  return {
    node: box,
    // called with every snapshot of the hub: draws, and on the first call (or after a return to the tab) asks for the status
    render(root) {
      if (!root.contains(box)) root.replaceChildren(box);
      S.off = !local();
      paint();
      // the first call asks for the status; a silent process is asked again, but not oftener than every 5 s
      if (!S.off && !S.st && Date.now() - S.tried > 5000) { S.tried = Date.now(); poll(); }
    },
    state: S,
    poll,
  };
}
