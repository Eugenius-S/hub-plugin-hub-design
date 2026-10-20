// Hub Design: ловец ошибок макета. Ставится первым в <head>, до скриптов дизайна, чтобы увидеть и то, что упало при загрузке.
// Ловит только window error и unhandledrejection (не console.error: там шум); agent.js потом берёт список и следит дальше.
(() => {
  const list = (window.__hdErrors = []);
  const add = (text, where) => {
    text = String(text || "").replace(/^Uncaught /, "").trim();
    if (!text || text === "Script error.") return;   // чужой скрипт без CORS: ни текста, ни места — пользы нет
    if (list.length && list[list.length - 1].text === text) return;
    list.push({ text: text.slice(0, 600), where: where || "" });
    if (list.length > 40) list.shift();
    try { if (window.__hdOnError) window.__hdOnError(); } catch { /* агент ещё не готов */ }
  };
  addEventListener("error", (e) => {
    if (!e.error && !e.message) return;   // не загрузилась картинка или файл — это не скрипт
    const file = String(e.filename || "").split("?")[0].split("/").pop();
    add(e.message, file ? file + ":" + (e.lineno || 0) : "");
  });
  addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    add("Необработанный отказ промиса: " + (r && r.message ? (r.name || "Error") + ": " + r.message : String(r)), "");
  });
})();
