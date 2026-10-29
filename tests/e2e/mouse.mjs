// node mouse.mjs <port> down|move|up x y [mods] [clicks] — mods: alt,shift,meta (or "-"); clicks: 2 for the second press of a double click
const [port, kind, x, y, mods = "", clicks = "1"] = process.argv.slice(2);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
let id = 0; const wait = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const modifiers = (mods.includes("alt") ? 1 : 0) | (mods.includes("meta") ? 4 : 0) | (mods.includes("shift") ? 8 : 0);
const type = { down: "mousePressed", move: "mouseMoved", up: "mouseReleased" }[kind];
await send("Input.dispatchMouseEvent", { type, x: +x, y: +y, button: "left", buttons: kind === "up" ? 0 : 1, clickCount: kind === "move" ? 0 : +clicks, modifiers });
await new Promise((r) => setTimeout(r, 80));
process.exit(0);
