// Static server for the spike. /pyodide/* -> the extracted Pyodide 314.0.7 release; everything else -> this folder.
// Counts the bytes it sends per path, so the download size is measured, not estimated.
// usage: node serve.mjs <pyodide dir> <port>
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const [pyDir, port = "8765"] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json",
  ".wasm": "application/wasm", ".py": "text/plain", ".zip": "application/zip", ".whl": "application/zip" };
export const served = [];
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/__served") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(served)); }
  if (p.includes("..")) { res.statusCode = 400; return res.end(); }
  const file = p.startsWith("/pyodide/") ? join(pyDir, p.slice(9)) : join(here, p === "/" ? "index.html" : p);
  try {
    const body = await readFile(file);
    res.setHeader("content-type", types[extname(file)] || "application/octet-stream");
    res.end(body);
    served.push([p, body.length]);
  } catch { res.statusCode = 404; res.end(); served.push([p, -1]); }
});
server.listen(Number(port), "127.0.0.1", () => console.log(`serving on http://127.0.0.1:${port}`));
