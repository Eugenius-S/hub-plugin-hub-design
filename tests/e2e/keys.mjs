// node keys.mjs <port> text '<string>' | key <Key> [mods] — real keyboard input into the focused element of the page (and its frames)
// mods: ctrl,shift,alt,meta. Key: Enter, Escape, Tab, a… (one letter keys go with their text)
const [port, kind, arg, mods = ""] = process.argv.slice(2);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
let id = 0; const wait = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
if (kind === "text") await send("Input.insertText", { text: arg });
else {
  const modifiers = (mods.includes("alt") ? 1 : 0) | (mods.includes("ctrl") ? 2 : 0) | (mods.includes("meta") ? 4 : 0) | (mods.includes("shift") ? 8 : 0);
  const codes = { Enter: [13, "Enter"], Escape: [27, "Escape"], Tab: [9, "Tab"], Backspace: [8, "Backspace"] };
  const [vk, code] = codes[arg] || [arg.toUpperCase().charCodeAt(0), "Key" + arg.toUpperCase()];
  const text = arg === "Enter" ? "\r" : arg.length === 1 && !(modifiers & 6) ? arg : undefined;
  await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: arg, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: arg, code, windowsVirtualKeyCode: vk, modifiers });
}
await new Promise((r) => setTimeout(r, 80));
process.exit(0);
