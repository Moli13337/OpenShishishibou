"use strict";

const SYNC_WHITELIST = ["tavern.", "tobatsu."];

function isSyncableKey(key) {
  return typeof key === "string" && SYNC_WHITELIST.some(function (prefix) {
    return key.startsWith(prefix);
  });
}

function sanitizePlayerId(value) {
  const id = String(value == null ? "" : value).trim().slice(0, 32);
  if (!id) return null;
  return id.replace(/[^\w\u4e00-\u9fff\-·]/g, "_");
}

function createProgressModule(store, config) {
  function getPlayer(playerId) {
    return store.data.players[playerId] || null;
  }

  function upsertPlayer(playerId) {
    let player = store.data.players[playerId];
    if (!player) {
      if (Object.keys(store.data.players).length >= config.maxPlayers) {
        const error = new Error("player registry is full");
        error.statusCode = 507;
        throw error;
      }
      player = store.data.players[playerId] = {
        id: playerId,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        state: Object.create(null)
      };
    }
    return player;
  }

  function mergeState(playerId, incomingState) {
    if (!incomingState || typeof incomingState !== "object" || Array.isArray(incomingState)) {
      const error = new Error("state must be an object");
      error.statusCode = 400;
      throw error;
    }
    const player = upsertPlayer(playerId);
    let applied = 0;
    for (const key of Object.keys(incomingState)) {
      if (!isSyncableKey(key)) continue;
      player.state[key] = incomingState[key];
      applied += 1;
    }
    player.updatedAt = new Date().toISOString();
    store.schedulePersist();
    return { applied: applied, total: Object.keys(player.state).length };
  }

  function getState(playerId) {
    const player = getPlayer(playerId);
    if (!player) {
      return { id: playerId, updatedAt: null, state: Object.create(null) };
    }
    return { id: player.id, updatedAt: player.updatedAt, state: player.state };
  }

  function leaderboard(questId, limit) {
    const key = "tobatsu.q" + questId + ".endless-best";
    const entries = [];
    for (const player of Object.values(store.data.players)) {
      const raw = player.state[key];
      const best = Number(raw);
      if (!Number.isFinite(best) || best <= 0) continue;
      entries.push({ player: player.id, best: Math.floor(best), updatedAt: player.updatedAt });
    }
    entries.sort(function (a, b) { return b.best - a.best; });
    return entries.slice(0, Math.max(1, Math.min(100, limit || 20)));
  }

  function countCleared(value) {
    let parsed = value;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch (_error) { return 0; }
    }
    if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
    return 0;
  }

  function roster() {
    return Object.values(store.data.players).map(function (player) {
      return {
        id: player.id,
        createdAt: player.createdAt,
        updatedAt: player.updatedAt,
        keys: Object.keys(player.state).length,
        questsCleared: countCleared(player.state["tavern.quest-clear"])
      };
    }).sort(function (a, b) {
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  }

  return {
    mergeState: mergeState,
    getState: getState,
    leaderboard: leaderboard,
    roster: roster
  };
}

module.exports = { createProgressModule: createProgressModule };
