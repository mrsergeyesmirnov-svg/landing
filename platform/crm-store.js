/*! CRM store — Postgres через platform-api, fallback localStorage */
(function (global) {
  var KEY = "ss_crm_v1";
  var CACHE_READY = false;

  var STATUSES = [
    { id: "lead", label: "Касание" },
    { id: "brief", label: "Квалификация" },
    { id: "sale", label: "Продажа" },
    { id: "diagnose", label: "Диагноз / точка отсчёта" },
    { id: "change", label: "План внедрения" },
    { id: "control", label: "Контроль" },
    { id: "sub", label: "Подписка" },
    { id: "pause", label: "Пауза" },
    { id: "lost", label: "Отказ" }
  ];

  function apiBase() {
    var u = (global.PLATFORM_API_URL || "").replace(/\/$/, "");
    if (!u || u.indexOf("REPLACE_WITH") >= 0) return "";
    return u;
  }

  function token() {
    return global.PLATFORM_TOKEN || "smena2026";
  }

  function uid() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { clients: [] };
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.clients)) return { clients: [] };
      return data;
    } catch (e) {
      return { clients: [] };
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function statusLabel(id) {
    for (var i = 0; i < STATUSES.length; i++) {
      if (STATUSES[i].id === id) return STATUSES[i].label;
    }
    return id || "—";
  }

  function api(path, opts) {
    var base = apiBase();
    if (!base) return Promise.reject(new Error("no-api"));
    opts = opts || {};
    var headers = Object.assign(
      { "Content-Type": "application/json", "X-Platform-Token": token() },
      opts.headers || {}
    );
    return fetch(base + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error(t || ("HTTP " + r.status));
        });
      }
      return r.json();
    });
  }

  /** Подтянуть всех клиентов с сервера в localStorage-кэш */
  function syncFromServer() {
    return api("/api/clients")
      .then(function (data) {
        save({ clients: data.clients || [] });
        CACHE_READY = true;
        return data.clients || [];
      })
      .catch(function (e) {
        console.warn("[SSCrm] sync failed, local cache:", e.message || e);
        CACHE_READY = false;
        return load().clients;
      });
  }

  function listClients() {
    return load().clients.slice().sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function getClient(id) {
    var clients = load().clients;
    for (var i = 0; i < clients.length; i++) {
      if (clients[i].id === id) return clients[i];
    }
    return null;
  }

  function findByName(name) {
    var n = (name || "").trim().toLowerCase();
    if (!n) return null;
    var clients = load().clients;
    for (var i = 0; i < clients.length; i++) {
      if ((clients[i].name || "").trim().toLowerCase() === n) return clients[i];
    }
    return null;
  }

  function upsertClient(patch) {
    var data = load();
    var now = Date.now();
    var c = null;
    if (patch.id) {
      for (var i = 0; i < data.clients.length; i++) {
        if (data.clients[i].id === patch.id) {
          c = data.clients[i];
          break;
        }
      }
    }
    if (!c) {
      c = {
        id: patch.id || uid(),
        name: "",
        city: "",
        contact: "",
        phone: "",
        telegram: "",
        status: "lead",
        notes: "",
        comments: [],
        docs: [],
        createdAt: now,
        updatedAt: now
      };
      data.clients.push(c);
    }
    Object.keys(patch).forEach(function (k) {
      if (k === "id" || k === "comments" || k === "docs") return;
      if (patch[k] !== undefined) c[k] = patch[k];
    });
    c.updatedAt = now;
    save(data);

    // fire-and-forget на сервер
    api("/api/clients", {
      method: "POST",
      body: {
        id: c.id,
        name: c.name,
        city: c.city,
        contact: c.contact,
        phone: c.phone || "",
        telegram: c.telegram || "",
        status: c.status,
        notes: c.notes || ""
      }
    }).catch(function (e) {
      console.warn("[SSCrm] upsert remote failed", e.message || e);
    });

    return c;
  }

  function addComment(clientId, text) {
    var data = load();
    for (var i = 0; i < data.clients.length; i++) {
      if (data.clients[i].id === clientId) {
        data.clients[i].comments = data.clients[i].comments || [];
        data.clients[i].comments.unshift({
          id: uid(),
          text: text,
          at: Date.now()
        });
        data.clients[i].updatedAt = Date.now();
        save(data);
        api("/api/clients/" + encodeURIComponent(clientId) + "/comments", {
          method: "POST",
          body: { text: text }
        }).catch(function (e) {
          console.warn("[SSCrm] comment remote failed", e.message || e);
        });
        return data.clients[i];
      }
    }
    return null;
  }

  function attachDoc(clientId, doc) {
    var data = load();
    var c = null;
    for (var i = 0; i < data.clients.length; i++) {
      if (data.clients[i].id === clientId) {
        c = data.clients[i];
        break;
      }
    }
    if (!c && doc && doc.clientName) {
      c = findByName(doc.clientName);
      if (c) {
        for (i = 0; i < data.clients.length; i++) {
          if (data.clients[i].id === c.id) {
            c = data.clients[i];
            break;
          }
        }
      }
    }
    if (!c && doc && doc.clientName) {
      c = {
        id: uid(),
        name: doc.clientName,
        city: doc.city || "",
        contact: doc.contact || "",
        phone: "",
        telegram: "",
        status: "sale",
        notes: "",
        comments: [],
        docs: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      data.clients.push(c);
    }
    if (!c) return null;
    c.docs = c.docs || [];
    c.docs.unshift({
      id: uid(),
      kind: doc.kind,
      number: doc.number,
      date: doc.date,
      sum: doc.sum,
      title: doc.title,
      html: doc.html || "",
      snapshot: doc.snapshot || null,
      at: Date.now()
    });
    c.updatedAt = Date.now();
    if (doc.city && !c.city) c.city = doc.city;
    if (doc.contact && !c.contact) c.contact = doc.contact;
    save(data);

    api("/api/clients/" + encodeURIComponent(c.id) + "/docs", {
      method: "POST",
      body: {
        kind: doc.kind,
        number: doc.number,
        date: doc.date,
        sum: doc.sum,
        title: doc.title,
        html: doc.html || "",
        snapshot: doc.snapshot || null,
        clientName: doc.clientName,
        city: doc.city,
        contact: doc.contact
      }
    }).catch(function (e) {
      console.warn("[SSCrm] doc remote failed", e.message || e);
    });

    return c;
  }

  function removeClient(id) {
    var data = load();
    data.clients = data.clients.filter(function (c) {
      return c.id !== id;
    });
    save(data);
    api("/api/clients/" + encodeURIComponent(id), { method: "DELETE" }).catch(
      function (e) {
        console.warn("[SSCrm] delete remote failed", e.message || e);
      }
    );
  }

  function setActiveClient(id) {
    if (id) localStorage.setItem("ss_crm_active", id);
    else localStorage.removeItem("ss_crm_active");
  }

  function getActiveClientId() {
    return localStorage.getItem("ss_crm_active") || "";
  }

  function hasApi() {
    return !!apiBase();
  }

  global.SSCrm = {
    KEY: KEY,
    STATUSES: STATUSES,
    statusLabel: statusLabel,
    listClients: listClients,
    getClient: getClient,
    findByName: findByName,
    upsertClient: upsertClient,
    addComment: addComment,
    attachDoc: attachDoc,
    removeClient: removeClient,
    setActiveClient: setActiveClient,
    getActiveClientId: getActiveClientId,
    syncFromServer: syncFromServer,
    hasApi: hasApi
  };
})(window);
