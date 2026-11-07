// Moon and Tides Lab and Night Sky Lab open each other at the same moment and
// place (spec 221 section 13). A link can't carry them: the platform's create
// page rewrites its address before the app loads. So the link leaves a short
// note in this browser and the new tab picks it up. Both apps keep the same
// copy of this file.
const KEY = 'mytek-moon-handoff';
const FRESH_MS = 120000;

export function writeHandoff(from, h) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, from, at: Date.now(), ms: h.ms, lat: h.lat, lon: h.lon, name: h.name, zone: h.zone })); } catch { /* storage off: the link still opens the app */ }
}

// The note left by `from` in the last two minutes, or null.
export function readHandoff(from) {
  try {
    const h = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!h || h.from !== from || !(Date.now() - h.at < FRESH_MS)) return null;
    if (![h.ms, h.lat, h.lon].every(Number.isFinite) || typeof h.zone !== 'string') return null;
    return h;
  } catch { return null; }
}

export function clearHandoff() { try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ } }

// A guest on /try goes to the other app's /try; everyone else to a new project.
export function labUrl(id) {
  let onTry = false;
  try { onTry = window.top.location.pathname.startsWith('/try'); } catch { /* another origin above us */ }
  if (onTry) return '/try/' + id;
  return '/create?app=' + id + (/--dev\//.test(location.pathname) ? '--dev' : '');
}
