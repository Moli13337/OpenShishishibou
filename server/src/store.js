"use strict";

const fs = require("fs");
const path = require("path");

function createStore(dataDir) {
  const dbPath = path.join(dataDir, "db.json");
  let state = { players: Object.create(null) };
  let saveTimer = null;

  function load() {
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(dbPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(dbPath, "utf8"));
        if (raw.players && typeof raw.players === "object") state.players = raw.players;
      } catch (error) {
        console.error("[store] failed to read db.json, starting fresh:", error.message);
      }
    }
  }

  function persistNow() {
    const tmp = dbPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, dbPath);
  }

  function schedulePersist() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try {
        persistNow();
      } catch (error) {
        console.error("[store] persist failed:", error.message);
      }
    }, 300);
  }

  return {
    load: load,
    get data() { return state; },
    schedulePersist: schedulePersist,
    persistNow: persistNow
  };
}

module.exports = { createStore: createStore };
