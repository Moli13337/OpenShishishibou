"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { loadConfig } = require("./config");
const { createRouter } = require("./router");
const { createStore } = require("./store");
const { createProgressModule } = require("./modules/progress");

const SERVER_ROOT = path.resolve(__dirname, "..");
const config = loadConfig(SERVER_ROOT);
const store = createStore(config.server.dataDir);
const progress = createProgressModule(store, config.server);
const router = createRouter();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonc": "application/json; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": config.server.corsAllowOrigin,
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("payload too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", function () {
      if (!chunks.length) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (_error) {
        reject(Object.assign(new Error("invalid JSON body"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function injectSyncScript(html) {
  const tag = '<script src="' + config.server.injectScript + '" defer></script>';
  if (html.includes(config.server.injectScript)) return html;
  if (html.includes("</head>")) return html.replace("</head>", tag + "</head>");
  return html;
}

function serveStatic(req, res, pathname) {
  const webRoot = config.server.webDir;
  let relative = decodeURIComponent(pathname);
  if (relative === "/" || relative === "") relative = "/index.html";
  const target = path.normalize(path.join(webRoot, relative));
  if (!target.startsWith(webRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(target, function (error, stat) {
    if (!error && stat.isDirectory()) {
      return serveStatic(req, res, pathname.replace(/\/?$/, "/index.html"));
    }
    if (error || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    const ext = path.extname(target).toLowerCase();
    const isHtml = ext === ".html";
    const headers = {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": isHtml ? "no-cache" : "public, max-age=3600"
    };

    if (isHtml && !req.headers.range) {
      fs.readFile(target, "utf8", function (readError, html) {
        if (readError) {
          res.writeHead(500);
          res.end("Server Error");
          return;
        }
        const body = Buffer.from(injectSyncScript(html), "utf8");
        headers["Content-Length"] = body.length;
        res.writeHead(200, headers);
        res.end(body);
      });
      return;
    }

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      let start = match && match[1] !== "" ? parseInt(match[1], 10) : null;
      let end = match && match[2] !== "" ? parseInt(match[2], 10) : null;
      if (match && start !== null && (end === null || end >= start) && start < stat.size) {
        if (end === null || end >= stat.size) end = stat.size - 1;
        headers["Content-Range"] = "bytes " + start + "-" + end + "/" + stat.size;
        headers["Content-Length"] = end - start + 1;
        res.writeHead(206, headers);
        fs.createReadStream(target, { start: start, end: end }).pipe(res);
        return;
      }
      headers["Content-Range"] = "bytes */" + stat.size;
      res.writeHead(416, headers);
      res.end();
      return;
    }

    headers["Content-Length"] = stat.size;
    res.writeHead(200, headers);
    fs.createReadStream(target).pipe(res);
  });
}

router.get("/api/health", function (ctx) {
  sendJson(ctx.res, 200, { ok: true, name: "shishishibou-server", version: config.site.version || "1.0.0" });
});

router.get("/api/config", function (ctx) {
  sendJson(ctx.res, 200, Object.assign({}, config.site, {
    syncIntervalHintMs: config.server.syncIntervalHintMs
  }));
});

router.put("/api/progress/:player", function (ctx) {
  const playerId = sanitizePlayerId(ctx.params.player);
  if (!playerId) {
    sendJson(ctx.res, 400, { error: "player id required" });
    return;
  }
  const state = ctx.body && ctx.body.state ? ctx.body.state : ctx.body;
  const result = progress.mergeState(playerId, state);
  sendJson(ctx.res, 200, { ok: true, player: playerId, applied: result.applied, total: result.total });
});

router.get("/api/progress/:player", function (ctx) {
  const playerId = sanitizePlayerId(ctx.params.player);
  if (!playerId) {
    sendJson(ctx.res, 400, { error: "player id required" });
    return;
  }
  sendJson(ctx.res, 200, progress.getState(playerId));
});

router.get("/api/leaderboard", function (ctx) {
  const questId = (ctx.query.get("quest") || "001").replace(/[^\w-]/g, "");
  const limit = Number(ctx.query.get("limit")) || 20;
  sendJson(ctx.res, 200, {
    quest: questId,
    metric: "endless-best",
    entries: progress.leaderboard(questId, limit)
  });
});

router.get("/api/roster", function (ctx) {
  sendJson(ctx.res, 200, { players: progress.roster() });
});

function sanitizePlayerId(value) {
  const id = String(value == null ? "" : value).trim().slice(0, 32);
  if (!id) return null;
  return id.replace(/[^\w\u4e00-\u9fff\-·]/g, "_");
}

function requestHandler(req, res) {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const pathname = url.pathname;

  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": config.server.corsAllowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    });
    res.end();
    return;
  }

  if (pathname.startsWith("/api/")) {
    const resolved = router.resolve(req.method, pathname);
    if (!resolved) {
      sendJson(res, 404, { error: "no such endpoint" });
      return;
    }
    const needsBody = req.method === "POST" || req.method === "PUT" || req.method === "PATCH";
    Promise.resolve(needsBody ? readBody(req, 1024 * 1024) : null).then(function (body) {
      return resolved.handler({
        req: req,
        res: res,
        params: resolved.params,
        query: url.searchParams,
        body: body
      });
    }).catch(function (error) {
      sendJson(res, error && error.statusCode ? error.statusCode : 500, { error: error ? error.message : "handler failed" });
    });
    return;
  }

  serveStatic(req, res, pathname);
}

function lanAddresses() {
  const results = [];
  for (const name of Object.keys(os.networkInterfaces())) {
    for (const entry of os.networkInterfaces()[name] || []) {
      if (entry.family === "IPv4" && !entry.internal) results.push(entry.address);
    }
  }
  return results;
}

store.load();

const server = http.createServer(requestHandler);
server.requestTimeout = config.server.requestTimeoutMs + 10000;
server.listen(config.server.port, config.server.host, function () {
  console.log("shishishibou server v" + (config.site.version || "1.0.0"));
  console.log("listening on http://" + config.server.host + ":" + config.server.port);
  for (const address of lanAddresses()) {
    console.log("  LAN: http://" + address + ":" + config.server.port);
  }
  console.log("web root: " + config.server.webDir);
});

process.on("SIGINT", function () {
  console.log("shutting down...");
  try { store.persistNow(); } catch (_error) { /* already flushed */ }
  process.exit(0);
});
