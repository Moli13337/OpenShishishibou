(function (root) {
  "use strict";

  const PLAYER_KEY = "tavern.lan-player";
  const PREFIXES = ["tavern.", "tobatsu."];
  const EXCLUDED = ["tavern.lang-notice"];
  const doc = root.document;
  if (!doc) return;

  let player = null;
  let status = "off";
  let pushTimer = null;
  let bootstrapped = false;
  let lastFailAt = 0;

  try {
    const queryPlayer = new URLSearchParams(root.location.search).get("lan");
    if (queryPlayer) root.localStorage.setItem(PLAYER_KEY, queryPlayer.trim());
    player = root.localStorage.getItem(PLAYER_KEY) || null;
  } catch (_error) { /* storage unavailable */ }

  function api(path, options) {
    return root.fetch(path, options).then(function (response) {
      if (!response.ok) throw new Error("http " + response.status);
      return response.json();
    });
  }

  function collectLocalState() {
    const state = {};
    try {
      for (let i = 0; i < root.localStorage.length; i += 1) {
        const key = root.localStorage.key(i);
        if (!key || EXCLUDED.indexOf(key) >= 0) continue;
        if (!PREFIXES.some(function (p) { return key.startsWith(p); })) continue;
        state[key] = root.localStorage.getItem(key);
      }
    } catch (_error) { /* ignore */ }
    return state;
  }

  function push() {
    if (!player) return;
    if (status === "err" && Date.now() - lastFailAt < 60000) return;
    const state = collectLocalState();
    api("/api/progress/" + encodeURIComponent(player), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: state }),
      keepalive: true
    }).then(function () {
      status = "ok";
      render();
    }).catch(function () {
      lastFailAt = Date.now();
      status = "err";
      render();
    });
  }

  function pull() {
    if (!player) return Promise.resolve();
    return api("/api/progress/" + encodeURIComponent(player)).then(function (payload) {
      const state = payload && payload.state;
      if (!state || typeof state !== "object") return;
      let restored = 0;
      for (const key of Object.keys(state)) {
        if (state[key] === null || state[key] === undefined) continue;
        let exists = false;
        try { exists = root.localStorage.getItem(key) !== null; } catch (_error) { /* ignore */ }
        if (!exists) {
          try {
            root.localStorage.setItem(key, state[key]);
            restored += 1;
          } catch (_error) { /* ignore */ }
        }
      }
      status = "ok";
      render();
      return restored;
    }).catch(function () {
      status = "err";
      render();
    });
  }

  function schedulePush() {
    if (pushTimer) root.clearTimeout(pushTimer);
    pushTimer = root.setTimeout(function () {
      pushTimer = null;
      push();
    }, 1500);
  }

  function setPlayer(name) {
    const clean = String(name || "").trim().slice(0, 32);
    try {
      if (clean) root.localStorage.setItem(PLAYER_KEY, clean);
      else root.localStorage.removeItem(PLAYER_KEY);
    } catch (_error) { /* ignore */ }
    player = clean || null;
    status = player ? "sync" : "off";
    render();
    if (player) {
      pull().then(push);
    }
  }

  function render() {
    const chip = doc.getElementById("lan-sync-chip");
    if (!chip) return;
    const label = chip.querySelector(".lan-label");
    const dot = chip.querySelector(".lan-dot");
    if (!label || !dot) return;
    if (!player) {
      label.textContent = "LAN: 未登录";
      dot.dataset.state = "off";
    } else {
      label.textContent = "LAN: " + player;
      dot.dataset.state = status;
    }
  }

  function buildChip() {
    if (doc.getElementById("lan-sync-chip")) return;
    if (!doc.body) return;
    const style = doc.createElement("style");
    style.textContent = [
      "#lan-sync-chip{position:fixed;left:12px;bottom:12px;z-index:9999;display:flex;align-items:center;gap:8px;",
      "padding:6px 12px;border:1px solid #7c6a8a;border-radius:999px;background:rgba(20,14,24,.85);",
      "color:#e8dff0;font:700 12px/1.4 'Noto Sans SC',sans-serif;cursor:pointer;backdrop-filter:blur(4px)}",
      "#lan-sync-chip .lan-dot{width:8px;height:8px;border-radius:50%;background:#888}",
      "#lan-sync-chip .lan-dot[data-state='ok']{background:#6fd66f}",
      "#lan-sync-chip .lan-dot[data-state='err']{background:#e06a6a}",
      "#lan-sync-chip .lan-dot[data-state='sync']{background:#e0b34f}"
    ].join("");
    doc.head.appendChild(style);
    const chip = doc.createElement("button");
    chip.id = "lan-sync-chip";
    chip.type = "button";
    chip.innerHTML = '<span class="lan-dot" data-state="off"></span><span class="lan-label">LAN: 未登录</span>';
    chip.addEventListener("click", function () {
      const next = root.prompt("LAN 玩家名（留空退出登录）:", player || "");
      if (next === null) return;
      setPlayer(next);
    });
    doc.body.appendChild(chip);
    render();
  }

  function boot() {
    if (!bootstrapped) {
      bootstrapped = true;
      api("/api/health").then(function () {
        status = player ? "ok" : "off";
        render();
        return pull();
      }).then(function () {
        if (player) push();
      }).catch(function () {
        status = "err";
        render();
      });
      pushTimer = root.setInterval(push, 10000);
      doc.addEventListener("visibilitychange", function () {
        if (doc.visibilityState === "hidden") push();
      });
      root.addEventListener("pagehide", push);
      root.addEventListener("astro:page-load", function () {
        buildChip();
        schedulePush();
      });
    }
    buildChip();
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  root.TavernLAN = Object.freeze({
    getPlayer: function () { return player; },
    setPlayer: setPlayer,
    push: push,
    pull: pull
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
