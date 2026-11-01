"use strict";

function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const keys = [];
    const regexSource = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/:(\w+)/g, function (_, key) {
        keys.push(key);
        return "([^/]+)";
      });
    routes.push({
      method: method,
      regex: new RegExp("^" + regexSource + "$"),
      keys: keys,
      handler: handler
    });
  }

  function resolve(method, pathname) {
    for (const route of routes) {
      if (route.method !== method) continue;
      const match = route.regex.exec(pathname);
      if (!match) continue;
      const params = Object.create(null);
      route.keys.forEach(function (key, i) {
        params[key] = decodeURIComponent(match[i + 1]);
      });
      return { handler: route.handler, params: params };
    }
    return null;
  }

  return {
    get: function (p, h) { add("GET", p, h); },
    post: function (p, h) { add("POST", p, h); },
    put: function (p, h) { add("PUT", p, h); },
    patch: function (p, h) { add("PATCH", p, h); },
    delete: function (p, h) { add("DELETE", p, h); },
    resolve: resolve
  };
}

module.exports = { createRouter: createRouter };
