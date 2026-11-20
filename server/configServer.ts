// Localhost-only HTTP server for the web configurator.
//
// Security: this API can create buttons that run arbitrary commands, so it
//  - binds to 127.0.0.1 only,
//  - rejects requests whose Host header isn't localhost:<port> (blocks DNS rebinding),
//  - rejects cross-origin requests and requires a custom header + JSON body on
//    mutating requests (a foreign web page can't send those without a CORS
//    preflight, which we never approve).

import http from "node:http";
import configuratorHtml from "./generated/configuratorHtml";
import { ValidationError, validateAction, validateProfile } from "../shared/validate";
import { getProfile, saveProfile, testAction } from "./deck";

const MAX_BODY = 20 * 1024 * 1024;
const CSRF_HEADER = "x-streamdeck-config";

let server: http.Server | null = null;
let currentPort: number | null = null;

export const configuratorUrl = () => (currentPort ? `http://localhost:${currentPort}/` : null);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "Request body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(data);
}

function checkRequest(req: http.IncomingMessage, port: number) {
  const allowedHosts = [`localhost:${port}`, `127.0.0.1:${port}`];
  if (!allowedHosts.includes((req.headers.host ?? "").toLowerCase())) throw new HttpError(403, "Forbidden host");

  const origin = req.headers.origin;
  if (origin && !allowedHosts.some((h) => origin.toLowerCase() === `http://${h}`))
    throw new HttpError(403, "Cross-origin requests are not allowed");

  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.headers[CSRF_HEADER] !== "1") throw new HttpError(403, "Missing configurator header");
    if (!(req.headers["content-type"] ?? "").startsWith("application/json"))
      throw new HttpError(415, "Content-Type must be application/json");
  }
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse, port: number) {
  checkRequest(req, port);
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const route = `${req.method} ${url.pathname}`;

  switch (route) {
    case "GET /":
    case "GET /index.html":
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'",
      });
      res.end(configuratorHtml);
      return;

    case "GET /api/profile":
      sendJson(res, 200, getProfile());
      return;

    case "PUT /api/profile": {
      const profile = validateProfile(await readJson(req));
      saveProfile(profile);
      sendJson(res, 200, profile);
      return;
    }

    case "POST /api/test": {
      const body = (await readJson(req)) as { action?: unknown };
      const action = validateAction(body?.action);
      await testAction(action);
      sendJson(res, 200, { ok: true });
      return;
    }

    default:
      throw new HttpError(404, "Not found");
  }
}

export function startConfigServer(port: number): Promise<void> {
  if (server && currentPort === port) return Promise.resolve();
  stopConfigServer();

  const srv = http.createServer((req, res) => {
    handle(req, res, port).catch((e: unknown) => {
      const status = e instanceof HttpError ? e.status : e instanceof ValidationError ? 400 : 500;
      const message = e instanceof Error ? e.message : String(e);
      if (status === 500) console.error("[configurator]", e);
      if (!res.headersSent) sendJson(res, status, { error: message });
      else res.end();
    });
  });
  server = srv;

  return new Promise((resolve, reject) => {
    srv.once("error", (err: NodeJS.ErrnoException) => {
      if (server === srv) {
        server = null;
        currentPort = null;
      }
      reject(err.code === "EADDRINUSE" ? new Error(`Port ${port} is already in use`) : err);
    });
    srv.listen(port, "127.0.0.1", () => {
      currentPort = port;
      console.log(`StreamDeck configurator: http://localhost:${port}/`);
      resolve();
    });
  });
}

export function stopConfigServer() {
  if (server) {
    server.close();
    server.closeAllConnections?.();
  }
  server = null;
  currentPort = null;
}
