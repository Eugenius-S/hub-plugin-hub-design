// Hub Design: the design's error catcher. Placed first in <head>, before the design's scripts, so it sees what fails on load too.
// It catches only window error and unhandledrejection (not console.error: that is noise); agent.js then takes the list and keeps watching.
(() => {
  const list = (window.__hdErrors = []);
  const add = (text, where) => {
    text = String(text || "").replace(/^Uncaught /, "").trim();
    if (!text || text === "Script error.") return;   // a foreign script without CORS: no text, no place, no use
    if (list.length && list[list.length - 1].text === text) return;
    list.push({ text: text.slice(0, 600), where: where || "" });
    if (list.length > 40) list.shift();
    try { if (window.__hdOnError) window.__hdOnError(); } catch { /* the agent is not ready yet */ }
  };
  addEventListener("error", (e) => {
    if (!e.error && !e.message) return;   // an image or file failed to load, which is not a script error
    const file = String(e.filename || "").split("?")[0].split("/").pop();
    add(e.message, file ? file + ":" + (e.lineno || 0) : "");
  });
  addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    add("Unhandled promise rejection: " + (r && r.message ? (r.name || "Error") + ": " + r.message : String(r)), "");
  });
})();
