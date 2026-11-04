import { TRAY_ICONS } from "../tray/icons.js";

/**
 * The dashboard's one page: plain HTML, CSS and JS, so it needs no build step.
 * It is a single String.raw literal, so the code inside avoids backticks and "${".
 */
export function dashboardPage(nonce: string): string {
  return PAGE.replace("__NONCE__", nonce).replaceAll("__ICON__", TRAY_ICONS.idle[64]);
}

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>claude-sync</title>
<link rel="icon" type="image/png" href="data:image/png;base64,__ICON__">
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
  html, body { height: 100%; }
  body {
    margin: 0;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.45 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
  }
  /* Like a desktop sync app: a sidebar, and a view where only the list scrolls */
  .shell { display: grid; grid-template-columns: 264px minmax(0, 1fr); height: 100vh; }
  .side {
    display: flex; flex-direction: column; gap: 16px; padding: 18px 14px; min-height: 0;
    overflow-x: hidden; overflow-y: auto; border-right: 1px solid var(--border);
  }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 0 4px; }
  .brand > div { min-width: 0; }
  .brand img { width: 36px; height: 36px; flex: none; }
  h1 { font-size: 18px; font-weight: 600; margin: 0; }
  .brand p { margin: 0; color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { font: inherit; }
  .primary {
    background: var(--accent); color: var(--accent-text); border: 0; border-radius: 6px;
    padding: 7px 18px; font-weight: 600; cursor: pointer; white-space: nowrap;
  }
  .primary:hover:not(:disabled) { filter: brightness(1.08); }
  .primary:disabled { opacity: 0.5; cursor: default; }
  .side .primary { width: 100%; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .status {
    display: flex; gap: 12px; align-items: flex-start; padding: 14px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow);
  }
  .status .big { width: 24px; height: 24px; flex: none; margin-top: 1px; }
  .status h2 { font-size: 14.5px; margin: 0 0 2px; font-weight: 600; }
  .status p { margin: 0; color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
  .status details { margin-top: 6px; font-size: 12.5px; }
  .status summary { cursor: pointer; color: var(--warn); }
  .status ul { margin: 6px 0 0; padding-left: 18px; color: var(--muted); max-height: 160px; overflow: auto; overflow-wrap: anywhere; }
  .nav { display: flex; flex-direction: column; gap: 2px; }
  .nav-item {
    position: relative; display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px;
    border: 0; border-radius: 6px; background: none; color: var(--text); cursor: pointer; text-align: left;
  }
  .nav-item:hover { background: var(--hover); }
  .nav-item[aria-current="page"] { background: var(--surface); font-weight: 600; box-shadow: var(--shadow); }
  .nav-item[aria-current="page"]::before {
    content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; border-radius: 2px; background: var(--accent);
  }
  .nav-item [data-icon] { width: 16px; height: 16px; color: var(--muted); flex: none; }
  .nav-item [data-icon] svg { display: block; width: 100%; height: 100%; }
  .nav-item .count { margin-left: auto; color: var(--muted); font-size: 12px; font-weight: 400; }
  .nav-item .count.warn { color: var(--warn); }
  .main { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--surface); }
  .view { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .view[hidden] { display: none; }
  .view-head { padding: 22px 24px 6px; }
  .view-head h2 { font-size: 20px; margin: 0 0 4px; font-weight: 600; }
  .hint { margin: 0; color: var(--muted); font-size: 13px; max-width: 80ch; }
  .list, .scroll { flex: 1; min-height: 0; overflow-y: auto; }
  .toolbar { display: flex; gap: 8px; padding: 10px 24px 12px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
  .toolbar input, .toolbar select {
    font: inherit; color: var(--text); background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px;
  }
  .toolbar input { flex: 1 1 220px; min-width: 0; }
  .row {
    display: grid; grid-template-columns: 26px 26px minmax(0, 1fr) 116px 72px 26px 54px;
    align-items: center; gap: 4px; padding: 6px 18px 6px 16px; min-height: 46px;
    border-bottom: 1px solid var(--border);
  }
  .row:hover { background: var(--hover); }
  .row.child { padding-left: 44px; min-height: 40px; }
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
    display: flex; gap: 6px 20px; flex-wrap: wrap; padding: 10px 24px;
    font-size: 13px; color: var(--muted); border-top: 1px solid var(--border);
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
  /* Narrow windows: the sidebar becomes a bar across the top */
  @media (max-width: 760px) {
    .shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .side { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 12px; border-right: 0; border-bottom: 1px solid var(--border); overflow: visible; }
    .brand { flex: 1; }
    .side .primary { width: auto; }
    .status { order: 3; flex-basis: 100%; padding: 8px 10px; }
    .nav { order: 4; flex-basis: 100%; flex-direction: row; }
    .nav-item { width: auto; }
    .view-head { padding: 14px 16px 4px; }
    .toolbar { padding: 8px 16px 10px; }
    .totals { padding: 8px 16px; }
  }
  @media (max-width: 640px) {
    .row { grid-template-columns: 24px 24px minmax(0, 1fr) 60px 22px 54px; padding-right: 10px; padding-left: 10px; }
    .row.child { padding-left: 22px; }
    .date { display: none; }
  }
  .actions { display: flex; justify-content: flex-end; gap: 2px; opacity: 0; transition: opacity 0.1s; }
  .row:hover .actions, .row:focus-within .actions { opacity: 1; }
  @media (hover: none) { .actions { opacity: 1; } }
  .icon-button {
    border: 0; background: none; color: var(--muted); width: 24px; height: 24px; border-radius: 4px;
    display: grid; place-items: center; cursor: pointer; padding: 0;
  }
  .icon-button:hover { background: var(--border); color: var(--text); }
  .icon-button.danger:hover { color: var(--err); }
  .icon-button svg { width: 15px; height: 15px; }
  .cleanup { margin: -6px 0 18px; }
  .cleanup label { display: flex; align-items: center; gap: 8px; }
  .cleanup input[type="number"] {
    width: 80px; font: inherit; color: var(--text); background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px;
  }
  dialog .cleanup p { margin: 10px 0 0; color: var(--text); font-weight: 600; }
  .choices { display: flex; flex-direction: column; gap: 8px; margin: 0 0 16px; }
  .cleanup .choices { margin: 12px 0 0; }
  .choices label {
    display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; cursor: pointer;
    border: 1px solid var(--border); border-radius: 6px;
  }
  .choices label:has(input:checked) { border-color: var(--accent); }
  .choices label:has(input:disabled) { opacity: 0.55; cursor: default; }
  .choices input { margin: 3px 0 0; accent-color: var(--accent); }
  .choices strong { display: block; font-weight: 600; }
  .choices small { display: block; color: var(--muted); font-size: 12.5px; }
  .setting { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; border-top: 1px solid var(--border); }
  @media (max-width: 760px) { .setting { padding: 12px 16px; } }
  .setting-text { min-width: 0; }
  .setting-text strong { display: block; font-weight: 600; }
  .setting-text p { margin: 2px 0 0; color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
  .setting-text a { color: var(--accent); }
  .setting-text .warn-text { color: var(--warn); }
  .secondary {
    background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 6px 14px; cursor: pointer; white-space: nowrap;
  }
  .secondary:hover { background: var(--hover); }
  .secondary.small { padding: 2px 10px; font-size: 12.5px; }
  .switch {
    appearance: none; width: 40px; height: 20px; border-radius: 10px; margin: 0; flex: none;
    background: var(--border); position: relative; cursor: pointer; transition: background 0.15s;
  }
  .switch::after {
    content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%;
    background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: left 0.15s;
  }
  .switch:checked { background: var(--accent); }
  .switch:checked::after { left: 23px; }
  .mappings { margin: 6px 0 0; padding: 0; list-style: none; }
  .mappings li { display: flex; gap: 10px; align-items: center; font-size: 13px; padding: 3px 0; overflow-wrap: anywhere; }
  .mapping-form { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .mapping-form input {
    font: inherit; font-size: 13px; color: var(--text); background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; flex: 1 1 180px; min-width: 0;
  }
  dialog {
    border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text);
    padding: 20px; width: min(460px, calc(100% - 32px)); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.4); }
  dialog h2 { margin: 0 0 8px; font-size: 16px; }
  dialog p { margin: 0 0 18px; color: var(--muted); }
  .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; }
  .primary.danger { background: #c42b1c; color: #fff; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
</style>
</head>
<body>
<div class="shell">
  <aside class="side">
    <div class="brand">
      <img src="data:image/png;base64,__ICON__" alt="">
      <div>
        <h1>claude-sync</h1>
        <p id="machine">Loading…</p>
      </div>
    </div>
    <section class="status" id="status" aria-live="polite"></section>
    <button id="sync-now" class="primary" type="button" disabled>Sync now</button>
    <nav class="nav" aria-label="Views">
      <button type="button" class="nav-item" data-view="conversations" aria-current="page"><span data-icon="chat"></span>Conversations<span class="count" id="count"></span></button>
      <button type="button" class="nav-item" data-view="settings"><span data-icon="sliders"></span>Settings<span class="count" id="settings-alert"></span></button>
    </nav>
  </aside>

  <main class="main">
  <section class="view" id="view-conversations" aria-labelledby="conversations-title">
    <header class="view-head">
      <h2 id="conversations-title">Choose what syncs on this computer</h2>
      <p class="hint">Unchecked conversations aren't downloaded to or uploaded from this computer; your other computers keep syncing them. New conversations sync unless their project is unchecked.</p>
    </header>
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
      <button type="button" class="secondary" id="clean-up">Clean up…</button>
    </div>
    <div class="list" id="tree" role="list"></div>
    <footer class="totals" id="totals"></footer>
  </section>

  <section class="view" id="view-settings" aria-labelledby="settings-title" hidden>
    <header class="view-head">
      <h2 id="settings-title">Settings</h2>
      <p class="hint">How claude-sync works on this computer.</p>
    </header>
    <div class="scroll" id="settings"></div>
  </section>
  </main>
</div>
<div id="toast" role="status" aria-live="polite"></div>
<dialog id="dialog" aria-labelledby="dialog-title">
  <h2 id="dialog-title"></h2>
  <p id="dialog-text"></p>
  <div id="dialog-extra"></div>
  <div class="dialog-buttons">
    <button type="button" class="secondary" id="dialog-cancel">Cancel</button>
    <button type="button" class="primary" id="dialog-ok">OK</button>
  </div>
</dialog>

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
    trash: svg('<path d="M2.8 4.3h10.4M6.3 4.3V2.8h3.4v1.5M4.3 4.3l.6 8.9h6.2l.6-8.9M6.7 6.9v4.1M9.3 6.9v4.1"/>', line),
    sliders: svg('<path d="M2.5 4.5h6.8M12.7 4.5h.8M2.5 11.5h.8M6.7 11.5h6.8"/><circle cx="11" cy="4.5" r="1.7"/><circle cx="5" cy="11.5" r="1.7"/>', line),
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

  // When a conversation last had a message: the date the list shows and clean-up goes
  // by. A file's own date changes whenever sync rewrites it, so it's only a fallback.
  const activity = (conversation) => conversation.lastMessage || conversation.modified;
  const projectActivity = (project) =>
    Math.max(0, ...project.conversations.map(activity).filter(Boolean)) || project.modified;

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
    box.replaceChildren(...[
      el("span", { text: message }),
      action ? el("button", { type: "button", text: action.label, onclick: action.run }) : null,
    ].filter(Boolean));
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

  // Asks before something that can't be undone; resolves to true to go ahead. The
  // extra element goes under the text, and opened() runs once the dialog shows.
  function ask(title, text, confirm, danger, extra, opened) {
    const dialog = $("dialog");
    $("dialog-title").textContent = title;
    $("dialog-text").textContent = text;
    $("dialog-extra").replaceChildren(...(extra ? [extra] : []));
    $("dialog-ok").textContent = confirm;
    $("dialog-ok").className = "primary" + (danger ? " danger" : "");
    $("dialog-ok").disabled = false;
    return new Promise((resolve) => {
      const done = (answer) => { dialog.close(); resolve(answer); };
      $("dialog-ok").onclick = () => done(true);
      $("dialog-cancel").onclick = () => done(false);
      dialog.oncancel = () => resolve(false);
      dialog.showModal();
      if (opened) opened();
    });
  }

  // Runs a long action with the status card saying what's happening
  async function working(label, action) {
    busy = label;
    render();
    try {
      return await action();
    } finally {
      busy = false;
      render();
    }
  }

  // Removed here only, a conversation stays in storage and Download brings it back;
  // deleted everywhere, it's gone from storage too
  async function remove(conversations, everywhere) {
    const keys = conversations.map((c) => c.key);
    try {
      state = await working(everywhere ? "Deleting…" : "Removing…", () => api("/api/delete", { keys, storage: everywhere }));
      const result = state.result;
      const done = everywhere
        ? "Deleted " + plural(result.deleted, "conversation") + " from this computer and storage"
        : "Removed " + plural(result.deleted, "conversation") + " from this computer; Download brings them back";
      if (result.busy) toast("A sync is running. Try again when it finishes.");
      else if (result.deleted && result.error) toast(done + ". " + result.error);
      else if (result.error) toast(result.error);
      else toast(done);
    } catch (error) {
      toast("Couldn't delete: " + error.message);
    }
    render();
  }

  // The two ways to delete. Removing here only needs the conversation to be fully in
  // storage, or it would be lost.
  function deleteChoice(canKeepStored, changed) {
    const here = el("input", { type: "radio", name: "where", value: "here" });
    const everywhere = el("input", { type: "radio", name: "where", value: "everywhere" });
    here.checked = canKeepStored;
    here.disabled = !canKeepStored;
    everywhere.checked = !canKeepStored;
    for (const input of [here, everywhere]) input.addEventListener("change", () => changed && changed());
    const option = (input, title, text) =>
      el("label", {}, [input, el("span", {}, [el("strong", { text: title }), el("small", { text })])]);
    return {
      element: el("div", { class: "choices" }, [
        option(here, "Remove from this computer", canKeepStored
          ? "It stays in your storage, and Download brings it back."
          : "Only once it's fully synced, so nothing is lost."),
        option(everywhere, "Delete from this computer and storage", "Your other computers keep their own copy."),
      ]),
      everywhere: () => everywhere.checked,
    };
  }

  async function deleteOne(conversation) {
    const choice = deleteChoice(conversation.state === "synced");
    const sure = await ask(
      "Delete this conversation?",
      "“" + conversationLabel(conversation) + "”. If it's open in Claude Code, close it first.",
      "Delete", true, choice.element
    );
    if (sure) await remove([conversation], choice.everywhere());
  }

  async function restore(conversation) {
    try {
      state = await working("Downloading…", () => api("/api/restore", { keys: [conversation.key] }));
      const result = state.result;
      if (result.busy) toast("A sync is running. Try again when it finishes.");
      else if (result.error) toast("Couldn't download: " + result.error);
      else toast("Downloaded “" + conversationLabel(conversation) + "”");
    } catch (error) {
      toast("Couldn't download: " + error.message);
    }
    render();
  }

  async function cleanUp() {
    const days = el("input", { type: "number", min: "1", value: "90", "aria-label": "Days" });
    const summary = el("p");
    let choice;
    const candidates = () => {
      const cutoff = Date.now() - Math.max(1, Number(days.value) || 0) * 86400000;
      // Conversations on this computer, dated like the list; removing them here only
      // takes those fully in storage
      return state.projects.flatMap((p) => p.conversations)
        .filter((c) => c.state !== "online" && (activity(c) || Infinity) < cutoff)
        .filter((c) => choice.everywhere() || c.state === "synced");
    };
    const update = () => {
      const list = candidates();
      summary.textContent = list.length ? plural(list.length, "conversation") + " · " + bytes(total(list)) : "No conversations that old.";
      $("dialog-ok").textContent = list.length ? (choice.everywhere() ? "Delete " : "Remove ") + plural(list.length, "conversation") : "Delete";
      $("dialog-ok").disabled = list.length === 0;
    };
    choice = deleteChoice(true, update);
    days.addEventListener("input", update);

    const sure = await ask(
      "Clean up old conversations",
      "The conversations on this computer whose latest message is older than this:",
      "Delete", true,
      el("div", { class: "cleanup" }, [el("label", {}, ["No message for", days, "days"]), choice.element, summary]),
      update
    );
    if (sure) await remove(candidates(), choice.everywhere());
  }

  // Runs an action on the server, then shows the state it answers with
  async function act(path, body, success) {
    try {
      state = await api(path, body || {});
      render();
      if (success) toast(success);
      return true;
    } catch (error) {
      toast(error.message);
      refresh();
      return false;
    }
  }

  const button = (label, onclick, extra) =>
    el("button", { type: "button", class: "secondary" + (extra ? " " + extra : ""), text: label, onclick });

  async function copyKey() {
    const sure = await ask(
      "Copy the encryption key?",
      "With this key and access to your storage, anyone can read every synced conversation. Paste it only into claude-sync on your other computer, then copy something else to clear it from the clipboard.",
      "Copy key"
    );
    if (!sure) return;
    try {
      const { key } = await api("/api/key", {});
      await navigator.clipboard.writeText(key);
      toast("Encryption key copied to the clipboard");
    } catch (error) {
      toast("Couldn't copy the key: " + error.message);
    }
  }

  let addingFolder = false;
  let settingsShown = "";

  function setting(title, description, control) {
    return el("div", { class: "setting" }, [
      el("div", { class: "setting-text" }, [el("strong", { text: title })].concat(description)),
      control,
    ]);
  }

  function folderSetting(folders) {
    const list = folders.length
      ? el("ul", { class: "mappings" }, folders.map((f) => el("li", {}, [
          el("span", { text: f.other + " on your other computers is " + f.here + " here" }),
          button("Remove", () => act("/api/folders/remove", { other: f.other }, "Folder mapping removed"), "small"),
        ])))
      : el("p", { text: "Your projects are in the same folders as on your other computers." });
    const parts = [list];

    if (addingFolder) {
      const other = el("input", { placeholder: "On your other computers, e.g. ~/Workspace", "aria-label": "Folder on your other computers" });
      const here = el("input", { placeholder: "On this computer, e.g. D:\\Projects", "aria-label": "Folder on this computer" });
      const add = async () => {
        if (await act("/api/folders/add", { other: other.value, here: here.value }, "Folder mapping added")) {
          addingFolder = false;
          settingsShown = "";
          render();
        }
      };
      parts.push(el("div", { class: "mapping-form" }, [other, here, button("Add", add), button("Cancel", () => { addingFolder = false; settingsShown = ""; render(); })]));
      parts.push(el("p", { text: "Add it before projects from that folder first sync here: conversations already synced to another folder aren't moved." }));
    }
    const control = addingFolder ? null : button("Add folder", () => { addingFolder = true; settingsShown = ""; render(); });
    return setting("Project folders", parts, control);
  }

  function renderSettings() {
    const s = state.settings;
    // Redrawn only when something changed, so a refresh doesn't clear what's being typed
    const shown = JSON.stringify([s, state.storage, state.storageLink, state.machine]);
    if (shown === settingsShown) return;
    settingsShown = shown;

    const storage = state.storageLink
      ? el("a", { href: state.storageLink, target: "_blank", rel: "noreferrer", text: state.storage })
      : state.storage;

    const startup = el("input", {
      type: "checkbox", class: "switch", role: "switch", "aria-label": "Start claude-sync when you log in",
      onchange: (event) => act("/api/startup", { enabled: event.target.checked },
        event.target.checked ? "claude-sync will start when you log in" : "claude-sync won't start when you log in"),
    });
    startup.checked = s.startAtLogin;

    const hooks = s.hooks;
    const hooksText = hooks.state === "missing"
      ? "Off: Claude Code doesn't sync when sessions start and end. Repair turns it on."
      : hooks.state === "broken"
        ? "Broken: Claude Code runs " + hooks.missing + ", which no longer exists. Repair points it at this claude-sync."
        : hooks.otherCopy
          ? "On, using another copy of claude-sync on this computer. Repair switches to this one."
          : "On: Claude Code syncs when a session starts and ends.";
    const hooksOk = hooks.state === "ok" && !hooks.otherCopy;

    const conflicts = s.conflicts === 1 ? "1 copy" : s.conflicts + " copies";
    // A dot on the menu entry when a setting needs a look
    const needsLook = !hooksOk || s.conflicts > 0;
    $("settings-alert").textContent = needsLook ? "●" : "";
    $("settings-alert").className = "count" + (needsLook ? " warn" : "");
    $("settings-alert").title = needsLook ? "Something in Settings needs a look" : "";

    const history = s.canCompact
      ? setting("Storage history", [el("p", {
          text: "Your git storage keeps every old version of every conversation. Compacting keeps only the current files, in your storage and on this computer. Run it on your other computers afterwards to free the space there too.",
        })], button("Compact…", compact))
      : null;

    $("settings").replaceChildren(...[
      setting("Storage", [el("p", {}, [storage, " · this computer is " + state.machine])]),
      setting("Start when you log in", [el("p", { text: "Shows the claude-sync icon every time you log in." })], startup),
      setting("Sync with Claude Code", [el("p", { class: hooksOk ? "" : "warn-text", text: hooksText })],
        hooksOk ? null : button("Repair", () => act("/api/hooks", {}, "Claude Code will sync when sessions start and end"))),
      setting("Encryption key", [el("p", { text: "Your other computers need it to read your conversations. It's copied without being shown." })],
        button("Copy key", copyKey)),
      folderSetting(s.folders),
      setting("Conflict copies", [el("p", {
        text: s.conflicts
          ? conflicts + " set aside when two computers changed the same file. Delete them once you've checked them."
          : "None: no copies have been set aside.",
      })], s.conflicts ? button("Open folder", () => act("/api/conflicts/open", {})) : null),
      history,
    ].filter(Boolean));
  }

  async function compact() {
    const sure = await ask(
      "Compact your storage?",
      "Keeps only the current version of each file in your storage and drops every older one for good. Your conversations themselves don't change, and your other computers pick it up at their next sync.",
      "Compact", true
    );
    if (!sure) return;
    try {
      state = await working("Compacting…", () => api("/api/compact", {}));
      const result = state.result;
      if (result.busy) toast("A sync is running. Try again when it finishes.");
      else if (result.error) toast("Couldn't compact: " + result.error);
      else toast("Compacted: this computer's copy went from " + bytes(result.before) + " to " + bytes(result.after));
    } catch (error) {
      toast("Couldn't compact: " + error.message);
    }
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

    if (busy || state.syncing) [icon, tone, title] = ["sync", "accent spin", typeof busy === "string" ? busy : "Syncing…"];
    else if (result && result.error) [icon, tone, title] = ["warn", "err", "The last sync failed"];
    else if (tooBig) [icon, tone, title] = ["warn", "warn", plural(tooBig, "conversation") + " too large to upload"];
    else if (pending) [icon, tone, title] = ["sync", "accent", plural(pending, "conversation") + " waiting to sync"];
    else [icon, tone, title] = ["synced", "ok", "You're up to date"];

    const lines = [
      state.listedAt
        ? "Storage checked " + when(state.listedAt).replace(/^(Today|Yesterday)/, (day) => day.toLowerCase())
        : "Not synced yet",
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
    $("sync-now").textContent = typeof busy === "string" ? busy : busy || state.syncing ? "Syncing…" : "Sync now";
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
      el("span", { class: "date", text: when(projectActivity(project)), title: "Latest message" }),
      el("span", { class: "size", text: bytes(project.size) }),
      stateIcon(project.state),
      el("span"),
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
      el("span", { class: "date", text: when(activity(conversation)), title: "Latest message" }),
      el("span", { class: "size", text: bytes(conversation.size) }),
      stateIcon(conversation.state),
      el("span", { class: "actions" }, [
        // Synced here once, then removed by Claude Code's cleanup or by hand
        conversation.sync && conversation.state === "online"
          ? el("button", { type: "button", class: "icon-button", title: "Download to this computer", "aria-label": "Download " + label, icon: "download", onclick: () => restore(conversation) })
          : null,
        el("button", { type: "button", class: "icon-button danger", title: "Delete", "aria-label": "Delete " + label, icon: "trash", onclick: () => deleteOne(conversation) }),
      ]),
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
      el("span"),
    ]);
  }

  function renderTree() {
    const query = $("search").value.trim().toLowerCase();
    const filter = $("filter").value;
    const sort = $("sort").value;
    const has = (text) => !!text && text.toLowerCase().includes(query);
    const order = {
      recent: (a, b) => (b.activity || 0) - (a.activity || 0),
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
          .map((c) => Object.assign({ label: conversationLabel(c), activity: activity(c) }, c))
          .sort(order);
        const shown = conversations.length > 0 || (nameMatch && (filter === "all" || project.sync === (filter === "on")));
        return shown && Object.assign({}, project, { label, conversations, nameMatch, activity: projectActivity(project) });
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
    $("count").textContent = String(conversations.length);
  }

  function show(view) {
    for (const item of document.querySelectorAll(".nav-item")) {
      if (item.dataset.view === view) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    $("view-conversations").hidden = view !== "conversations";
    $("view-settings").hidden = view !== "settings";
  }

  function render() {
    if (!state) return;
    $("machine").textContent = "Conversations on " + state.machine;
    renderStatus();
    renderTree();
    renderTotals();
    renderSettings();
  }

  if (!token) {
    fatal("Open the link printed in the terminal by claude-sync dashboard.");
    return;
  }

  // Clicking the tray icon again opens a fresh window: the older ones close, so there's
  // only ever one (a browser may refuse to close a tab it didn't open by script)
  if ("BroadcastChannel" in window) {
    const windows = new BroadcastChannel("claude-sync-dashboard");
    windows.onmessage = (event) => { if (event.data === "opened") window.close(); };
    windows.postMessage("opened");
  }

  $("sync-now").addEventListener("click", syncNow);
  $("clean-up").addEventListener("click", cleanUp);
  for (const item of document.querySelectorAll(".nav-item")) {
    const icon = item.querySelector("[data-icon]");
    icon.innerHTML = ICONS[icon.dataset.icon];
    item.addEventListener("click", () => show(item.dataset.view));
  }
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
