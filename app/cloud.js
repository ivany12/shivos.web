// Morfi · motor en la nube (Firebase). Multi-local: cada restaurante en tenants/{id}. Sincroniza al instante y anda sin internet.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocs, getDoc, updateDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const fb = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(fb);
const db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true });
getRedirectResult(auth).catch(e => console.warn('redirect', e.code));

const D = 86400000;
const startOf = days => { const d = new Date(Date.now() - days * D); d.setHours(0, 0, 0, 0); return d.getTime(); };
let TID = null, TENANT = null;
const col = c => collection(db, 'tenants', TID, c);
const mem = {}, parts = {};
const merge = c => { mem[c] = Object.assign({}, ...Object.values(parts[c] || {})); };
const clean = o => JSON.parse(JSON.stringify(o));

function listen(c, q, key = 'all') {
  return new Promise(res => {
    let first = true;
    onSnapshot(q, snap => {
      parts[c] = parts[c] || {};
      const m = {}; snap.forEach(d => m[d.id] = d.data());
      parts[c][key] = m; merge(c);
      if (first) { first = false; res(); }
      window.BUS_FIRE(c);
    }, err => { console.error('sync', c, err); if (first) { first = false; res(); } if (window.__started) toast('Problema de conexión: ' + err.code, 1); });
  });
}
const CloudDB = {
  kind: 'cloud',
  since: startOf(2),
  list: c => Object.values(mem[c] || {}),
  get: (c, id) => (mem[c] || {})[id],
  put: (c, o) => {
    o.id = o.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); o.upd = Date.now();
    const v = clean(o);
    mem[c] = { ...(mem[c] || {}), [o.id]: v };
    setDoc(doc(db, 'tenants', TID, c, o.id), v).catch(e => { console.error(e); toast('No se pudo guardar: ' + e.code, 1); });
    window.BUS_FIRE(c);
    return o;
  },
  del: (c, id) => { Object.values(parts[c] || {}).forEach(m => delete m[id]); if (mem[c]) delete mem[c][id]; deleteDoc(doc(db, 'tenants', TID, c, id)); window.BUS_FIRE(c); },
  range: async (c, field, from, to) => { const s = await getDocs(query(col(c), where(field, '>=', from), where(field, '<', to))); const l = []; s.forEach(d => l.push(d.data())); return l; },
  empty: () => !Object.keys(mem.settings || {}).length,
  dump: async () => { const o = {}; for (const c of COLS) { if (c === 'prints') continue; const s = await getDocs(col(c)); o[c] = {}; s.forEach(d => o[c][d.id] = d.data()); } return o; },
  load: o => Object.entries(o).forEach(([c, m]) => { if (COLS.includes(c)) Object.values(m).forEach(v => CloudDB.put(c, v)); })
};
const email = () => (auth.currentUser?.email || '').toLowerCase();
window.CLOUD_USER = email;
window.CLOUD_SIGNOUT = () => { localStorage.removeItem('morfi_tid'); signOut(auth).then(() => location.reload()); };
window.TENANT_SWITCH = () => { localStorage.removeItem('morfi_tid'); sessionStorage.removeItem('morfi_me'); location.reload(); };
window.PUBLIC_URL = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'carta.html?r=' + TID;
window.TENANT_MEMBERS = () => TENANT && {
  list: TENANT.members || [], owner: TENANT.owner, canEdit: TENANT.owner === email(),
  add: e => updateDoc(doc(db, 'tenants', TID), { members: arrayUnion(e) }).then(() => { TENANT.members = [...new Set([...(TENANT.members || []), e])]; }).catch(err => toast('No se pudo: ' + err.code, 1)),
  remove: e => updateDoc(doc(db, 'tenants', TID), { members: arrayRemove(e) }).then(() => { TENANT.members = TENANT.members.filter(x => x !== e); }).catch(err => toast('No se pudo: ' + err.code, 1))
};

/* ───── pantallas previas: bienvenida, elegir local, crear local ───── */
const appEl = () => document.getElementById('app');
const esc2 = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function login() {
  const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  signInWithPopup(auth, p).catch(e => { if (/popup-blocked|cancelled-popup|operation-not-supported/.test(e.code)) signInWithRedirect(auth, p); else if (e.code !== 'auth/popup-closed-by-user') alertBox('No se pudo entrar: ' + e.code); });
}
function alertBox(t) { const a = document.querySelector('.gate-msg'); if (a) a.textContent = t; }
function landing() {
  appEl().innerHTML = `<div class="landing"><header class="l-top"><div class="brand"><span class="dot"></span><div><b>Morfi</b><small>Gestión gastronómica</small></div></div><button class="btn ghost" id="g2">Ingresar</button></header>
    <section class="l-hero"><h1>Tu restaurante, en una sola pantalla.</h1><p>Salón, pedidos, delivery, cocina, caja, stock, compras, clientes, reservas, personal y tu propia tienda online sin comisiones. En la tablet, en el celu y en la compu, sincronizado al instante y funcionando aunque se corte internet.</p>
    <div class="quick c"><button class="btn pri big" id="g">Entrar con Google</button><a class="btn big" href="?demo=1">Probar la demo</a></div><p class="gate-msg muted"></p></section>
    <section class="l-feat">${[
      ['Salón y mesas', 'Plano por zonas, tiempos, mozos, juntar y mover mesas, precuenta con propina sugerida.'],
      ['Pedidos y delivery', 'Mostrador, teléfono, WhatsApp, PedidosYa, Rappi. Clientes con dirección, zonas de envío y repartidores.'],
      ['Cocina sin papeles', 'Pantalla de cocina por estación (cocina, barra), tiempos, alertas sonoras y resumen de producción.'],
      ['Caja y cobros', 'Pagos divididos y parciales, varios medios, cuenta corriente, arqueo ciego y cierre impreso.'],
      ['Stock con recetas', 'Cada venta descuenta insumos. Costos, margen por plato, mermas, conteo y lista de compras por proveedor.'],
      ['Tienda online y QR', 'Carta digital con pedidos para retiro, delivery o desde la mesa. Te llegan directo, sin comisión.'],
      ['Compras y gastos', 'Proveedores, facturas, saldos a pagar y estado de resultados.'],
      ['Equipo', 'Usuarios con PIN y roles, fichaje de entrada y salida, horas trabajadas y ranking de ventas.']
    ].map(([t, d]) => `<div class="card"><b>${t}</b><span class="muted">${d}</span></div>`).join('')}</section>
    <footer class="l-foot muted">Morfi · hecho en Argentina</footer></div>`;
  document.getElementById('g').onclick = login; document.getElementById('g2').onclick = login;
}
function gate(html) { appEl().innerHTML = `<div class="login"><div class="login-box gate">${html}</div></div>`; }
async function chooser(list) {
  gate(`<div class="brand big"><span class="dot"></span><div><b>Elegí el local</b><small>${esc2(email())}</small></div></div>
    <div class="who">${list.map(t => `<button class="user" data-t="${t.id}"><span class="av">${esc2((t.name || '?')[0])}</span>${esc2(t.name)}<small>${t.owner === email() ? 'dueño' : 'acceso compartido'}</small></button>`).join('')}</div>
    <div class="quick c" style="margin-top:18px"><button class="btn" id="new">+ Crear otro local</button><button class="btn ghost" id="out">Salir</button></div>`);
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => openTenant(list.find(t => t.id === b.dataset.t)));
  document.getElementById('new').onclick = wizard;
  document.getElementById('out').onclick = window.CLOUD_SIGNOUT;
}
function wizard() {
  const isIvan = email() === 'ivanyacar@gmail.com';
  gate(`<div class="brand big"><span class="dot"></span><div><b>Creá tu local</b><small>${esc2(email())}</small></div></div>
    <form class="form" id="wz">
      <label>Nombre del local<input name="name" required value="${isIvan ? "Shivo's" : ''}" placeholder="Ej: La Esquina"></label>
      <label>Carta para empezar<select name="tpl">${isIvan ? '<option value="shivos">Carta de Shivo\'s (importada de Fudo)</option>' : ''}<option value="demo">Carta de ejemplo (para ver cómo funciona)</option><option value="vacio">Vacía (la cargo yo)</option></select></label>
      <div class="grid2"><label>Tu nombre<input name="owner" required value="${isIvan ? 'Ivan' : ''}"></label><label>Tu PIN (4 a 6 números)<input name="pin" required inputmode="numeric" pattern="[0-9]{4,6}" type="text" class="secret" autocomplete="off" data-lpignore="true" data-1p-ignore></label></div>
      <div class="btns"><button type="button" class="btn ghost" id="out">Salir</button><button class="btn pri">Crear local</button></div><p class="gate-msg muted"></p></form>`);
  document.getElementById('out').onclick = window.CLOUD_SIGNOUT;
  document.getElementById('wz').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const id = (f.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'local') + '-' + Math.random().toString(36).slice(2, 6);
    const t = { id, name: f.name.trim(), owner: email(), members: [email()], tpl: f.tpl, creado: Date.now() };
    try { await setDoc(doc(db, 'tenants', id), t); }
    catch (err) { return alertBox('No se pudo crear: ' + err.code); }
    window.SEED_PATCH = { local: t.name, owner: f.owner.trim(), pin: f.pin };
    openTenant(t);
  };
}
async function openTenant(t) {
  TID = t.id; TENANT = t; localStorage.setItem('morfi_tid', TID);
  gate('<p class="muted">Cargando ' + esc2(t.name) + '…</p>');
  await Promise.all([
    ...['settings', 'cats', 'prods', 'mods', 'users', 'cash', 'insumos', 'proveedores', 'clientes', 'ctamov', 'public'].map(c => listen(c, col(c))),
    listen('orders', query(col('orders'), where('creado', '>=', startOf(2))), 'recent'),
    listen('orders', query(col('orders'), where('estado', '==', 'abierta')), 'open'),
    listen('kds', query(col('kds'), where('t', '>=', startOf(1)))),
    listen('moves', query(col('moves'), where('t', '>=', startOf(40)))),
    listen('stockmov', query(col('stockmov'), where('t', '>=', startOf(30)))),
    listen('compras', query(col('compras'), where('t', '>=', startOf(90)))),
    listen('gastos', query(col('gastos'), where('t', '>=', startOf(90)))),
    listen('fichajes', query(col('fichajes'), where('in', '>=', startOf(62)))),
    listen('reservas', query(col('reservas'), where('fecha', '>=', new Date(Date.now() - 7 * D).toISOString().slice(0, 10)))),
    listen('inbox', query(col('inbox'), where('t', '>=', startOf(2)))),
    listen('prints', query(col('prints'), where('done', '==', false)))
  ]);
  window.DB_USE(CloudDB);
  window.startApp(t.tpl || 'vacio');
}

gate('<p class="muted">Conectando…</p>');
onAuthStateChanged(auth, async user => {
  if (window.__started) return;
  if (!user) return landing();
  gate('<p class="muted">Buscando tus locales…</p>');
  let list = [];
  try { const s = await getDocs(query(collection(db, 'tenants'), where('members', 'array-contains', email()))); s.forEach(d => list.push(d.data())); }
  catch (e) { return gate(`<p>No se pudo conectar (${esc2(e.code)}).</p><button class="btn" onclick="location.reload()">Reintentar</button>`); }
  const saved = localStorage.getItem('morfi_tid');
  const pick = list.find(t => t.id === saved) || (list.length === 1 ? list[0] : null);
  if (pick) return openTenant(pick);
  if (list.length) return chooser(list);
  wizard();
});
