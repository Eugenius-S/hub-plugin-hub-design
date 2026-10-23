// node win.mjs <port> <w> <h> — real window size of the headless chrome (persists after the script ends)
const [port, w, h] = process.argv.slice(2);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
let id = 0; const wait = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const win = await send("Browser.getWindowForTarget");
const r = await send("Browser.setWindowBounds", { windowId: win.result.windowId, bounds: { width: +w, height: +h, windowState: "normal" } });
await new Promise((r) => setTimeout(r, 300));
const m = await send("Runtime.evaluate", { expression: "[innerWidth, innerHeight]", returnByValue: true });
console.log(JSON.stringify(m.result.result.value), JSON.stringify(r.result || r.error));
process.exit(0);
