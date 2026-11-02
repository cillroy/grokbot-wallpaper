// Private feed: the office polls a feed the user hosts (a Cloudflare Worker, or anything that speaks the
// same HTTP contract). The link is …/#feed=<urlencoded base URL>&key=<read key>. Both values live in the
// fragment, so GitHub Pages never sees them. The key is sent only as Authorization: Bearer to that base.
//
// GET <base>/feed            the backlog, oldest first, on the first poll (no since)
// GET <base>/feed?since=<id> messages newer than that id, oldest first, every 5 s
// Each item is { id, time (unix seconds), event: "message", message: "<JSON string>" }.
// A failed poll waits 30 s and tries again. The last lines are cached in this browser so a quiet outage is not an empty office.
//
// Lines (one JSON object per message, at most 4 KB, anything else is dropped):
//   {"bot":"…","status":"working|idle|waiting_user|error|done","step":"…"}     a status change
//   {"roster":["Bot A","Bot B"]}                                                allowlist: only these bots are drawn
//     (latest roster wins; with no roster message yet, every status still creates a bot as before)
//   {"looks":{"Bot A":{"shape":"sphere","color":"#RRGGBB","accessory":"none"}}} how each bot's blob looks
//   {"type":"usage","total_used_pct":37,"resets_at":"…","bots":{"Bot A":4.1}}  the weekly limit meter
//   {"groups":{"Bot A":"Personal","Bot B":"Home IT"}}                         sidebar sections, one floor each
//   {"chat":{"Bot A":"grokbot://app/v1/agent?id=…"}}                         each bot's chat, for «Open chat»
//   {"floor_themes":{"Ranch":"office"}}                                       optional interior override
//   {"routines":{"bot":"Bot A","items":[{"name":"…","schedule":"…","next_run":"ISO"}]}}   a bot's routines
// On top of the server's state the office gets state.finished (done lines of the last 24 h, newest first) and
// state.routines (every bot's routines, soonest first), for the «Finished» and «Routines» panels.
import { StateStore, botIdFor } from './lib/state.js';

const MAX_LINE = 4096, KEEP = 600, TICK_MS = 30e3, DAY_MS = 24 * 3600e3;
const POLL_OK = 5000, POLL_ERR = 30000;
const HANDMADE = new Set(['grok-bot', 'jevopus', 'x-writer', 'banner-visuals', 'analytics-analyst', 'competitor-watch', 'qt-scout',
  'ideas-sparring', 'bookmarks-brain', 'codila-x-researcher', 'trendy-x', 'substack', 'x-ads-manager', 'warren-buffett', 'finance-team']);

/** `#feed=<urlencoded base>&key=<read key>` → { base, key }, else null. http is only allowed on localhost. */
export function feedFromHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  let params;
  try { params = new URLSearchParams(raw); } catch { return null; }
  const feed = params.get('feed');
  const key = params.get('key');
  if (!feed || !key) return null;
  let base;
  try {
    const u = new URL(feed);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
    base = (u.origin + u.pathname).replace(/\/+$/, '');
  } catch { return null; }
  if (key.length > 512) return null;
  return { base, key };
}

/**
 * Poll the private feed. onBatch(messages) gets each successful response, oldest first.
 * onStatus('offline') on a failed poll, onStatus(null) after a good one.
 * Returns a stop function. The first request omits since.
 */
export function startPrivateFeed({ base, key }, { onBatch, onStatus } = {}) {
  let lastId = null;
  let first = true;
  let timer = 0;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const since = !first && lastId != null ? lastId : null;
    first = false;
    const url = since != null ? `${base}/feed?since=${encodeURIComponent(since)}` : `${base}/feed`;
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      const tail = messages.length ? messages[messages.length - 1] : null;
      if (tail && tail.id != null) lastId = String(tail.id);
      onBatch?.(messages);
      onStatus?.(null);
      timer = setTimeout(tick, POLL_OK);
    } catch {
      onStatus?.('offline');
      timer = setTimeout(tick, POLL_ERR);
    }
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

/** Read the private feed into the office state. onStatus('offline' | null) for the small indicator. */
export function connectFeed({ base, key }, onState, onStatus) {
  const cacheKey = `bothq.feed.${base}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Sofia';
  const store = new StateStore({ tz, hasAvatar: (id) => HANDMADE.has(id) });
  const cfg = {};
  const routines = new Map();
  const floorThemes = {};
  let lines = [];
  const seen = new Set();
  let saveTimer = 0;

  try { lines = JSON.parse(localStorage.getItem(cacheKey)) || []; } catch { lines = []; }
  lines = lines.filter((l) => l && typeof l.id === 'string' && !seen.has(l.id) && seen.add(l.id))
    .sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : 1));
  for (const l of lines) ingest(l, true);
  if (lines.length) publish();

  startPrivateFeed({ base, key }, {
    onBatch(messages) {
      let changed = false;
      for (const m of messages) if (take(m)) changed = true;
      if (changed) publish();
    },
    onStatus,
  });
  setInterval(() => { const v = store.version, s = store.snapshot(); if (store.version !== v) onState(extras(s)); }, TICK_MS);

  function take(m) {
    if (m?.event !== 'message' || m.id == null) return false;
    const id = String(m.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    const l = { id, time: Number(m.time) || Date.now() / 1000, message: m.message };
    lines.push(l);
    if (lines.length > KEEP * 1.5) lines = lines.slice(-KEEP);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 2000);
    return ingest(l, false);
  }
  function ingest({ message, time }, replay) {
    if (typeof message !== 'string' || message.length > MAX_LINE) return false;
    let rec;
    try { rec = JSON.parse(message); } catch { return false; }
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false;
    const t = typeof rec.t === 'string' ? rec.t : new Date(time * 1000).toISOString();
    if (Array.isArray(rec.roster)) {
      store.setRoster(rec.roster, { t, replay });
      return true;
    }
    if (isMap(rec.looks)) {
      for (const [name, look] of Object.entries(rec.looks).slice(0, 400)) {
        if (store.roster && !store.roster.has(botIdFor(name))) continue;
        (cfg[name] ||= {}).look = look;
      }
      store.setBotsConfig(cfg);
      return true;
    }
    if (isMap(rec.groups)) {                             // {"groups":{"Bot A":"Personal"}}: each label is one floor, used as written
      for (const [name, team] of Object.entries(rec.groups).slice(0, 400)) {
        if (typeof team !== 'string' || !team.trim()) continue;
        if (store.roster && !store.roster.has(botIdFor(name))) continue;
        (cfg[name] ||= {}).floor = team.trim().slice(0, 40);
      }
      store.setBotsConfig(cfg);
      return true;
    }
    if (isMap(rec.chat)) {
      for (const [name, url] of Object.entries(rec.chat).slice(0, 400)) {
        if (typeof url !== 'string' || !/^(grokbot|https):\/\//i.test(url.trim())) continue;
        if (store.roster && !store.roster.has(botIdFor(name))) continue;
        (cfg[name] ||= {}).chat_url = url.trim();
      }
      store.setBotsConfig(cfg);
      return true;
    }
    if (isMap(rec.floor_themes)) {                       // {"floor_themes":{"Ranch":"office"}} — keys merge; "" or "auto" clears one
      for (const [name, id] of Object.entries(rec.floor_themes).slice(0, 40)) {
        if (typeof name !== 'string' || !name.trim()) continue;
        const keyName = name.trim().slice(0, 40);
        if (typeof id !== 'string' || !id.trim() || /^(auto)$/i.test(id.trim())) delete floorThemes[keyName];
        else floorThemes[keyName] = id.trim().toLowerCase().slice(0, 24);
      }
      return true;
    }
    if (isMap(rec.routines)) {
      const name = typeof rec.routines.bot === 'string' ? rec.routines.bot.trim().slice(0, 80) : '';
      if (!name || !Array.isArray(rec.routines.items)) return false;
      const id = botIdFor(name);
      if (store.roster && !store.roster.has(id)) return false;
      const items = rec.routines.items.slice(0, 50).filter(isMap).map((r) => ({
        routine: String(r.name ?? '').slice(0, 80), schedule: String(r.schedule ?? '').slice(0, 80),
        next_run: Number.isFinite(Date.parse(r.next_run)) ? new Date(r.next_run).toISOString() : null,
      })).filter((r) => r.routine);
      routines.set(id, { name, items });
      return true;
    }
    store.apply({ ...rec, t }, { replay });
    return true;
  }
  function extras(s) {
    const since = Date.now() - DAY_MS, finished = [];
    const allow = store.roster;
    for (let i = lines.length - 1; i >= 0 && finished.length < 100; i--) {
      const l = lines[i];
      if (l.time * 1000 < since) break;
      if (typeof l.message !== 'string' || l.message.length > MAX_LINE || !l.message.includes('"done"')) continue;
      let rec;
      try { rec = JSON.parse(l.message); } catch { continue; }
      if (rec?.status !== 'done' || typeof rec.bot !== 'string') continue;
      const id = botIdFor(rec.bot);
      if (allow && !allow.has(id)) continue;
      finished.push({ t: typeof rec.t === 'string' ? rec.t : new Date(l.time * 1000).toISOString(), bot: id, name: rec.bot.slice(0, 80), step: String(rec.step ?? '').slice(0, 80) });
    }
    s.floor_themes = { ...floorThemes };
    s.finished = finished;
    s.routines = [...routines].flatMap(([bot, { name, items }]) => {
      if (allow && !allow.has(bot)) return [];
      return items.map((r) => ({ bot, name, ...r }));
    }).sort((a, b) => (a.next_run ? Date.parse(a.next_run) : Infinity) - (b.next_run ? Date.parse(b.next_run) : Infinity));
    return s;
  }
  function publish() { store.commit(); onState(extras(store.snapshot())); }
  function save() { try { localStorage.setItem(cacheKey, JSON.stringify(lines.slice(-KEEP))); } catch { /* private mode: not cached */ } }
}

function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
