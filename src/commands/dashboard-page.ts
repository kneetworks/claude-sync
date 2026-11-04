/**
 * The dashboard's one page: plain HTML, CSS and JS, so it needs no build step.
 * It is a single String.raw literal, so the code inside avoids backticks and "${".
 */
export function dashboardPage(nonce: string): string {
  return PAGE.replace("__NONCE__", nonce);
}

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>claude-sync</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f3f3f3;
    --surface: #ffffff;
    --surface-2: #fbfbfb;
    --hover: #f5f5f5;
    --border: #e5e5e5;
    --text: #1b1b1b;
    --muted: #5f5f5f;
    --accent: #005fb8;
    --accent-text: #ffffff;
    --ok: #0f7b0f;
    --warn: #9d5d00;
    --err: #c42b1c;
    --shadow: 0 2px 6px rgba(0, 0, 0, 0.05), 0 0 1px rgba(0, 0, 0, 0.14);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #202020;
      --surface: #2b2b2b;
      --surface-2: #2f2f2f;
      --hover: #343434;
      --border: #3a3a3a;
      --text: #f3f3f3;
      --muted: #b4b4b4;
      --accent: #60cdff;
      --accent-text: #00243a;
      --ok: #6ccb5f;
      --warn: #fce100;
      --err: #ff99a4;
      --shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 0 1px rgba(0, 0, 0, 0.5);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.45 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
  }
  .app { max-width: 940px; margin: 0 auto; padding: 24px 16px 48px; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand svg { width: 36px; height: 36px; color: var(--accent); flex: none; }
  h1 { font-size: 20px; font-weight: 600; margin: 0; }
  .brand p { margin: 0; color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { font: inherit; }
  .primary {
    background: var(--accent); color: var(--accent-text); border: 0; border-radius: 6px;
    padding: 7px 18px; font-weight: 600; cursor: pointer; white-space: nowrap;
  }
  .primary:hover:not(:disabled) { filter: brightness(1.08); }
  .primary:disabled { opacity: 0.5; cursor: default; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow); }
  .status { display: flex; gap: 14px; align-items: flex-start; padding: 16px 18px; margin-bottom: 16px; }
  .status .big { width: 28px; height: 28px; flex: none; margin-top: 1px; }
  .status h2 { font-size: 16px; margin: 0 0 2px; font-weight: 600; }
  .status p { margin: 0; color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
  .status details { margin-top: 6px; font-size: 13px; }
  .status summary { cursor: pointer; color: var(--warn); }
  .status ul { margin: 6px 0 0; padding-left: 18px; color: var(--muted); max-height: 160px; overflow: auto; overflow-wrap: anywhere; }
  .panel-head { padding: 16px 18px 6px; }
  .panel-head h2 { font-size: 15px; margin: 0 0 4px; font-weight: 600; }
  .hint { margin: 0; color: var(--muted); font-size: 13px; max-width: 72ch; }
  .toolbar { display: flex; gap: 8px; padding: 10px 18px 12px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
  .toolbar input, .toolbar select {
    font: inherit; color: var(--text); background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px;
  }
  .toolbar input { flex: 1 1 220px; min-width: 0; }
  .row {
    display: grid; grid-template-columns: 26px 26px minmax(0, 1fr) 116px 72px 26px;
    align-items: center; gap: 4px; padding: 6px 14px 6px 10px; min-height: 46px;
    border-bottom: 1px solid var(--border);
  }
  .row:hover { background: var(--hover); }
  .row.child { padding-left: 38px; min-height: 40px; }
  .row.project { cursor: pointer; }
  .name { min-width: 0; display: flex; align-items: center; gap: 10px; }
  .name > div { min-width: 0; }
  .name .label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project .label { font-weight: 600; }
  .name small { display: block; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .off .label { color: var(--muted); }
  .date, .size { color: var(--muted); font-size: 12.5px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .state { display: flex; justify-content: center; }
  .state svg { width: 16px; height: 16px; }
  .kind svg, .big svg { display: block; width: 100%; height: 100%; }
  .kind { width: 18px; height: 18px; color: var(--muted); flex: none; }
  .project .kind { color: var(--accent); }
  .ok { color: var(--ok); }
  .accent { color: var(--accent); }
  .warn { color: var(--warn); }
  .err { color: var(--err); }
  .muted { color: var(--muted); }
  .chev {
    border: 0; background: none; color: var(--muted); width: 24px; height: 24px;
    border-radius: 4px; cursor: pointer; display: grid; place-items: center; padding: 0;
  }
  .chev:hover { background: var(--border); }
  .chev svg { width: 12px; height: 12px; transition: transform 0.15s; }
  .chev[aria-expanded="true"] svg { transform: rotate(90deg); }
  .check { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); cursor: pointer; }
  .check:disabled { cursor: default; }
  .empty { padding: 40px 18px; text-align: center; color: var(--muted); }
  .totals {
    display: flex; gap: 6px 20px; flex-wrap: wrap; padding: 12px 18px;
    font-size: 13px; color: var(--muted);
  }
  .totals b { color: var(--text); font-weight: 600; }
  #toast {
    position: fixed; left: 50%; bottom: 24px; transform: translate(-50%, 16px); opacity: 0;
    pointer-events: none; transition: opacity 0.2s, transform 0.2s;
    background: var(--text); color: var(--bg); padding: 10px 16px; border-radius: 8px;
    display: flex; gap: 14px; align-items: center; max-width: calc(100% - 32px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); font-size: 13px;
  }
  #toast.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
  #toast button { background: none; border: 0; color: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; padding: 0; white-space: nowrap; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 640px) {
    .row { grid-template-columns: 24px 24px minmax(0, 1fr) 60px 22px; padding-right: 10px; }
    .row.child { padding-left: 22px; }
    .date { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
</style>
</head>
<body>
<div class="app">
  <header class="top">
    <div class="brand">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 25h15a6 6 0 0 0 .8-11.9A8.5 8.5 0 0 0 8.4 11 7 7 0 0 0 9 25z"/>
        <path d="M19.5 16.5a4 4 0 0 0-7-1.5M12 13v2.2h2.2M12.5 19.5a4 4 0 0 0 7 1.5M20 23v-2.2h-2.2"/>
      </svg>
      <div>
        <h1>claude-sync</h1>
        <p id="machine">Loading…</p>
      </div>
    </div>
    <button id="sync-now" class="primary" type="button" disabled>Sync now</button>
  </header>

  <section class="card status" id="status" aria-live="polite"></section>

  <section class="card">
    <div class="panel-head">
      <h2>Choose what syncs on this computer</h2>
      <p class="hint">Unchecked conversations aren't downloaded to or uploaded from this computer; your other computers keep syncing them. New conversations sync unless their project is unchecked.</p>
    </div>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Search conversations and projects" aria-label="Search">
      <select id="filter" aria-label="Show">
        <option value="all">All conversations</option>
        <option value="on">Syncing</option>
        <option value="off">Not syncing</option>
      </select>
      <select id="sort" aria-label="Sort by">
        <option value="recent">Most recent</option>
        <option value="size">Largest</option>
        <option value="name">Name</option>
      </select>
    </div>
    <div id="tree" role="list"></div>
    <div class="totals" id="totals"></div>
  </section>
</div>
<div id="toast" role="status" aria-live="polite"></div>

<script nonce="__NONCE__">
(() => {
  const token = location.hash.slice(1);
  const $ = (id) => document.getElementById(id);
  const expanded = new Set();
  let state = null;
  let busy = false;
  let toastTimer = 0;

  const svg = (body, attrs) =>
    '<svg viewBox="0 0 16 16" aria-hidden="true" ' + (attrs || "") + ">" + body + "</svg>";
  const line = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    synced: svg('<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.9 8.2l2 2 4.2-4.4" fill="none" stroke="var(--surface)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'),
    upload: svg('<path d="M8 13V3.5M4.2 7.2 8 3.4l3.8 3.8"/>', line),
    download: svg('<path d="M8 3v9.5M4.2 8.8 8 12.6l3.8-3.8"/>', line),
    sync: svg('<path d="M13 6.4A5.2 5.2 0 0 0 3.5 5M3.2 2.4v2.8H6M3 9.6A5.2 5.2 0 0 0 12.5 11M12.8 13.6v-2.8H10"/>', line),
    online: svg('<path d="M4.6 12.6h6.9a3 3 0 0 0 .5-6 4 4 0 0 0-7.7-.9 3.5 3.5 0 0 0 .3 6.9z"/>', 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"'),
    skipped: svg('<circle cx="8" cy="8" r="6.2"/><path d="M3.7 12.3l8.6-8.6"/>', 'fill="none" stroke="currentColor" stroke-width="1.4"'),
    warn: svg('<path d="M8 1.6 15.2 14.4H.8z" fill="currentColor"/><path d="M8 6v3.8M8 11.8v.2" stroke="var(--surface)" stroke-width="1.6" stroke-linecap="round"/>'),
    folder: svg('<path d="M1.5 4.2c0-.7.5-1.2 1.2-1.2h3.4l1.5 1.6h5.7c.7 0 1.2.5 1.2 1.2v6.4c0 .7-.5 1.2-1.2 1.2H2.7c-.7 0-1.2-.5-1.2-1.2z"/>', 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"'),
    chat: svg('<path d="M2.5 3.8c0-.7.6-1.3 1.3-1.3h8.4c.7 0 1.3.6 1.3 1.3v5.9c0 .7-.6 1.3-1.3 1.3H6.5L3.8 13.4V11h0c-.7 0-1.3-.6-1.3-1.3z"/>', 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"'),
    memory: svg('<path d="M4 1.8h5.5L12.5 5v9.2H4z"/><path d="M9.3 1.8V5h3.2M6 8h4.5M6 10.5h4.5"/>', 'fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"'),
    chevron: svg('<path d="M6 3.5 10.5 8 6 12.5"/>', 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'),
  };
  const STATES = {
    "synced": { label: "Up to date", tone: "ok", icon: "synced" },
    "upload": { label: "Waiting to upload", tone: "accent", icon: "upload" },
    "download": { label: "Waiting to download", tone: "accent", icon: "download" },
    "skipped": { label: "Not syncing on this computer", tone: "muted", icon: "skipped" },
    "online": { label: "Only in storage, not on this computer", tone: "muted", icon: "online" },
    "too-big": { label: "Too large for the storage, so it isn't uploaded", tone: "warn", icon: "warn" },
  };

  function el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "icon") node.innerHTML = ICONS[value];
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children || []) if (child) node.append(child);
    return node;
  }

  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
  const total = (list) => list.reduce((sum, item) => sum + item.size, 0);

  function bytes(n) {
    if (n < 1024) return n + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
    return (n >= 100 ? Math.round(n) : n.toFixed(1)) + " " + units[i];
  }

  function when(ms) {
    if (!ms) return "";
    const date = new Date(ms);
    const now = new Date();
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ms >= today) return "Today " + time;
    if (ms >= today - 86400000) return "Yesterday " + time;
    const options = { month: "short", day: "numeric" };
    if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
    return date.toLocaleDateString([], options);
  }

  function conversationLabel(conversation) {
    return conversation.title || "Conversation " + conversation.key.split("/")[1].slice(0, 8);
  }

  function stateIcon(name) {
    const s = STATES[name];
    return el("span", { class: "state " + s.tone, title: s.label, role: "img", "aria-label": s.label, icon: s.icon });
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { "x-claude-sync-token": token, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  function toast(message, action) {
    const box = $("toast");
    box.replaceChildren(
      el("span", { text: message }),
      action ? el("button", { type: "button", text: action.label, onclick: action.run }) : null
    );
    box.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove("show"), 6000);
  }

  async function refresh() {
    try {
      state = await api("/api/state");
      render();
    } catch (error) {
      if (!state) fatal(error.message);
    }
  }

  async function select(body) {
    try {
      state = await api("/api/selection", body);
      render();
      toast("Saved. It takes effect at the next sync.", { label: "Sync now", run: syncNow });
    } catch (error) {
      toast("Couldn't save: " + error.message);
      refresh();
    }
  }

  async function syncNow() {
    if (busy) return;
    busy = true;
    render();
    try {
      state = await api("/api/sync", {});
      const result = state.result;
      if (result.busy) toast("Another sync is running. Try again when it finishes.");
      else if (result.error) toast("Sync failed: " + result.error);
      else toast("Synced: pulled " + result.pulled + ", pushed " + plural(result.pushed, "file"));
    } catch (error) {
      toast("Sync failed: " + error.message);
    }
    busy = false;
    render();
  }

  function fatal(message) {
    $("machine").textContent = "Not connected";
    $("status").replaceChildren(
      el("span", { class: "big err", icon: "warn" }),
      el("div", {}, [el("h2", { text: "Can't reach claude-sync" }), el("p", { text: message })])
    );
  }

  function renderStatus() {
    const conversations = state.projects.flatMap((p) => p.conversations).filter((c) => c.sync);
    const count = (name) => conversations.filter((c) => c.state === name).length;
    const pending = count("upload") + count("download");
    const tooBig = count("too-big");
    const result = state.lastSync;
    let icon, tone, title;

    if (busy || state.syncing) [icon, tone, title] = ["sync", "accent spin", "Syncing…"];
    else if (result && result.error) [icon, tone, title] = ["warn", "err", "The last sync failed"];
    else if (tooBig) [icon, tone, title] = ["warn", "warn", plural(tooBig, "conversation") + " too large to upload"];
    else if (pending) [icon, tone, title] = ["sync", "accent", plural(pending, "conversation") + " waiting to sync"];
    else [icon, tone, title] = ["synced", "ok", "You're up to date"];

    const lines = [
      state.listedAt
        ? "Storage checked " + when(state.listedAt).replace(/^(Today|Yesterday)/, (day) => day.toLowerCase()) + " · " + state.storage
        : "Not synced yet · " + state.storage,
    ];
    if (result && !busy) {
      if (result.error) lines.push(result.error);
      else lines.push("Last sync " + when(result.at).replace(/^(Today|Yesterday)/, (day) => day.toLowerCase()) + ": pulled " + result.pulled + ", pushed " + plural(result.pushed, "file"));
    }

    const body = el("div", {}, [el("h2", { text: title })].concat(lines.map((text) => el("p", { text }))));
    if (result && result.warnings && result.warnings.length && !busy) {
      body.append(el("details", {}, [
        el("summary", { text: plural(result.warnings.length, "warning") }),
        el("ul", {}, result.warnings.map((w) => el("li", { text: w }))),
      ]));
    }
    $("status").replaceChildren(el("span", { class: "big " + tone, icon }), body);
    $("sync-now").disabled = busy || state.syncing;
    $("sync-now").textContent = busy || state.syncing ? "Syncing…" : "Sync now";
  }

  function projectRow(project, open) {
    const all = project.conversations;
    const on = all.filter((c) => c.sync).length;
    const checked = project.sync && on === all.length;
    const none = !project.sync && on === 0;
    const label = project.label;
    const toggle = () => {
      if (expanded.has(project.name)) expanded.delete(project.name);
      else expanded.add(project.name);
      render();
    };

    const box = el("input", {
      type: "checkbox", class: "check", "aria-label": "Sync " + label,
      onclick: (event) => event.stopPropagation(),
      onchange: () => select({ project: project.name, sync: !checked }),
    });
    box.checked = checked;
    box.indeterminate = !checked && !none;

    const sub = project.path || (project.state === "online" ? "Only in storage" : project.name);
    return el("div", { class: "row project" + (none ? " off" : ""), role: "listitem", onclick: toggle }, [
      el("button", {
        type: "button", class: "chev", "aria-expanded": String(open), "aria-label": (open ? "Collapse " : "Expand ") + label,
        icon: "chevron", onclick: (event) => { event.stopPropagation(); toggle(); },
      }),
      box,
      el("div", { class: "name" }, [
        el("span", { class: "kind", icon: "folder" }),
        el("div", {}, [
          el("span", { class: "label", text: label, title: label }),
          el("small", { text: plural(all.length, "conversation") + " · " + sub, title: sub }),
        ]),
      ]),
      el("span", { class: "date", text: when(project.modified) }),
      el("span", { class: "size", text: bytes(project.size) }),
      stateIcon(project.state),
    ]);
  }

  function conversationRow(project, conversation) {
    const label = conversationLabel(conversation);
    const box = el("input", {
      type: "checkbox", class: "check", "aria-label": "Sync " + label,
      onchange: (event) => select({ project: project.name, conversation: conversation.key, sync: event.target.checked }),
    });
    box.checked = conversation.sync;

    return el("div", { class: "row child" + (conversation.sync ? "" : " off"), role: "listitem" }, [
      el("span"),
      box,
      el("div", { class: "name" }, [
        el("span", { class: "kind", icon: "chat" }),
        el("div", {}, [el("span", { class: "label", text: label, title: label })]),
      ]),
      el("span", { class: "date", text: when(conversation.modified) }),
      el("span", { class: "size", text: bytes(conversation.size) }),
      stateIcon(conversation.state),
    ]);
  }

  function otherFilesRow(project) {
    const other = project.otherFiles;
    const box = el("input", { type: "checkbox", class: "check", disabled: true, "aria-label": "Follows the project" });
    box.checked = project.sync;
    return el("div", { class: "row child" + (project.sync ? "" : " off"), role: "listitem" }, [
      el("span"),
      box,
      el("div", { class: "name" }, [
        el("span", { class: "kind", icon: "memory" }),
        el("div", {}, [
          el("span", { class: "label", text: "Memory and other project files" }),
          el("small", { text: plural(other.count, "file") + " · follows the project's checkbox" }),
        ]),
      ]),
      el("span", { class: "date" }),
      el("span", { class: "size", text: bytes(other.size) }),
      stateIcon(other.state),
    ]);
  }

  function renderTree() {
    const query = $("search").value.trim().toLowerCase();
    const filter = $("filter").value;
    const sort = $("sort").value;
    const has = (text) => !!text && text.toLowerCase().includes(query);
    const order = {
      recent: (a, b) => (b.modified || 0) - (a.modified || 0),
      size: (a, b) => b.size - a.size,
      name: (a, b) => a.label.localeCompare(b.label),
    }[sort];

    const visible = state.projects
      .map((project) => {
        const label = project.label;
        const nameMatch = !query || has(label) || has(project.path) || has(project.name);
        const conversations = project.conversations
          .filter((c) => filter === "all" || c.sync === (filter === "on"))
          .filter((c) => nameMatch || has(conversationLabel(c)))
          .map((c) => Object.assign({ label: conversationLabel(c) }, c))
          .sort(order);
        const shown = conversations.length > 0 || (nameMatch && (filter === "all" || project.sync === (filter === "on")));
        return shown && Object.assign({}, project, { label, conversations, nameMatch });
      })
      .filter(Boolean)
      .sort(order);

    const rows = [];
    for (const project of visible) {
      const open = expanded.has(project.name) || (!!query && !project.nameMatch);
      const full = state.projects.find((p) => p.name === project.name);
      rows.push(projectRow(full, open));
      if (!open) continue;
      for (const conversation of project.conversations) rows.push(conversationRow(full, conversation));
      if (full.otherFiles && filter === "all") rows.push(otherFilesRow(full));
    }

    if (rows.length === 0) {
      rows.push(el("div", { class: "empty", text: state.projects.length ? "Nothing matches." : "No conversations yet." }));
    }
    $("tree").replaceChildren(...rows);
  }

  function renderTotals() {
    const conversations = state.projects.flatMap((p) => p.conversations);
    const on = conversations.filter((c) => c.sync);
    const off = conversations.filter((c) => !c.sync);
    const stat = (label, list) =>
      el("span", {}, [label + " ", el("b", { text: plural(list.length, "conversation") }), " · " + bytes(total(list))]);
    $("totals").replaceChildren(stat("Syncing", on), stat("Not syncing", off));
  }

  function render() {
    if (!state) return;
    $("machine").textContent = "Conversations on " + state.machine;
    renderStatus();
    renderTree();
    renderTotals();
  }

  if (!token) {
    fatal("Open the link printed in the terminal by claude-sync dashboard.");
    return;
  }

  $("sync-now").addEventListener("click", syncNow);
  for (const id of ["search", "filter", "sort"]) $(id).addEventListener("input", render);
  // Hooks sync in the background as sessions start and end
  setInterval(() => { if (!busy && document.visibilityState === "visible") refresh(); }, 15000);
  window.addEventListener("focus", () => { if (!busy) refresh(); });
  refresh();
})();
</script>
</body>
</html>
`;
