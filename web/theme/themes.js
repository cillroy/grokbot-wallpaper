// Theme registry. The built-in office is not a theme: it is what runs when nothing is selected, and none of
// the hooks below run, so its pixels stay put. A theme is a module (see ranch.js) plus one CATALOG row.
//
// The ntfy topic stays in the URL hash. A theme never goes there.
//   ?theme=<id>                  this visit. ?theme=office or ?theme=default forces the office.
//   localStorage bothq.theme     used when the query is absent. The picker writes it.
// An unknown id is ignored. ?time= still wins over a theme's fixed light (daylight.js).

const STORAGE_KEY = 'bothq.theme';

export const CATALOG = [
  { id: 'ranch', label: 'Hill Country' },
];

const LOADERS = {
  ranch: () => import('./ranch.js').then((m) => m.ranchTheme),
};

let current = null;

export function activeTheme() { return current; }

function known(id) {
  const v = String(id || '').trim().toLowerCase();
  return LOADERS[v] ? v : null;
}

/** The theme that should dress this visit, or null for the untouched office. */
export function selectedThemeId() {
  const q = new URLSearchParams(location.search);
  if (q.has('theme')) {
    const raw = (q.get('theme') || '').trim().toLowerCase();
    if (!raw || raw === 'office' || raw === 'default') return null;
    const id = known(raw);
    if (id) return id;
  }
  try { return known(localStorage.getItem(STORAGE_KEY)); }
  catch { return null; }
}

function ensureStylesheet(id, href) {
  let link = document.getElementById(id);
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.append(link);
  }
  if (link.getAttribute('href') !== href) link.href = href;
}

/** Apply the selected theme's CSS, font and sky before the scene is created. Null stays the office. */
export async function bootTheme() {
  const id = selectedThemeId();
  current = null;
  const root = document.documentElement;
  if (id && LOADERS[id]) {
    try {
      current = await LOADERS[id]();
      root.dataset.theme = current.id;
      if (current.css) ensureStylesheet('bothq-theme-css', current.css);
      if (current.fontHref) ensureStylesheet('bothq-theme-font', current.fontHref);
      if (current.sky) {
        const { setStudioBackdrop } = await import('../scene/studio.js');
        setStudioBackdrop(current.sky);
      }
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && current.themeColor) meta.setAttribute('content', current.themeColor);
    } catch (err) {
      console.warn('[theme] failed to load, staying on the office:', err);
      current = null;
      root.removeAttribute('data-theme');
    }
  } else {
    root.removeAttribute('data-theme');
  }
  ensureStylesheet('bothq-theme-picker', new URL('./picker.css', import.meta.url).href);
  window.bothq = Object.assign(window.bothq || {}, { theme: current?.id || 'office' });
  return current;
}

/** Compact menu in the top bar. Choosing reloads so the scene dresses itself once. No-op without a slot. */
export function mountThemePicker(slot) {
  if (!slot || slot.querySelector('.bhq-theme')) return;
  const label = document.createElement('label');
  label.className = 'bhq-theme bhq-surface';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Theme');
  select.title = 'Theme. The #topic in the link stays the ntfy channel.';
  const cur = selectedThemeId() || '';
  for (const opt of [{ id: '', label: 'Office' }, ...CATALOG]) {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.label;
    if (opt.id === cur) o.selected = true;
    select.append(o);
  }
  select.addEventListener('change', () => {
    const next = select.value;
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* private mode: the query still carries the choice */ }
    const url = new URL(location.href);
    if (next) url.searchParams.set('theme', next);
    else url.searchParams.delete('theme');
    location.assign(url.href);
  });
  const chev = document.createElement('i');
  chev.className = 'bhq-theme-chev';
  chev.setAttribute('aria-hidden', 'true');
  label.append(select, chev);
  slot.append(label);
}
