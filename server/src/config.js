"use strict";

const fs = require("fs");
const path = require("path");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return fallback;
  }
}

function loadConfig(serverRoot) {
  const serverConfig = readJson(path.join(serverRoot, "config", "server.json"), {});
  const siteConfig = readJson(path.join(serverRoot, "config", "site.json"), {});
  return {
    server: {
      host: serverConfig.host || "0.0.0.0",
      port: Number(serverConfig.port) || 8800,
      corsAllowOrigin: serverConfig.corsAllowOrigin || "*",
      webDir: path.resolve(serverRoot, serverConfig.webDir || "../web"),
      dataDir: path.resolve(serverRoot, serverConfig.dataDir || "data"),
      injectScript: serverConfig.injectScript || "/lan-sync.js",
      syncIntervalHintMs: Number(serverConfig.syncIntervalHintMs) || 10000,
      maxPlayers: Number(serverConfig.maxPlayers) || 200,
      requestTimeoutMs: Number(serverConfig.requestTimeoutMs) || 15000
    },
    site: siteConfig
  };
}

module.exports = { loadConfig: loadConfig, readJson: readJson };
