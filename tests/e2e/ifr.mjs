// node ifr.mjs <port> '<expr>' — an expression in the context of the design's iframe (the first context with a /f/ path and no raw)
const [port, expr] = process.argv.slice(2);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
let id = 0; const wait = new Map(); const ctxs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else if (d.method === "Runtime.executionContextCreated") ctxs.push(d.params.context); };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable");
await new Promise((r) => setTimeout(r, 300));
const c = ctxs.filter((c) => /\/f\//.test(c.origin + (c.name || "")) || /^http:\/\/localhost:\d+$/.test(c.origin)).filter((c) => c.auxData && c.auxData.frameId && !c.auxData.isDefault === false);
const frames = ctxs.filter((c) => c.auxData && c.auxData.isDefault);
const out = [];
for (const c of frames) {
  const r = await send("Runtime.evaluate", { expression: expr, contextId: c.id, returnByValue: true, awaitPromise: true });
  if (!r.result) continue;   // the frame is reloading: its context is gone
  out.push({ origin: c.origin, v: r.result.result ? r.result.result.value : r.result });
}
console.log(JSON.stringify(out));
process.exit(0);
