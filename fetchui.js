// Hub Design: the "Download styles" tab of the hub settings. The links to the style sites are a list of fields (a new empty one appears when
// one is filled); the plugin process remembers them (linkctl.py), press "Download": it saves the styles into the local library, the "Style"
// window sees them at once. Deleting a link takes its styles from the disk (after the owner saw the number). All the work is in the process;
// the page only asks and shows (GET /__canvas/fetch once a second while a run is on).
import { currentLang, makeT } from "./i18n.js";

export const LINKS_MAX = 20;      // the same as fetcher.LINKS_MAX
export const STORE_KEY = "hub-design:fetch-links";   // the links were kept in the browser before; taken into the plugin once
export const POLL_MS = 1000;

export const STR = {
  en: {
    title: "Hub Design: styles",
    lead: "Download style references (DESIGN.md and a preview each) into the local library. Add links below: a whole site, a collection or a single style. Fill one field and a new empty one appears.",
    links: "Links", ph: "https://… (link)",
    n_one: "{n} style", n_few: "{n} styles", n_many: "{n} styles",
    del: "Delete the link and its styles",
    del_q: "Delete this link and remove {styles} from the disk?", del_kept: "{kept} stay: they came by another link too.",
    del_yes: "Delete", del_no: "Cancel", deleted: "Deleted: {styles}.",
    auto: "Download the links above by default when Hub Design is turned on",
    np_q: "{styles} without a preview. Ask a designer to make previews?", np_give: "Give the task", np_no: "Not needed",
    np_sent: "The task is with the designer: {styles}.",
    np_task: "Please make previews for {styles} of the Hub Design style library. The list with the paths is in {path}: for each style save a picture of its design (about 1280×800, png, jpg or webp) to the path from preview_to (the folder is {dir}). Hub Design picks the pictures up by itself. Do not change the .md files.",
    e_np_send: "Could not send the task to the designer: {err}",
    hosts: "Supported sites: {hosts}",
    go: "Download", stop: "Stop", stopping: "Stopping…",
    count: "In the library: {n}",
    prog: "{done} of {total}", counts: "added {added}, skipped {skipped}, failed {failed}", covers: "covers {n}",
    now: "Now: {name}",
    s_done: "Done. Added {added}, skipped as already downloaded {skipped}, failed {failed}.",
    s_stopped: "Stopped. Added {added}, skipped {skipped}, failed {failed}. Press Download to continue: what is saved is skipped.",
    e_no_links: "Add at least one link.",
    e_too_many: "At most {max} links at once.",
    e_bad_link: "This is not a link: {link}",
    e_no_source: "No parser for this site yet: {link}. Supported: {hosts}.",
    e_busy: "A download is already running.",
    e_no_styles: "No styles found at this link.",
    e_no_link: "This link is no longer in the list.",
    e_github_repo: "A link to a repository is needed: github.com/owner/name.",
    e_github_unknown: "There is no parser for the repository {repo} yet.",
    e_github_layout: "The repository {repo} has changed its layout and the parser no longer reads it.",
    e_no_git: "Git is needed to download a repository, and it was not found on this computer.",
    e_clone_failed: "Could not download the repository {repo}. Check the connection and try again.",
    e_forbidden: "The site refused (HTTP {http}). Stopped. Try again later, and not too often.",
    e_rate: "The site asks to slow down (HTTP {http}). Stopped. Try again in an hour or so.",
    e_captcha: "The site asks for a captcha. Stopped. Open it in a browser once, then try again later.",
    e_network: "No connection to the site. Stopped. Press Download to continue from the same place.",
    e_site_changed: "The site's pages have changed and the parser no longer reads them. Stopped until the parser is updated.",
    e_index_broken: "The library index (index.json) is damaged and was left untouched. Fix or remove it, then try again.",
    e_disk: "Could not write to the library folder. Check the free space and the access rights.",
    e_internal: "The download failed unexpectedly. Press Download to continue.",
    e_page: "No answer from Hub Design. Open Hub Design once or restart the plugin.",
    e_local: "Downloading works only on the computer that runs the hub: open the hub via localhost.",
    terms: "You are responsible for the terms of the site you download from. Go slowly, do not publish what you download.",
  },
  ru: {
    title: "Hub Design: стили",
    lead: "Скачивает референсы стилей (DESIGN.md и превью) в локальную библиотеку. Добавьте ссылки ниже: на весь сайт, на подборку или на один стиль. Заполните поле, и появится новое пустое.",
    links: "Ссылки", ph: "https://… (ссылка)",
    n_one: "{n} стиль", n_few: "{n} стиля", n_many: "{n} стилей",
    del: "Удалить ссылку и её стили",
    del_q: "Удалить эту ссылку и стереть с диска {styles}?", del_kept: "Останутся {kept}: они пришли и по другой ссылке.",
    del_yes: "Удалить", del_no: "Отмена", deleted: "Удалено: {styles}.",
    auto: "Скачивать ссылки по умолчанию при включении Hub Design",
    np_q: "{styles} без превью. Дать дизайнеру задание сделать превью?", np_give: "Дать задание", np_no: "Не надо",
    np_sent: "Задание у дизайнера: {styles}.",
    np_task: "Сделайте, пожалуйста, превью для {styles} из библиотеки стилей Hub Design. Список с путями лежит в {path}: для каждого стиля сохраните картинку его дизайна (около 1280×800, png, jpg или webp) по пути из preview_to (папка {dir}). Hub Design подхватит картинки сам. Файлы .md не меняйте.",
    e_np_send: "Не получилось отправить задание дизайнеру: {err}",
    hosts: "Поддерживаются сайты: {hosts}",
    go: "Скачать", stop: "Стоп", stopping: "Останавливается…",
    count: "В библиотеке: {n}",
    prog: "{done} из {total}", counts: "добавлено {added}, пропущено {skipped}, с ошибкой {failed}", covers: "обложек {n}",
    now: "Сейчас: {name}",
    s_done: "Готово. Добавлено {added}, пропущено как уже скачанные {skipped}, с ошибкой {failed}.",
    s_stopped: "Остановлено. Добавлено {added}, пропущено {skipped}, с ошибкой {failed}. «Скачать» продолжит: сохранённое пропускается.",
    e_no_links: "Добавьте хотя бы одну ссылку.",
    e_too_many: "Не больше {max} ссылок за раз.",
    e_bad_link: "Это не ссылка: {link}",
    e_no_source: "Для этого сайта пока нет разборщика: {link}. Поддерживаются: {hosts}.",
    e_busy: "Скачивание уже идёт.",
    e_no_styles: "По этой ссылке стилей не нашлось.",
    e_no_link: "Этой ссылки уже нет в списке.",
    e_github_repo: "Нужна ссылка на репозиторий: github.com/владелец/имя.",
    e_github_unknown: "Для репозитория {repo} пока нет разборщика.",
    e_github_layout: "В репозитории {repo} изменилась структура, разборщик её не читает.",
    e_no_git: "Чтобы скачать репозиторий, нужен Git, а на этом компьютере его не нашлось.",
    e_clone_failed: "Не получилось скачать репозиторий {repo}. Проверьте связь и повторите.",
    e_forbidden: "Сайт отказал (HTTP {http}). Скачивание остановлено. Попробуйте позже и не слишком часто.",
    e_rate: "Сайт просит помедленнее (HTTP {http}). Скачивание остановлено. Попробуйте через час-другой.",
    e_captcha: "Сайт просит капчу. Скачивание остановлено. Откройте сайт в браузере один раз, потом попробуйте позже.",
    e_network: "Нет связи с сайтом. Скачивание остановлено, «Скачать» продолжит с того же места.",
    e_site_changed: "Страницы сайта изменились, разборщик их не читает. Скачивание остановлено до обновления разборщика.",
    e_index_broken: "Индекс библиотеки (index.json) повреждён, его не трогали. Исправьте или удалите его и повторите.",
    e_disk: "Не получилось записать в папку библиотеки. Проверьте место на диске и права доступа.",
    e_internal: "Скачивание прервалось. Нажмите «Скачать», чтобы продолжить.",
    e_page: "Нет ответа от Hub Design. Откройте Hub Design один раз или перезапустите плагин.",
    e_local: "Скачивание работает только на компьютере, где запущен хаб: откройте хаб по localhost.",
    terms: "За соблюдение условий сайта, с которого вы скачиваете, отвечаете вы. Скачивайте без спешки и не публикуйте скачанное.",
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
  return t(key, { http: st.http || "", link: st.link || "", repo: (st.args || {}).repo || "", max: LINKS_MAX, hosts: (st.hosts || []).join(", ") });
}

// the line under the buttons: how the run ended (an error is shown by problem())
export function summary(st) {
  if (!st) return "";
  const v = { added: st.added || 0, skipped: st.skipped || 0, failed: st.failed || 0 };
  if (st.state === "done") return t("s_done", v);
  if (st.state === "stopped") return t("s_stopped", v);
  return "";
}

// the number with its word: "5 styles"; Russian has three forms
export function styles(n) {
  const cat = new Intl.PluralRules(currentLang()).select(n);
  return t(cat === "one" ? "n_one" : cat === "few" ? "n_few" : "n_many", { n });
}

export function createFetchUi({ hub, base, local = () => true, onAdded = () => {}, ask = null, store = globalThis.localStorage }) {
  const el = hub.el;
  const S = { st: null, count: null, err: "", info: "", timer: 0, busy: false, added: 0, off: false, tried: 0, links: [], auto: true, np: { n: 0 }, confirm: null, drafts: [], sig: "", legacy: false };
  const go = el("button", "hdf-go btn");
  go.type = "button";
  const stop = el("button", "hdf-stop btn quiet");
  stop.type = "button";
  const lead = el("p", "hdf-lead");
  const lab = el("label", "hdf-lab");
  const lst = el("div", "hdf-list");
  const hosts = el("div", "hdf-hosts");
  const autoLab = el("label", "hdf-auto");
  const autoBox = el("input", "hdf-auto-box");
  autoBox.type = "checkbox";
  const autoText = el("span", "hdf-auto-text");
  autoLab.append(autoBox, autoText);
  const npBox = el("div", "hdf-np");
  const npQ = el("span", "hdf-np-q");
  const npGive = el("button", "hdf-np-give btn");
  npGive.type = "button";
  const npNo = el("button", "hdf-np-no btn quiet");
  npNo.type = "button";
  npBox.append(npQ, npGive, npNo);
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
  box.append(lead, lab, lst, hosts, autoLab, npBox, row, bar, prog, now, msg, cnt, terms);

  const call = async (method, body) => {
    const res = await fetch(`${base()}/__canvas/fetch`, {
      method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, data };
  };
  const fail = (data, link) => problem({ error: (data && data.error) || "internal", link: link || (data && data.link) || "" });

  // --- the fields: the links the plugin remembers, then the drafts (the last one is always empty) ---
  function newDraft() {
    const input = el("input", "hdf-field");
    input.type = "text";
    input.spellcheck = false;
    const d = { input, wrap: el("div", "hdf-link draft") };
    d.wrap.append(input);
    input.addEventListener("input", () => {
      if (input.value.trim() && S.drafts[S.drafts.length - 1] === d) { S.drafts.push(newDraft()); paint(); }
    });
    input.addEventListener("change", () => { commit(d); });
    input.addEventListener("keydown", (e) => { if (e && e.key === "Enter") commit(d); });
    return d;
  }
  S.drafts.push(newDraft());

  // a filled field becomes a saved link (the plugin keeps it); true when nothing is left in it
  async function commit(d) {
    const urls = parseLinks(d.input.value);
    if (!urls.length || d.busy) return true;
    d.busy = true;
    try {
      for (const u of urls) {
        const r = await call("POST", { action: "add", url: u });
        if (!r.ok) { S.err = fail(r.data, u); paint(); return false; }
      }
    } catch { S.err = t("e_page"); paint(); return false; } finally { d.busy = false; }
    S.drafts = S.drafts.filter((x) => x !== d);
    if (!S.drafts.length || S.drafts[S.drafts.length - 1].input.value.trim()) S.drafts.push(newDraft());
    S.err = "";
    await poll(true);
    return true;
  }

  async function del(url) {
    S.err = S.info = "";
    try {
      const r = await call("POST", { action: "delete_preview", url });
      if (!r.ok) { S.err = fail(r.data); return paint(); }
      if (!r.data.n) return doDelete(url);   // nothing on the disk: only the link goes
      S.confirm = { url, n: r.data.n, kept: r.data.kept || 0 };
    } catch { S.err = t("e_page"); }
    paint();
  }
  async function doDelete(url) {
    S.confirm = null;
    try {
      const r = await call("POST", { action: "delete", url });
      if (!r.ok) S.err = fail(r.data);
      else {
        S.info = r.data.n ? t("deleted", { styles: styles(r.data.n) }) : "";
        onAdded();   // the library changed: the "Style" window reads it again
      }
    } catch { S.err = t("e_page"); }
    await poll(true);
  }

  function linkRow(l, run) {
    const w = el("div", "hdf-link saved");
    const u = el("span", "hdf-url", l.url);
    u.title = l.url;
    w.append(u);
    if (S.confirm && S.confirm.url === l.url) {
      const q = el("span", "hdf-q", `${t("del_q", { styles: styles(S.confirm.n) })}${S.confirm.kept ? " " + t("del_kept", { kept: styles(S.confirm.kept) }) : ""}`);
      const yes = el("button", "hdf-yes btn", t("del_yes"));
      const no = el("button", "hdf-no btn quiet", t("del_no"));
      yes.type = no.type = "button";
      yes.addEventListener("click", () => doDelete(l.url));
      no.addEventListener("click", () => { S.confirm = null; paint(); });
      w.append(q, yes, no);
      return w;
    }
    const n = el("span", "hdf-n", styles(l.n || 0));
    const x = el("button", "hdf-del btn quiet", "✕");
    x.type = "button";
    x.disabled = run;
    x.title = t("del");
    x.setAttribute("aria-label", t("del"));
    x.addEventListener("click", () => del(l.url));
    w.append(n, x);
    return w;
  }

  function paint() {
    const st = S.st;
    const run = isRunning(st);
    lead.textContent = t("lead");
    lab.textContent = t("links");
    terms.textContent = t("terms");
    autoText.textContent = t("auto");
    autoBox.checked = !!S.auto;
    autoBox.disabled = S.off;
    // the list is built again only when it changed: a field that is typed in must not lose its focus
    const sig = JSON.stringify([currentLang(), run, S.links.map((l) => [l.url, l.n]), S.confirm, S.drafts.length, S.off]);
    if (sig !== S.sig) {
      S.sig = sig;
      for (const d of S.drafts) { d.input.placeholder = t("ph"); d.input.disabled = run || S.off; }
      lst.replaceChildren(...S.links.map((l) => linkRow(l, run)), ...S.drafts.map((d) => d.wrap));
    }
    const np = S.np && S.np.n > 0 && !run && !S.off;
    npBox.hidden = !np;
    npQ.textContent = np ? t("np_q", { styles: styles(S.np.n) }) : "";
    npGive.textContent = t("np_give");
    npNo.textContent = t("np_no");
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
    prog.textContent = show ? `${t("prog", { done: st.done, total: st.total })} · ${t("counts", { added: st.added, skipped: st.skipped, failed: st.failed })}${st.covers > 0 ? " · " + t("covers", { n: st.covers }) : ""}` : "";
    now.textContent = run && st.name ? t("now", { name: st.name }) : "";
    const bad = S.off ? t("e_local") : S.err || problem(st);
    msg.textContent = bad || (run ? "" : S.info || summary(st));
    msg.classList.toggle("bad", !!bad);
  }

  // the status arrived: the "Style" window is told about new styles (during a run too, so they appear while it goes)
  function take(st) {
    if (!st || typeof st !== "object") return;
    const was = S.st;
    S.st = st;
    if (typeof st.count === "number") S.count = st.count;
    if (Array.isArray(st.links)) S.links = st.links;   // the answer to a start has no links: the last ones stay
    if (typeof st.auto === "boolean") S.auto = st.auto;
    if (st.nopreview && typeof st.nopreview === "object") S.np = st.nopreview;
    const grew = (st.added || 0) > S.added || (was && isRunning(was) && !isRunning(st) && (st.added || 0) > 0);
    S.added = st.added || 0;
    if (grew) onAdded();
    if (isRunning(st)) schedule();
    paint();
  }

  const schedule = () => { clearTimeout(S.timer); S.timer = setTimeout(poll, POLL_MS); };

  // keep: after an action the word about its failure stays
  async function poll(keep) {
    clearTimeout(S.timer);
    try {
      const r = await call("GET");
      if (r.ok) { if (keep !== true) S.err = ""; take(r.data); return takeLegacy(); }
      S.err = t("e_page");
    } catch { S.err = t("e_page"); }
    paint();
    if (isRunning(S.st)) schedule();
  }

  // the links that an older version kept in the browser go into the plugin once
  async function takeLegacy() {
    if (S.legacy || !store) return;
    S.legacy = true;
    const old = store.getItem(STORE_KEY);
    if (!old) return;
    store.setItem(STORE_KEY, "");
    const first = S.drafts[0];
    first.input.value = old;
    await commit(first);
  }

  go.addEventListener("click", async () => {
    S.err = S.info = "";
    S.busy = true;
    paint();
    try {
      for (const d of [...S.drafts]) if (d.input.value.trim() && !(await commit(d))) { S.busy = false; return paint(); }
      const r = await call("POST", { action: "start", urls: S.links.map((l) => l.url) });
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
  autoBox.addEventListener("change", async () => {
    try { await call("POST", { action: "auto", on: !!autoBox.checked }); } catch { S.err = t("e_page"); }
    await poll(true);
  });
  // "Give the task": the list of the styles with no preview is written by the plugin, the task for the designer goes through the hub
  npGive.addEventListener("click", async () => {
    S.err = S.info = "";
    try {
      const r = await call("POST", { action: "nopreview", decline: false });
      if (!r.ok) S.err = t("e_internal");
      else {
        const text = t("np_task", { styles: styles(r.data.n), path: r.data.path, dir: r.data.dir });
        const sent = ask ? await ask(text) : { error: "no sender" };
        if (!sent || sent.error) S.err = t("e_np_send", { err: (sent && sent.error) || "" });
        else {
          await call("POST", { action: "decline" });   // asked once: the question does not come back for these
          S.info = t("np_sent", { styles: styles(r.data.n) });
        }
      }
    } catch { S.err = t("e_page"); }
    await poll(true);
  });
  npNo.addEventListener("click", async () => {
    try { await call("POST", { action: "decline" }); } catch { S.err = t("e_page"); }
    await poll(true);
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
    commit,
    del,
  };
}
