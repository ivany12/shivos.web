// Motor en la nube (Firebase Firestore). Sincroniza todas las pantallas al instante y sigue andando sin internet.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const cfg = window.FIREBASE_CONFIG;
const fb = initializeApp(cfg);
const auth = getAuth(fb);
const db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true });

const H = 3600000, D = 86400000;
const SINCE = (() => { const d = new Date(Date.now() - 2 * D); d.setHours(0, 0, 0, 0); return d.getTime(); })();
const mem = {}, parts = {};
const merge = c => { mem[c] = Object.assign({}, ...Object.values(parts[c] || {})); };
function listen(c, q, key = 'all') {
  return new Promise(res => {
    let first = true;
    onSnapshot(q, snap => {
      parts[c] = parts[c] || {};
      const m = {}; snap.forEach(d => m[d.id] = d.data());
      parts[c][key] = m; merge(c);
      if (first) { first = false; res(); }
      window.BUS_FIRE(c);
    }, err => { console.error('sync', c, err); if (first) { first = false; res(); } showGate('error', err.code); });
  });
}
const clean = o => JSON.parse(JSON.stringify(o));
const CloudDB = {
  kind: 'cloud',
  since: SINCE,
  list: c => Object.values(mem[c] || {}),
  get: (c, id) => (mem[c] || {})[id],
  put: (c, o) => {
    o.id = o.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); o.upd = Date.now();
    const v = clean(o);
    mem[c] = { ...(mem[c] || {}), [o.id]: v }; // lectura inmediata; el listener confirma enseguida
    setDoc(doc(db, c, o.id), v).catch(e => { console.error(e); window.toast && toast('No se pudo guardar: ' + e.code, 1); });
    window.BUS_FIRE(c);
    return o;
  },
  del: (c, id) => {
    Object.values(parts[c] || {}).forEach(m => delete m[id]); if (mem[c]) delete mem[c][id];
    deleteDoc(doc(db, c, id)); window.BUS_FIRE(c);
  },
  range: async (from, to) => { const s = await getDocs(query(collection(db, 'orders'), where('creado', '>=', from), where('creado', '<', to))); const l = []; s.forEach(d => l.push(d.data())); return l; },
  empty: () => !Object.keys(mem.settings || {}).length,
  dump: async () => { const o = {}; for (const c of ['settings', 'cats', 'prods', 'mods', 'users', 'orders', 'kds', 'cash', 'moves']) { const s = await getDocs(collection(db, c)); o[c] = {}; s.forEach(d => o[c][d.id] = d.data()); } return o; },
  load: o => Object.entries(o).forEach(([c, m]) => Object.values(m).forEach(v => CloudDB.put(c, v)))
};
window.CLOUD_SIGNOUT = () => signOut(auth).then(() => location.reload());
window.CLOUD_USER = () => auth.currentUser && auth.currentUser.email;

/* ───── pantalla de acceso (Google) ───── */
function showGate(kind, extra) {
  const app = document.getElementById('app');
  const msg = {
    login: `<p>Esta pantalla todavía no está habilitada.</p><button class="btn yes big" id="g">Entrar con Google</button><p class="muted">Se hace una sola vez por dispositivo, con la cuenta del local.</p>`,
    denied: `<p>La cuenta <b>${extra}</b> no tiene permiso.</p><button class="btn big" id="out">Probar con otra cuenta</button>`,
    error: `<p>No se pudo conectar con la base (${extra}).</p><button class="btn big" onclick="location.reload()">Reintentar</button>`,
    loading: `<p class="muted">Conectando…</p>`
  }[kind];
  if (kind === 'error' && window.__booted) { window.toast && toast('Problema de conexión con la base: ' + extra, 1); return; }
  app.innerHTML = `<div class="login"><div class="login-box" style="text-align:center"><div class="logo big">SHIVO'S</div>${msg}</div></div>`;
  const g = document.getElementById('g');
  if (g) g.onclick = () => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); signInWithPopup(auth, p).catch(e => { if (/popup/.test(e.code)) signInWithRedirect(auth, p); else showGate('error', e.code); }); };
  const o = document.getElementById('out');
  if (o) o.onclick = () => signOut(auth);
}

showGate('loading');
onAuthStateChanged(auth, async user => {
  if (!user) return showGate('login');
  if (window.__booted) return;
  showGate('loading');
  // prueba de permiso: si las reglas rechazan, la cuenta no está autorizada
  try { await getDocs(query(collection(db, 'settings'))); }
  catch (e) { return showGate(e.code === 'permission-denied' ? 'denied' : 'error', e.code === 'permission-denied' ? user.email : e.code); }
  await Promise.all([
    ...['settings', 'cats', 'prods', 'mods', 'users', 'cash'].map(c => listen(c, collection(db, c))),
    listen('orders', query(collection(db, 'orders'), where('creado', '>=', SINCE)), 'recent'),
    listen('orders', query(collection(db, 'orders'), where('estado', '==', 'abierta')), 'open'),
    listen('kds', query(collection(db, 'kds'), where('t', '>=', Date.now() - D))),
    listen('moves', query(collection(db, 'moves'), where('t', '>=', Date.now() - 40 * D))),
    listen('prints', query(collection(db, 'prints'), where('done', '==', false)))
  ]);
  window.DB_USE(CloudDB);
  window.__booted = true;
  window.startApp();
});
