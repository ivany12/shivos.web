/* Shivo's POS — app de gestión gastronómica */
'use strict';

/* ───────── utilidades ───────── */
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = n => '$ ' + Math.round(n || 0).toLocaleString('es-AR');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = t => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const fecha = t => new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const mins = t => Math.max(0, Math.floor((Date.now() - t) / 60000));
const local = { get: k => { try { return JSON.parse(localStorage.getItem('shvdev_' + k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('shvdev_' + k, JSON.stringify(v)); } catch { } } };

/* ───────── base de datos ─────────
   Dos motores con la misma interfaz: local (una sola pantalla, para probar) y nube (Firebase, todas sincronizadas).
   cloud.js reemplaza DB.impl por la nube antes de arrancar. */
const BUS = (() => { const subs = {}; return {
  on: (c, f) => (subs[c] = subs[c] || []).push(f),
  fire: c => { (subs[c] || []).forEach(f => f()); (subs['*'] || []).forEach(f => f(c)); } }; })();
const LocalDB = (() => {
  const K = 'shvdb_';
  let ch = null; try { ch = new BroadcastChannel('shivos-pos'); } catch { }
  const read = c => { try { return JSON.parse(localStorage.getItem(K + c) || '{}'); } catch { return {}; } };
  const write = (c, m) => { localStorage.setItem(K + c, JSON.stringify(m)); ch && ch.postMessage(c); BUS.fire(c); };
  if (ch) ch.onmessage = e => BUS.fire(e.data);
  addEventListener('storage', e => { if (e.key && e.key.startsWith(K)) BUS.fire(e.key.slice(K.length)); });
  return {
    kind: 'local',
    list: c => Object.values(read(c)),
    get: (c, id) => read(c)[id],
    put: (c, o) => { const m = read(c); o.id = o.id || uid(); o.upd = Date.now(); m[o.id] = o; write(c, m); return o; },
    del: (c, id) => { const m = read(c); delete m[id]; write(c, m); },
    range: async (from, to) => Object.values(read('orders')).filter(o => o.creado >= from && o.creado < to),
    since: 0,
    empty: () => !localStorage.getItem(K + 'settings'),
    dump: async () => { const o = {}; ['settings', 'cats', 'prods', 'mods', 'users', 'orders', 'kds', 'cash', 'moves'].forEach(c => o[c] = read(c)); return o; },
    load: o => Object.entries(o).forEach(([c, m]) => write(c, m))
  };
})();
window.BUS_FIRE = c => BUS.fire(c);
window.DB_USE = impl => { DB.impl = impl; };
const DB = {
  impl: LocalDB,
  list: c => DB.impl.list(c), get: (c, id) => DB.impl.get(c, id), put: (c, o) => DB.impl.put(c, o), del: (c, id) => DB.impl.del(c, id),
  range: (a, b) => DB.impl.range(a, b), empty: () => DB.impl.empty(), dump: () => DB.impl.dump(), load: o => DB.impl.load(o),
  on: BUS.on
};
// Pedidos entre dos días (claves AAAA-MM-DD). Usa la memoria si alcanza; si no, consulta la nube.
const rangeCache = {};
function ordersBetween(d1, d2, cb) {
  const from = new Date(d1 + 'T00:00:00').getTime(), to = new Date(d2 + 'T00:00:00').getTime() + 86400000;
  if (from >= (DB.impl.since || 0)) return DB.list('orders').filter(o => o.creado >= from && o.creado < to);
  const k = d1 + '_' + d2;
  if (rangeCache[k] && Date.now() - rangeCache[k].t < 60000) return rangeCache[k].l;
  DB.range(from, to).then(l => { rangeCache[k] = { t: Date.now(), l }; cb(); });
  return null;
}

function seedIfEmpty() {
  if (!DB.empty()) return;
  const S = window.SEED;
  DB.put('settings', S.settings);
  S.cats.forEach(c => DB.put('cats', c));
  S.prods.forEach(p => DB.put('prods', p));
  S.mods.forEach(m => DB.put('mods', m));
  S.users.forEach(u => DB.put('users', u));
}

/* ───────── roles ───────── */
const ROLES = {
  dueno: { name: 'Dueño', views: ['salon', 'pedidos', 'cocina', 'caja', 'ventas', 'reportes', 'productos', 'usuarios', 'ajustes'], cobrar: 1, anular: 1 },
  encargado: { name: 'Encargado', views: ['salon', 'pedidos', 'cocina', 'caja', 'ventas', 'reportes', 'productos'], cobrar: 1, anular: 1 },
  cajero: { name: 'Cajero', views: ['salon', 'pedidos', 'cocina', 'caja', 'ventas'], cobrar: 1, anular: 0 },
  mozo: { name: 'Mozo', views: ['salon', 'pedidos'], cobrar: 0, anular: 0 },
  cocina: { name: 'Cocina', views: ['cocina'], cobrar: 0, anular: 0 }
};
const VIEWS = { salon: 'Salón', pedidos: 'Pedidos', cocina: 'Cocina', caja: 'Caja', ventas: 'Ventas', reportes: 'Reportes', productos: 'Productos', usuarios: 'Usuarios', ajustes: 'Ajustes' };

let ME = null;
const can = k => ME && ROLES[ME.role] && ROLES[ME.role][k];
const settings = () => DB.get('settings', 'main') || window.SEED.settings;

/* ───────── modelo de pedidos ───────── */
const itemTotal = it => (it.p + (it.mods || []).reduce((a, m) => a + m.p, 0)) * it.q;
function orderCalc(o) {
  const sub = (o.items || []).reduce((a, it) => a + itemTotal(it), 0);
  const desc = o.desc ? (o.desc.tipo === '%' ? Math.round(sub * o.desc.v / 100) : Math.min(sub, o.desc.v)) : 0;
  const total = Math.max(0, sub - desc) + (o.propina || 0);
  const pagado = (o.pagos || []).reduce((a, p) => a + p.monto, 0);
  return { sub, desc, total, pagado, resta: total - pagado };
}
function nextNum() {
  const hoy = dayKey(Date.now());
  return DB.list('orders').filter(o => dayKey(o.creado) === hoy).reduce((a, o) => Math.max(a, o.num || 0), 0) + 1;
}
function newOrder(data) {
  return DB.put('orders', { num: nextNum(), estado: 'abierta', items: [], pagos: [], creado: Date.now(), por: ME.name, ...data });
}
const orderLabel = o => o.tipo === 'mesa' ? 'Mesa ' + o.mesa : (o.canal || 'Pedido') + ' #' + o.num + (o.cliente && o.cliente.nombre ? ' · ' + o.cliente.nombre : '');
const openCash = () => DB.list('cash').find(c => !c.cerrada);

/* ───────── impresión (80 mm) ───────── */
function printHTML(body) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:80mm auto;margin:0}body{width:72mm;margin:0 auto;padding:4mm 0;font:13px/1.35 'Courier New',monospace;color:#000}
    h1{font-size:20px;margin:0 0 4px;text-align:center}h2{font-size:17px;margin:6px 0}.c{text-align:center}.r{text-align:right}
    .row{display:flex;justify-content:space-between;gap:6px}.big{font-size:18px;font-weight:bold}.m{padding-left:12px;font-size:12px}
    hr{border:0;border-top:1px dashed #000;margin:6px 0}.n{font-weight:bold;font-size:16px}
  </style></head><body>${body}</body></html>`);
  d.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 250);
}
function ticketHTML(o) {
  const s = settings(), c = orderCalc(o);
  return `<h1>${esc(s.local)}</h1><div class="c">${esc(s.dir)}</div><hr>
    <div class="row"><span>${esc(orderLabel(o))}</span><span>${fecha(o.creado)} ${hhmm(o.creado)}</span></div><hr>
    ${o.items.map(it => `<div class="row"><span>${it.q} ${esc(it.n)}</span><span>${money(itemTotal(it))}</span></div>${(it.mods || []).map(m => `<div class="m">+ ${esc(m.n)}</div>`).join('')}`).join('')}
    <hr>${c.desc ? `<div class="row"><span>Subtotal</span><span>${money(c.sub)}</span></div><div class="row"><span>Descuento</span><span>-${money(c.desc)}</span></div>` : ''}
    ${o.propina ? `<div class="row"><span>Propina</span><span>${money(o.propina)}</span></div>` : ''}
    <div class="row big"><span>TOTAL</span><span>${money(c.total)}</span></div>
    ${(o.pagos || []).map(p => `<div class="row"><span>${esc(p.medio)}</span><span>${money(p.monto)}</span></div>`).join('')}
    <hr><div class="c">${esc(s.pie)}</div><div class="c">No válido como factura</div>`;
}
function comandaHTML(k) {
  return `<h2 class="c">COCINA</h2><div class="row n"><span>${esc(k.label)}</span><span>${hhmm(k.t)}</span></div><div>${esc(k.por || '')}</div><hr>
    ${k.items.map(it => `<div class="n">${it.q} x ${esc(it.n)}</div>${(it.mods || []).map(m => `<div class="m">+ ${esc(m.n)}</div>`).join('')}${it.nota ? `<div class="m">» ${esc(it.nota)}</div>` : ''}`).join('')}
    ${k.nota ? `<hr><div>${esc(k.nota)}</div>` : ''}<hr>`;
}
// Cola de impresión: cualquier pantalla manda; la que está marcada como "impresora" imprime.
function queuePrint(html, tipo) {
  if (local.get('printer')) return printHTML(html);
  DB.put('prints', { html, tipo, t: Date.now(), done: false });
  toast(tipo === 'comanda' ? 'Comanda enviada a la impresora' : 'Ticket enviado a la impresora');
}
function printerLoop() {
  if (!local.get('printer')) return;
  const jobs = DB.list('prints').filter(j => !j.done).sort((a, b) => a.t - b.t);
  if (!jobs.length) return;
  const j = jobs[0];
  DB.put('prints', { ...j, done: true, por: 'esta' });
  printHTML(j.html);
}
DB.on('prints', () => setTimeout(printerLoop, 300));

/* ───────── UI base ───────── */
function toast(msg, bad) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2600);
}
function modal(html, onMount) {
  const w = document.createElement('div');
  w.className = 'modal-bg';
  w.innerHTML = `<div class="modal">${html}</div>`;
  w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-close]')) w.remove(); });
  document.body.appendChild(w);
  onMount && onMount(w.firstElementChild, () => w.remove());
  const f = w.querySelector('[autofocus]'); f && f.focus();
  return w;
}
function ask(title, fields, onOk, okText = 'Guardar') {
  modal(`<h3>${esc(title)}</h3><form class="form">${fields.map(f => `
      <label>${esc(f.label)}${f.type === 'select'
        ? `<select name="${f.name}">${f.options.map(o => `<option ${o == f.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>`}</label>`).join('')}
      <div class="btns"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn yes">${esc(okText)}</button></div></form>`,
    (m, close) => {
      const f = $('form', m); const first = $('input,select', f); first && first.focus();
      f.onsubmit = e => { e.preventDefault(); const v = Object.fromEntries(new FormData(f)); if (onOk(v) !== false) close(); };
    });
}
function confirmBox(msg, onYes, yes = 'Sí') {
  modal(`<h3>${esc(msg)}</h3><div class="btns"><button class="btn ghost" data-close>No</button><button class="btn danger" id="cf-y">${esc(yes)}</button></div>`,
    (m, close) => { $('#cf-y', m).onclick = () => { close(); onYes(); }; });
}

/* ───────── router ───────── */
const app = $('#app');
let route = { v: 'salon', id: null };
let rerender = null;
function go(v, id) { location.hash = id ? `${v}/${id}` : v; }
function parse() { const [v, id] = location.hash.slice(1).split('/'); route = { v: v || '', id: id || null }; }
addEventListener('hashchange', render);
DB.on('*', c => { if (c !== 'prints') { clearTimeout(rerender); rerender = setTimeout(() => render(true), 60); } });
setInterval(() => { if (['salon', 'pedidos', 'cocina'].includes(route.v)) render(true); }, 30000);

function render(soft) {
  parse();
  if (!ME) return viewLogin();
  const allowed = ROLES[ME.role].views;
  if (route.v === 'orden' && route.id) return shell(viewOrder, soft);
  if (!allowed.includes(route.v)) return go(allowed[0]);
  shell({ salon: viewSalon, pedidos: viewPedidos, cocina: viewCocina, caja: viewCaja, ventas: viewVentas, reportes: viewReportes, productos: viewProductos, usuarios: viewUsuarios, ajustes: viewAjustes }[route.v], soft);
}
function shell(view, soft) {
  const keep = soft ? { y: ($('.main') || {}).scrollTop, focus: document.activeElement && document.activeElement.id, val: document.activeElement && document.activeElement.value } : null;
  if (soft && document.activeElement && document.activeElement.matches('input,textarea') && document.activeElement.closest('.main')) return; // no pisar mientras escriben
  const nav = ROLES[ME.role].views.map(v => `<a href="#${v}" class="${route.v === v ? 'on' : ''}">${VIEWS[v]}</a>`).join('');
  const kdsN = DB.list('kds').filter(k => k.estado === 'pendiente').length;
  app.innerHTML = `<header class="top"><a class="logo" href="#${ROLES[ME.role].views[0]}">SHIVO'S</a><nav class="nav">${nav.replace('>Cocina<', `>Cocina${kdsN ? ` <b class="badge">${kdsN}</b>` : ''}<`)}</nav>
    <button class="me" id="me">${esc(ME.name)} <small>${ROLES[ME.role].name}</small></button></header><main class="main"></main>`;
  $('#me').onclick = () => confirmBox('¿Cerrar sesión de ' + ME.name + '?', () => { ME = null; sessionStorage.removeItem('shv_me'); render(); }, 'Salir');
  view($('.main'));
  if (keep) { $('.main').scrollTop = keep.y || 0; }
}

/* ───────── login ───────── */
function viewLogin() {
  const users = DB.list('users').filter(u => u.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  let sel = null, pin = '';
  app.innerHTML = `<div class="login"><div class="login-box"><div class="logo big">SHIVO'S</div>
    <div class="who">${users.map(u => `<button class="user" data-u="${u.id}">${esc(u.name)}<small>${ROLES[u.role].name}</small></button>`).join('')}</div>
    <div class="pinpad hide"><div class="pin-name"></div><div class="dots"></div>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '←', 0, 'OK'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div></div></div></div>`;
  const pad = $('.pinpad'), dots = $('.dots');
  const draw = () => dots.innerHTML = '●'.repeat(pin.length) || '<span>Ingresá tu PIN</span>';
  app.querySelectorAll('.user').forEach(b => b.onclick = () => {
    sel = DB.get('users', b.dataset.u); pin = '';
    app.querySelectorAll('.user').forEach(x => x.classList.toggle('on', x === b));
    pad.classList.remove('hide'); $('.pin-name').textContent = sel.name; draw();
  });
  const tryPin = () => {
    if (sel && pin === String(sel.pin)) { ME = sel; sessionStorage.setItem('shv_me', sel.id); go(ROLES[sel.role].views[0]); render(); }
    else { pin = ''; draw(); dots.classList.add('shake'); setTimeout(() => dots.classList.remove('shake'), 400); }
  };
  app.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === '←') pin = pin.slice(0, -1); else if (k === 'OK') return tryPin(); else if (pin.length < 6) pin += k;
    draw(); if (pin.length >= 4 && sel && pin === String(sel.pin)) tryPin();
  });
  onkeydown = e => { if (!sel || ME) return; if (/^\d$/.test(e.key) && pin.length < 6) { pin += e.key; draw(); if (pin === String(sel.pin)) tryPin(); } else if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); } else if (e.key === 'Enter') tryPin(); };
  if (users.length === 1) app.querySelector('.user').click();
}

/* ───────── salón ───────── */
function viewSalon(el) {
  const s = settings();
  const abiertas = DB.list('orders').filter(o => o.estado === 'abierta' && o.tipo === 'mesa');
  el.innerHTML = s.zonas.map(z => `<section class="zona"><h2>${esc(z.name)}</h2><div class="mesas">${Array.from({ length: z.mesas }, (_, i) => {
    const name = (z.prefix || (z.name === 'Salón' ? '' : z.name[0])) + (i + 1);
    const o = abiertas.find(x => x.mesa === name);
    const c = o ? orderCalc(o) : null;
    return `<button class="mesa ${o ? (o.cuenta ? 'cuenta' : 'ocupada') : ''}" data-m="${esc(name)}"><b>${esc(name)}</b>
      ${o ? `<span>${money(c.total)}</span><small>${mins(o.creado)}′ · ${esc(o.mozo || o.por || '')}</small>` : '<small>libre</small>'}</button>`;
  }).join('')}</div></section>`).join('') + `<p class="hint">Amarillo: ocupada · Naranja: pidieron la cuenta</p>`;
  el.querySelectorAll('.mesa').forEach(b => b.onclick = () => {
    const m = b.dataset.m;
    const o = abiertas.find(x => x.mesa === m);
    if (o) return go('orden', o.id);
    ask('Abrir mesa ' + m, [{ name: 'pax', label: 'Personas', type: 'number', inputmode: 'numeric', value: 2 }], v => {
      const n = newOrder({ tipo: 'mesa', canal: 'Salón', mesa: m, pax: +v.pax || 0, mozo: ME.name });
      go('orden', n.id);
    }, 'Abrir');
  });
}

/* ───────── pedidos (mostrador / delivery / apps) ───────── */
const FLOW = ['nuevo', 'cocina', 'listo', 'camino', 'entregado'];
const FLOWN = { nuevo: 'Nuevos', cocina: 'En cocina', listo: 'Listos', camino: 'En camino' };
function viewPedidos(el) {
  const s = settings();
  const os = DB.list('orders').filter(o => o.tipo !== 'mesa' && (o.estado === 'abierta' || (o.etapa && o.etapa !== 'entregado' && o.estado !== 'anulada' && dayKey(o.creado) === dayKey(Date.now())))).sort((a, b) => a.creado - b.creado);
  el.innerHTML = `<div class="bar"><h2>Pedidos</h2><div class="quick">${s.canales.map(c => `<button class="btn" data-c="${esc(c)}">+ ${esc(c)}</button>`).join('')}</div></div>
    <div class="cols">${Object.keys(FLOWN).map(st => {
    const l = os.filter(o => (o.etapa || 'nuevo') === st);
    return `<section class="col"><h3>${FLOWN[st]} <span>${l.length}</span></h3>${l.map(o => {
      const c = orderCalc(o);
      return `<div class="card ord" data-o="${o.id}"><div class="row"><b>#${o.num} ${esc(o.canal)}</b><span class="t ${mins(o.creado) > 30 ? 'late' : ''}">${mins(o.creado)}′</span></div>
        <div>${esc(o.cliente?.nombre || '')} ${o.cliente?.dir ? '· ' + esc(o.cliente.dir) : ''}</div>
        <div class="muted">${o.items.reduce((a, i) => a + i.q, 0)} ítems · ${money(c.total)} ${c.resta <= 0 && o.items.length ? '· <b class="ok">pagado</b>' : ''}</div>
        <div class="row act">${st !== 'camino' ? `<button class="btn sm" data-next="${o.id}">${st === 'nuevo' ? 'A cocina →' : st === 'cocina' ? 'Listo →' : o.canal === 'Mostrador' ? 'Entregado ✓' : 'En camino →'}</button>` : `<button class="btn sm yes" data-next="${o.id}">Entregado ✓</button>`}</div></div>`;
    }).join('') || '<p class="muted">—</p>'}</section>`;
  }).join('')}</div>`;
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
    const canal = b.dataset.c;
    const delivery = canal !== 'Mostrador';
    ask('Nuevo pedido · ' + canal, [
      { name: 'nombre', label: 'Nombre', ph: 'Cliente' },
      ...(canal === 'PedidosYa' || canal === 'Rappi' ? [{ name: 'ref', label: 'N° de pedido en la app', inputmode: 'numeric' }] : []),
      ...(delivery && canal !== 'PedidosYa' && canal !== 'Rappi' ? [{ name: 'tel', label: 'Teléfono', type: 'tel' }, { name: 'dir', label: 'Dirección (vacío = retira)' }] : [])
    ], v => {
      const n = newOrder({ tipo: delivery ? 'delivery' : 'mostrador', canal, etapa: 'nuevo', cliente: { nombre: v.nombre || '', tel: v.tel || '', dir: v.dir || '' }, ref: v.ref || '' });
      go('orden', n.id);
    }, 'Crear');
  });
  el.querySelectorAll('.ord').forEach(c => c.onclick = e => { if (!e.target.closest('[data-next]')) go('orden', c.dataset.o); });
  el.querySelectorAll('[data-next]').forEach(b => b.onclick = () => {
    const o = DB.get('orders', b.dataset.next), st = o.etapa || 'nuevo';
    let nx = FLOW[FLOW.indexOf(st) + 1];
    if (st === 'listo' && o.canal === 'Mostrador') nx = 'entregado';
    if (st === 'nuevo') sendKitchen(o);
    if (nx === 'entregado' && o.estado === 'abierta') {
      if (orderCalc(o).resta > 0) { toast('Falta cobrarlo antes de entregar', 1); return go('orden', o.id); }
    }
    DB.put('orders', { ...DB.get('orders', o.id), etapa: nx });
  });
}

/* ───────── pantalla de pedido / mesa ───────── */
let catSel = null, mobTab = 'carta', lastOrder = null;
function viewOrder(el) {
  const o = DB.get('orders', route.id);
  if (!o) { el.innerHTML = '<p class="muted pad">Este pedido ya no existe.</p>'; return; }
  const cats = DB.list('cats').sort((a, b) => a.pos - b.pos);
  const prods = DB.list('prods').filter(p => p.active !== false).sort((a, b) => a.pos - b.pos);
  if (lastOrder !== o.id) { lastOrder = o.id; catSel = null; mobTab = 'carta'; }
  if (!catSel || !cats.find(c => c.id === catSel)) catSel = cats[0]?.id;
  const c = orderCalc(o), closed = o.estado !== 'abierta';
  const pend = o.items.filter(i => !i.sent).length;
  el.innerHTML = `<div class="order ${mobTab === 'ticket' ? 'show-ticket' : ''}">
    <section class="carta">
      <div class="bar"><button class="btn ghost sm" id="back">←</button><h2>${esc(orderLabel(o))}</h2></div>
      ${closed ? `<p class="muted pad">Pedido ${o.estado}. ${o.estado === 'cerrada' ? 'Cobrado ' + hhmm(o.cerrado) : ''}</p>` : `
      <input class="search" id="q" placeholder="Buscar producto…" autocomplete="off">
      <div class="chips">${cats.filter(ct => prods.some(p => p.cat === ct.id)).map(ct => `<button class="chip ${ct.id === catSel ? 'on' : ''}" data-cat="${ct.id}">${esc(ct.name)}</button>`).join('')}</div>
      <div class="prods" id="prods"></div>`}
    </section>
    <section class="ticket">
      <div class="tk-head"><b>${esc(orderLabel(o))}</b><span class="muted">${o.pax ? o.pax + ' pers · ' : ''}${hhmm(o.creado)} · ${esc(o.mozo || o.por)}</span></div>
      ${o.cliente && (o.cliente.tel || o.cliente.dir || o.ref) ? `<div class="tk-cli">${o.ref ? 'Pedido app: ' + esc(o.ref) + '<br>' : ''}${esc(o.cliente.tel || '')} ${esc(o.cliente.dir || '')}</div>` : ''}
      <div class="items">${o.items.map((it, i) => `<div class="it ${it.sent ? 'sent' : ''}">
        <div class="it-main"><div class="qty">${closed ? `<b>${it.q}</b>` : `<button data-q="${i}" data-d="-1">−</button><b>${it.q}</b><button data-q="${i}" data-d="1">+</button>`}</div>
        <div class="it-n" data-edit="${i}">${esc(it.n)}${(it.mods || []).map(m => `<small>+ ${esc(m.n)}</small>`).join('')}${it.nota ? `<small class="nota">» ${esc(it.nota)}</small>` : ''}</div>
        <div class="it-p">${money(itemTotal(it))}${it.sent ? '<small>✓ cocina</small>' : ''}</div></div></div>`).join('') || '<p class="muted pad">Agregá productos desde la carta.</p>'}</div>
      <div class="tot">
        ${c.desc ? `<div class="row"><span>Subtotal</span><span>${money(c.sub)}</span></div><div class="row"><span>Descuento ${o.desc.tipo === '%' ? o.desc.v + '%' : ''}</span><span>-${money(c.desc)}</span></div>` : ''}
        ${o.propina ? `<div class="row"><span>Propina</span><span>${money(o.propina)}</span></div>` : ''}
        ${c.pagado ? `<div class="row"><span>Pagado</span><span>${money(c.pagado)}</span></div>` : ''}
        <div class="row big"><span>Total</span><span>${money(c.total)}</span></div></div>
      ${closed ? `<div class="acts"><button class="btn" id="print">Reimprimir ticket</button>${can('anular') && o.estado === 'cerrada' ? '<button class="btn ghost" id="reopen">Reabrir</button>' : ''}</div>` : `
      <div class="acts">
        <button class="btn yes wide" id="send" ${pend ? '' : 'disabled'}>Enviar a cocina${pend ? ` (${pend})` : ''}</button>
        <button class="btn" id="cuenta">Cuenta</button>
        <button class="btn" id="desc">Descuento</button>
        ${can('cobrar') ? `<button class="btn pay wide" id="cobrar" ${o.items.length ? '' : 'disabled'}>Cobrar ${money(c.resta)}</button>` : ''}
        ${o.tipo === 'mesa' ? '<button class="btn ghost" id="mover">Mover</button>' : ''}
        <button class="btn ghost" id="nota">Nota</button>
        <button class="btn danger ghost" id="anular">${o.items.length ? 'Anular' : 'Borrar'}</button>
      </div>`}
    </section>
    <button class="mob-toggle" id="mobt">${mobTab === 'carta' ? `Ver pedido · ${o.items.reduce((a, i) => a + i.q, 0)} · ${money(c.total)}` : '← Volver a la carta'}</button>
  </div>`;

  $('#back').onclick = () => go(o.tipo === 'mesa' ? 'salon' : 'pedidos');
  $('#mobt').onclick = () => { mobTab = mobTab === 'carta' ? 'ticket' : 'carta'; render(); };
  const save = patch => DB.put('orders', { ...DB.get('orders', o.id), ...patch });

  if (!closed) {
    const grid = $('#prods'), q = $('#q');
    const drawProds = () => {
      const t = q.value.trim().toLowerCase();
      const l = t ? prods.filter(p => p.name.toLowerCase().includes(t)) : prods.filter(p => p.cat === catSel);
      grid.innerHTML = l.map(p => `<button class="prod" data-p="${p.id}"><b>${esc(p.name)}</b><span>${money(p.price)}</span></button>`).join('') || '<p class="muted">Sin resultados</p>';
      grid.querySelectorAll('.prod').forEach(b => b.onclick = () => addProduct(DB.get('prods', b.dataset.p)));
    };
    q.oninput = drawProds;
    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { catSel = b.dataset.cat; q.value = ''; el.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x === b)); drawProds(); });
    drawProds();

    const addProduct = p => {
      const groups = (p.mods || []).map(id => DB.get('mods', id)).filter(Boolean);
      const push = (mods, nota) => {
        const cur = DB.get('orders', o.id);
        const same = cur.items.find(i => !i.sent && i.pid === p.id && JSON.stringify(i.mods) === JSON.stringify(mods) && (i.nota || '') === (nota || ''));
        if (same) same.q++; else cur.items.push({ id: uid(), pid: p.id, n: p.name, p: p.price, q: 1, mods, nota: nota || '', kitchen: p.kitchen !== false, by: ME.name });
        DB.put('orders', cur);
        toast('+ ' + p.name);
      };
      if (!groups.length) return push([], '');
      itemOptions(p, groups, [], '', push);
    };

    el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
      const cur = DB.get('orders', o.id), it = cur.items[+b.dataset.q], d = +b.dataset.d;
      if (it.sent && d < 0 && !can('anular')) return toast('Ya está en cocina: pedile al encargado', 1);
      const apply = () => { it.q += d; if (it.q <= 0) cur.items.splice(+b.dataset.q, 1); DB.put('orders', cur); };
      if (it.sent && d < 0) confirmBox(`¿Sacar 1 ${it.n}? Ya se mandó a cocina.`, apply, 'Sacar'); else apply();
    });
    el.querySelectorAll('[data-edit]').forEach(d => d.onclick = () => {
      const cur = DB.get('orders', o.id), it = cur.items[+d.dataset.edit];
      if (it.sent) return toast('Ya se mandó a cocina');
      const p = DB.get('prods', it.pid) || { name: it.n, price: it.p, mods: [] };
      const groups = (p.mods || []).map(id => DB.get('mods', id)).filter(Boolean);
      itemOptions(p, groups, it.mods || [], it.nota, (mods, nota) => { it.mods = mods; it.nota = nota; DB.put('orders', cur); });
    });
    $('#send').onclick = () => { sendKitchen(DB.get('orders', o.id)); };
    $('#cuenta').onclick = () => { const cur = DB.get('orders', o.id); save({ cuenta: true }); queuePrint(ticketHTML(cur), 'ticket'); };
    $('#desc').onclick = () => ask('Descuento', [{ name: 'tipo', label: 'Tipo', type: 'select', options: ['%', '$'], value: o.desc?.tipo || '%' }, { name: 'v', label: 'Valor (0 = sin descuento)', type: 'number', inputmode: 'decimal', value: o.desc?.v || '' }, { name: 'propina', label: 'Propina $', type: 'number', inputmode: 'numeric', value: o.propina || '' }],
      v => save({ desc: +v.v ? { tipo: v.tipo, v: +v.v } : null, propina: +v.propina || 0 }));
    $('#nota').onclick = () => ask('Nota del pedido', [{ name: 'nota', label: 'Nota para cocina', value: o.nota || '' }], v => save({ nota: v.nota }));
    $('#mover') && ($('#mover').onclick = () => ask('Mover a otra mesa', [{ name: 'mesa', label: 'Mesa destino' }], v => {
      const m = v.mesa.trim(); if (!m) return false;
      const busy = DB.list('orders').find(x => x.estado === 'abierta' && x.tipo === 'mesa' && x.mesa === m && x.id !== o.id);
      if (busy) {
        confirmBox(`La mesa ${m} está ocupada. ¿Juntar las dos cuentas?`, () => {
          const cur = DB.get('orders', o.id); DB.put('orders', { ...busy, items: busy.items.concat(cur.items), pagos: (busy.pagos || []).concat(cur.pagos || []) });
          DB.put('orders', { ...cur, estado: 'anulada', motivo: 'Unida a mesa ' + m, items: [] }); go('orden', busy.id);
        }, 'Juntar');
      } else save({ mesa: m });
    }, 'Mover'));
    $('#anular').onclick = () => {
      const cur = DB.get('orders', o.id);
      if (!cur.items.length) { DB.del('orders', o.id); return go(o.tipo === 'mesa' ? 'salon' : 'pedidos'); }
      if (!can('anular')) return toast('Solo el encargado puede anular', 1);
      ask('Anular ' + orderLabel(cur), [{ name: 'motivo', label: 'Motivo', ph: 'Ej: se fueron, error de carga' }], v => {
        DB.put('orders', { ...cur, estado: 'anulada', motivo: v.motivo || 'Sin motivo', anuladaPor: ME.name, cerrado: Date.now() });
        go(o.tipo === 'mesa' ? 'salon' : 'pedidos');
      }, 'Anular');
    };
    $('#cobrar') && ($('#cobrar').onclick = () => cobrar(o.id));
  } else {
    $('#print').onclick = () => queuePrint(ticketHTML(o), 'ticket');
    $('#reopen') && ($('#reopen').onclick = () => confirmBox('¿Reabrir este pedido? Se borran los pagos registrados.', () => save({ estado: 'abierta', pagos: [], cerrado: null, cajaId: null })));
  }
}

function itemOptions(p, groups, sel, nota, done) {
  const has = (g, n) => sel.some(m => m.g === g.id && m.n === n);
  modal(`<h3>${esc(p.name)} <span class="muted">${money(p.price)}</span></h3>
    ${groups.map(g => `<div class="grp" data-g="${g.id}"><h4>${esc(g.name)} ${g.min ? '<em>obligatorio</em>' : ''}</h4><div class="opts">
      ${g.opts.map(op => `<button type="button" class="opt ${has(g, op.n) ? 'on' : ''}" data-n="${esc(op.n)}" data-p="${op.p}">${esc(op.n)}${op.p ? ` <small>+${money(op.p)}</small>` : ''}</button>`).join('')}</div></div>`).join('')}
    <label class="form">Aclaración<input id="it-nota" value="${esc(nota)}" placeholder="Ej: sin cebolla, bien cocida"></label>
    <div class="btns"><button class="btn ghost" data-close>Cancelar</button><button class="btn yes" id="ok">Listo</button></div>`, (m, close) => {
    m.querySelectorAll('.grp').forEach(gEl => {
      const g = groups.find(x => x.id === gEl.dataset.g);
      gEl.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        if (g.max === 1) gEl.querySelectorAll('.opt').forEach(x => x !== b && x.classList.remove('on'));
        b.classList.toggle('on');
      });
    });
    $('#ok', m).onclick = () => {
      const mods = []; let bad = null;
      m.querySelectorAll('.grp').forEach(gEl => {
        const g = groups.find(x => x.id === gEl.dataset.g);
        const on = [...gEl.querySelectorAll('.opt.on')];
        if (on.length < (g.min || 0)) bad = g.name;
        on.forEach(b => mods.push({ g: g.id, n: b.dataset.n, p: +b.dataset.p }));
      });
      if (bad) return toast('Elegí ' + bad.toLowerCase(), 1);
      close(); done(mods, $('#it-nota', m).value.trim());
    };
  });
}

function sendKitchen(o) {
  const nuevos = o.items.filter(i => !i.sent);
  if (!nuevos.length) return;
  const cocina = nuevos.filter(i => i.kitchen !== false);
  if (cocina.length) {
    const k = DB.put('kds', { orderId: o.id, label: orderLabel(o), canal: o.canal, tipo: o.tipo, por: ME.name, nota: o.nota || '', t: Date.now(), estado: 'pendiente', items: cocina.map(i => ({ n: i.n, q: i.q, mods: i.mods, nota: i.nota })) });
    queuePrint(comandaHTML(k), 'comanda');
  }
  nuevos.forEach(i => i.sent = true);
  DB.put('orders', { ...o, items: o.items, etapa: o.tipo !== 'mesa' && (o.etapa || 'nuevo') === 'nuevo' ? 'cocina' : o.etapa });
  if (!cocina.length) toast('Marcado como enviado (sin ítems de cocina)');
}

/* ───────── cobrar ───────── */
function cobrar(id) {
  const caja = openCash();
  if (!caja) { toast('Primero abrí la caja', 1); return go('caja'); }
  const o = DB.get('orders', id);
  if (o.items.some(i => !i.sent) && o.tipo === 'mesa') sendKitchen(o);
  const s = settings();
  let pagos = (DB.get('orders', id).pagos || []).slice();
  modal(`<h3>Cobrar ${esc(orderLabel(o))}</h3><div class="pay-total" id="pt"></div>
    <div class="medios">${s.medios.map(m => `<button class="btn medio" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>
    <div id="pl"></div>
    <div class="btns"><button class="btn ghost" data-close>Cancelar</button><button class="btn pay" id="fin">Cerrar cuenta</button></div>`, (m, close) => {
    const draw = () => {
      const tot = orderCalc({ ...DB.get('orders', id), pagos });
      $('#pt', m).innerHTML = `<div class="row big"><span>Total</span><span>${money(tot.total)}</span></div><div class="row ${tot.resta > 0 ? 'warn' : 'ok'}"><span>${tot.resta > 0 ? 'Falta' : 'Vuelto'}</span><span>${money(Math.abs(tot.resta))}</span></div>`;
      $('#pl', m).innerHTML = pagos.map((p, i) => `<div class="row payrow"><span>${esc(p.medio)}</span><input inputmode="numeric" data-i="${i}" value="${p.monto}"><button class="btn ghost sm" data-x="${i}">✕</button></div>`).join('');
      m.querySelectorAll('[data-i]').forEach(inp => inp.oninput = () => { pagos[+inp.dataset.i].monto = +inp.value.replace(/\D/g, '') || 0; const t2 = orderCalc({ ...DB.get('orders', id), pagos }); $('#pt', m).querySelector('.row:last-child').outerHTML = `<div class="row ${t2.resta > 0 ? 'warn' : 'ok'}"><span>${t2.resta > 0 ? 'Falta' : 'Vuelto'}</span><span>${money(Math.abs(t2.resta))}</span></div>`; });
      m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { pagos.splice(+b.dataset.x, 1); draw(); });
    };
    m.querySelectorAll('.medio').forEach(b => b.onclick = () => {
      const tot = orderCalc({ ...DB.get('orders', id), pagos });
      pagos.push({ medio: b.dataset.m, monto: Math.max(0, tot.resta) }); draw();
      const inp = m.querySelector(`[data-i="${pagos.length - 1}"]`); inp && inp.select();
    });
    $('#fin', m).onclick = () => {
      const cur = DB.get('orders', id), tot = orderCalc({ ...cur, pagos });
      if (!pagos.length) return toast('Elegí cómo paga', 1);
      if (tot.resta > 0) return toast('Falta cobrar ' + money(tot.resta), 1);
      // si sobra en efectivo, se descuenta como vuelto
      if (tot.resta < 0) { const ef = pagos.find(p => /efectivo/i.test(p.medio)); if (ef) ef.monto += tot.resta; else return toast('El monto supera el total', 1); }
      const fin = { ...cur, pagos, cajaId: caja.id, cobro: ME.name };
      if (cur.tipo === 'mesa' || (cur.etapa || '') === 'entregado') { fin.estado = 'cerrada'; fin.cerrado = Date.now(); }
      else { fin.pagadoAntes = true; } // delivery/mostrador: queda en el tablero hasta entregarse
      DB.put('orders', fin);
      close();
      if (local.get('autoTicket') !== false) queuePrint(ticketHTML(fin), 'ticket');
      toast('Cobrado ✓');
      if (cur.tipo === 'mesa') go('salon');
    };
    draw();
  });
}
// cuando un pedido pagado se marca entregado, se cierra
DB.on('orders', () => {
  DB.list('orders').filter(o => o.estado === 'abierta' && o.etapa === 'entregado' && o.items.length && orderCalc(o).resta <= 0 && o.pagos?.length)
    .forEach(o => DB.put('orders', { ...o, estado: 'cerrada', cerrado: Date.now(), cajaId: o.cajaId || openCash()?.id }));
});

/* ───────── cocina (KDS) ───────── */
function viewCocina(el) {
  const ks = DB.list('kds').filter(k => k.estado === 'pendiente').sort((a, b) => a.t - b.t);
  const done = DB.list('kds').filter(k => k.estado === 'listo' && Date.now() - k.listo < 3600000).sort((a, b) => b.listo - a.listo).slice(0, 8);
  el.innerHTML = `<div class="bar"><h2>Cocina <span class="muted">${ks.length} en preparación</span></h2></div>
    <div class="kds">${ks.map(k => `<div class="kc ${mins(k.t) > 20 ? 'late' : mins(k.t) > 12 ? 'warn' : ''}"><div class="kh"><b>${esc(k.label)}</b><span>${mins(k.t)}′</span></div>
      <div class="ki">${k.items.map((it, i) => `<div class="kit ${(k.hechos || []).includes(i) ? 'done' : ''}" data-k="${k.id}" data-i="${i}"><b>${it.q}</b> ${esc(it.n)}${(it.mods || []).map(m => `<small>+ ${esc(m.n)}</small>`).join('')}${it.nota ? `<small class="nota">» ${esc(it.nota)}</small>` : ''}</div>`).join('')}
      ${k.nota ? `<div class="kit nota">${esc(k.nota)}</div>` : ''}</div>
      <button class="btn yes wide" data-ok="${k.id}">Listo ✓</button></div>`).join('') || '<p class="muted pad big">Nada pendiente. 🔥</p>'}</div>
    ${done.length ? `<h3 class="muted pad">Últimos listos</h3><div class="done-list">${done.map(k => `<button class="chip" data-back="${k.id}">${esc(k.label)} · ${hhmm(k.listo)} ↺</button>`).join('')}</div>` : ''}`;
  el.querySelectorAll('.kit[data-k]').forEach(d => d.onclick = () => {
    const k = DB.get('kds', d.dataset.k), i = +d.dataset.i; k.hechos = k.hechos || [];
    k.hechos = k.hechos.includes(i) ? k.hechos.filter(x => x !== i) : k.hechos.concat(i); DB.put('kds', k);
  });
  el.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => {
    const k = DB.get('kds', b.dataset.ok); DB.put('kds', { ...k, estado: 'listo', listo: Date.now() });
    const o = DB.get('orders', k.orderId);
    if (o && o.tipo !== 'mesa' && o.etapa === 'cocina' && !DB.list('kds').some(x => x.orderId === o.id && x.estado === 'pendiente' && x.id !== k.id)) DB.put('orders', { ...o, etapa: 'listo' });
  });
  el.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { const k = DB.get('kds', b.dataset.back); DB.put('kds', { ...k, estado: 'pendiente' }); });
}

/* ───────── caja ───────── */
function cashSummary(c) {
  const os = DB.list('orders').filter(o => o.cajaId === c.id && o.estado !== 'anulada');
  const por = {}; let total = 0;
  os.forEach(o => (o.pagos || []).forEach(p => { por[p.medio] = (por[p.medio] || 0) + p.monto; total += p.monto; }));
  const mv = DB.list('moves').filter(m => m.cajaId === c.id).sort((a, b) => a.t - b.t);
  const ing = mv.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const egr = mv.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0);
  const efectivo = (c.inicial || 0) + (por['Efectivo'] || 0) + ing - egr;
  return { os, por, total, mv, ing, egr, efectivo };
}
function viewCaja(el) {
  const c = openCash();
  const prev = DB.list('cash').filter(x => x.cerrada).sort((a, b) => b.cerrada - a.cerrada).slice(0, 10);
  if (!c) {
    el.innerHTML = `<div class="pad narrow"><h2>Caja cerrada</h2><p class="muted">Abrí la caja para empezar a cobrar.</p>
      <button class="btn yes big" id="abrir">Abrir caja</button>
      ${prev.length ? `<h3>Cierres anteriores</h3><table class="tbl"><tr><th>Fecha</th><th>Abrió</th><th>Cerró</th><th>Ventas</th><th>Diferencia</th></tr>${prev.map(p => `<tr><td>${fecha(p.abierta)} ${hhmm(p.abierta)}</td><td>${esc(p.por)}</td><td>${esc(p.cerro)}</td><td>${money(p.resumen?.total)}</td><td class="${p.dif < 0 ? 'bad' : ''}">${money(p.dif)}</td></tr>`).join('')}</table>` : ''}</div>`;
    $('#abrir').onclick = () => ask('Abrir caja', [{ name: 'inicial', label: 'Efectivo inicial en caja', type: 'number', inputmode: 'numeric', value: prev[0]?.contado ?? '' }], v => { DB.put('cash', { abierta: Date.now(), inicial: +v.inicial || 0, por: ME.name }); }, 'Abrir');
    return;
  }
  const r = cashSummary(c);
  const abiertas = DB.list('orders').filter(o => o.estado === 'abierta' && o.items.length);
  el.innerHTML = `<div class="pad"><div class="bar"><h2>Caja abierta <span class="muted">desde ${hhmm(c.abierta)} · ${esc(c.por)}</span></h2>
    <div class="quick"><button class="btn" id="ing">+ Ingreso</button><button class="btn" id="egr">− Egreso / gasto</button><button class="btn danger" id="cerrar">Cerrar caja</button></div></div>
    <div class="kpis"><div class="kpi"><small>Vendido</small><b>${money(r.total)}</b></div><div class="kpi"><small>Ventas</small><b>${r.os.length}</b></div>
    <div class="kpi"><small>Efectivo esperado en caja</small><b>${money(r.efectivo)}</b></div><div class="kpi"><small>Cuentas abiertas</small><b>${abiertas.length}</b></div></div>
    <div class="two"><div><h3>Por medio de pago</h3><table class="tbl">${Object.entries(r.por).sort((a, b) => b[1] - a[1]).map(([m, v]) => `<tr><td>${esc(m)}</td><td class="r">${money(v)}</td></tr>`).join('') || '<tr><td class="muted">Sin cobros todavía</td></tr>'}</table></div>
    <div><h3>Movimientos</h3><table class="tbl"><tr><td>Inicial</td><td></td><td class="r">${money(c.inicial)}</td></tr>${r.mv.map(m => `<tr><td>${hhmm(m.t)} ${esc(m.concepto)}</td><td class="muted">${esc(m.por)}</td><td class="r ${m.tipo === 'egreso' ? 'bad' : ''}">${m.tipo === 'egreso' ? '−' : '+'}${money(m.monto)}</td></tr>`).join('')}</table></div></div></div>`;
  const mov = tipo => ask(tipo === 'ingreso' ? 'Ingreso de efectivo' : 'Egreso / gasto en efectivo', [{ name: 'monto', label: 'Monto', type: 'number', inputmode: 'numeric' }, { name: 'concepto', label: 'Concepto', ph: tipo === 'egreso' ? 'Ej: verdulería, chino' : 'Ej: cambio' }], v => {
    if (!+v.monto) return false; DB.put('moves', { cajaId: c.id, tipo, monto: +v.monto, concepto: v.concepto || '', t: Date.now(), por: ME.name });
  });
  $('#ing').onclick = () => mov('ingreso');
  $('#egr').onclick = () => mov('egreso');
  $('#cerrar').onclick = () => {
    if (abiertas.length) toast(`Ojo: hay ${abiertas.length} cuentas abiertas`, 1);
    ask('Cerrar caja', [{ name: 'contado', label: `Efectivo contado (esperado ${money(r.efectivo)})`, type: 'number', inputmode: 'numeric' }], v => {
      const contado = +v.contado || 0;
      const fin = { ...c, cerrada: Date.now(), cerro: ME.name, contado, dif: contado - r.efectivo, resumen: { total: r.total, por: r.por, ventas: r.os.length, ing: r.ing, egr: r.egr, esperado: r.efectivo } };
      DB.put('cash', fin);
      queuePrint(`<h1>CIERRE DE CAJA</h1><div class="c">${fecha(c.abierta)} ${hhmm(c.abierta)} → ${hhmm(fin.cerrada)}</div><hr>
        ${Object.entries(r.por).map(([m, x]) => `<div class="row"><span>${esc(m)}</span><span>${money(x)}</span></div>`).join('')}<hr>
        <div class="row big"><span>TOTAL</span><span>${money(r.total)}</span></div><div class="row"><span>Ventas</span><span>${r.os.length}</span></div><hr>
        <div class="row"><span>Inicial</span><span>${money(c.inicial)}</span></div><div class="row"><span>Ingresos</span><span>${money(r.ing)}</span></div><div class="row"><span>Egresos</span><span>-${money(r.egr)}</span></div>
        <div class="row"><span>Esperado</span><span>${money(r.efectivo)}</span></div><div class="row"><span>Contado</span><span>${money(contado)}</span></div>
        <div class="row big"><span>Diferencia</span><span>${money(fin.dif)}</span></div><hr><div>Cerró: ${esc(ME.name)}</div>`, 'cierre');
    }, 'Cerrar caja');
  };
}

/* ───────── ventas ───────── */
let ventasDia = null;
function viewVentas(el) {
  ventasDia = ventasDia || dayKey(Date.now());
  const all = ordersBetween(ventasDia, ventasDia, () => route.v === 'ventas' && render());
  if (!all) { el.innerHTML = '<p class="muted pad">Cargando ventas…</p>'; return; }
  const os = all.filter(o => o.estado !== 'abierta').sort((a, b) => b.creado - a.creado);
  const ok = os.filter(o => o.estado === 'cerrada');
  el.innerHTML = `<div class="pad"><div class="bar"><h2>Ventas</h2><input type="date" id="d" value="${ventasDia}"></div>
    <div class="kpis"><div class="kpi"><small>Total</small><b>${money(ok.reduce((a, o) => a + orderCalc(o).total, 0))}</b></div><div class="kpi"><small>Ventas</small><b>${ok.length}</b></div><div class="kpi"><small>Anuladas</small><b>${os.length - ok.length}</b></div></div>
    <table class="tbl click"><tr><th>#</th><th>Hora</th><th>Origen</th><th>Detalle</th><th>Pago</th><th class="r">Total</th></tr>
    ${os.map(o => `<tr data-o="${o.id}" class="${o.estado === 'anulada' ? 'anul' : ''}"><td>${o.num}</td><td>${hhmm(o.creado)}</td><td>${esc(o.tipo === 'mesa' ? 'Mesa ' + o.mesa : o.canal)}</td><td>${esc(o.items.map(i => i.q + ' ' + i.n).join(', ').slice(0, 70))}${o.estado === 'anulada' ? ' — ANULADA: ' + esc(o.motivo || '') : ''}</td><td>${esc((o.pagos || []).map(p => p.medio).join(' + '))}</td><td class="r">${money(orderCalc(o).total)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Sin ventas este día</td></tr>'}</table></div>`;
  $('#d').onchange = e => { ventasDia = e.target.value; render(); };
  el.querySelectorAll('[data-o]').forEach(r => r.onclick = () => go('orden', r.dataset.o));
}

/* ───────── reportes ───────── */
let repDesde = null, repHasta = null;
function viewReportes(el) {
  const hoy = dayKey(Date.now());
  repHasta = repHasta || hoy;
  repDesde = repDesde || dayKey(Date.now() - 6 * 86400000);
  const all = ordersBetween(repDesde, repHasta, () => route.v === 'reportes' && render());
  if (!all) { el.innerHTML = '<p class="muted pad">Cargando reportes…</p>'; return; }
  const os = all.filter(o => o.estado === 'cerrada');
  const tot = os.reduce((a, o) => a + orderCalc(o).total, 0);
  const sum = (key) => { const m = {}; os.forEach(o => { const k = key(o); m[k] = (m[k] || 0) + orderCalc(o).total; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const medios = {}; os.forEach(o => (o.pagos || []).forEach(p => medios[p.medio] = (medios[p.medio] || 0) + p.monto));
  const prods = {}; os.forEach(o => o.items.forEach(i => { prods[i.n] = prods[i.n] || { q: 0, t: 0 }; prods[i.n].q += i.q; prods[i.n].t += itemTotal(i); }));
  const horas = Array(24).fill(0); os.forEach(o => horas[new Date(o.creado).getHours()] += orderCalc(o).total);
  const maxH = Math.max(1, ...horas);
  const bars = (rows) => { const mx = Math.max(1, ...rows.map(r => r[1])); return rows.map(([k, v]) => `<div class="hb"><span>${esc(k)}</span><i style="width:${v / mx * 100}%"></i><b>${money(v)}</b><em>${tot ? Math.round(v / tot * 100) : 0}%</em></div>`).join('') || '<p class="muted">Sin datos</p>'; };
  el.innerHTML = `<div class="pad"><div class="bar"><h2>Reportes</h2><div class="quick"><input type="date" id="d1" value="${repDesde}"><input type="date" id="d2" value="${repHasta}"></div></div>
    <div class="kpis"><div class="kpi"><small>Vendido</small><b>${money(tot)}</b></div><div class="kpi"><small>Ventas</small><b>${os.length}</b></div><div class="kpi"><small>Ticket promedio</small><b>${money(os.length ? tot / os.length : 0)}</b></div>
    <div class="kpi"><small>Descuentos</small><b>${money(os.reduce((a, o) => a + orderCalc(o).desc, 0))}</b></div></div>
    <div class="two"><div><h3>Origen</h3>${bars(sum(o => o.tipo === 'mesa' ? 'Salón' : o.canal))}</div><div><h3>Medios de pago</h3>${bars(Object.entries(medios).sort((a, b) => b[1] - a[1]))}</div></div>
    <h3>Por hora</h3><div class="hours">${horas.map((v, h) => `<div title="${h}h ${money(v)}"><i style="height:${v / maxH * 100}%"></i><small>${h}</small></div>`).slice(11).join('')}</div>
    <h3>Productos más vendidos</h3><table class="tbl"><tr><th>Producto</th><th class="r">Cant.</th><th class="r">Total</th></tr>${Object.entries(prods).sort((a, b) => b[1].q - a[1].q).slice(0, 25).map(([n, v]) => `<tr><td>${esc(n)}</td><td class="r">${v.q}</td><td class="r">${money(v.t)}</td></tr>`).join('')}</table></div>`;
  $('#d1').onchange = e => { repDesde = e.target.value; render(); };
  $('#d2').onchange = e => { repHasta = e.target.value; render(); };
}

/* ───────── productos ───────── */
function viewProductos(el) {
  const cats = DB.list('cats').sort((a, b) => a.pos - b.pos);
  const prods = DB.list('prods').sort((a, b) => a.pos - b.pos);
  const mods = DB.list('mods');
  el.innerHTML = `<div class="pad"><div class="bar"><h2>Productos <span class="muted">${prods.length}</span></h2><div class="quick">
    <input class="search sm" id="q" placeholder="Buscar…"><button class="btn yes" id="nuevo">+ Producto</button><button class="btn" id="aum">Aumentar precios %</button><button class="btn ghost" id="cat">+ Categoría</button></div></div>
    <div id="pl">${cats.map(c => `<section class="pcat" data-c="${c.id}"><h3>${esc(c.name)}</h3><table class="tbl click">${prods.filter(p => p.cat === c.id).map(p => `<tr data-p="${p.id}" class="${p.active === false ? 'anul' : ''}"><td>${esc(p.name)}${p.active === false ? ' <small>(pausado)</small>' : ''}</td><td class="muted">${(p.mods || []).map(m => esc(mods.find(x => x.id === m)?.name || m)).join(', ')}</td><td class="r">${money(p.price)}</td></tr>`).join('')}</table></section>`).join('')}</div></div>`;
  $('#q').oninput = e => { const t = e.target.value.toLowerCase(); el.querySelectorAll('tr[data-p]').forEach(r => r.style.display = r.textContent.toLowerCase().includes(t) ? '' : 'none'); };
  const edit = p => {
    const isNew = !p.id;
    modal(`<h3>${isNew ? 'Nuevo producto' : 'Editar producto'}</h3><form class="form">
      <label>Nombre<input name="name" value="${esc(p.name || '')}" required></label>
      <label>Precio<input name="price" type="number" inputmode="numeric" value="${p.price ?? ''}" required></label>
      <label>Categoría<select name="cat">${cats.map(c => `<option value="${c.id}" ${c.id === p.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Descripción<input name="desc" value="${esc(p.desc || '')}"></label>
      <div class="checks">${mods.map(m => `<label class="ck"><input type="checkbox" name="m_${m.id}" ${(p.mods || []).includes(m.id) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('')}</div>
      <div class="checks"><label class="ck"><input type="checkbox" name="kitchen" ${p.kitchen !== false ? 'checked' : ''}> Va a cocina</label><label class="ck"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}> Activo</label></div>
      <div class="btns">${isNew ? '' : '<button type="button" class="btn danger ghost" id="del">Borrar</button>'}<button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn yes">Guardar</button></div></form>`, (m, close) => {
      $('form', m).onsubmit = e => {
        e.preventDefault(); const f = new FormData(e.target);
        DB.put('prods', { ...p, name: f.get('name').trim(), price: +f.get('price') || 0, cat: f.get('cat'), desc: f.get('desc'), kitchen: !!f.get('kitchen'), active: !!f.get('active'), mods: mods.filter(x => f.get('m_' + x.id)).map(x => x.id), pos: p.pos ?? prods.length });
        close(); toast('Guardado');
      };
      $('#del', m) && ($('#del', m).onclick = () => { close(); confirmBox('¿Borrar ' + p.name + '?', () => DB.del('prods', p.id), 'Borrar'); });
    });
  };
  el.querySelectorAll('[data-p]').forEach(r => r.onclick = () => edit(DB.get('prods', r.dataset.p)));
  $('#nuevo').onclick = () => edit({ cat: cats[0]?.id, active: true, kitchen: true, mods: [] });
  $('#cat').onclick = () => ask('Nueva categoría', [{ name: 'name', label: 'Nombre' }], v => { if (!v.name.trim()) return false; DB.put('cats', { id: 'c' + uid(), name: v.name.trim(), pos: cats.length }); });
  $('#aum').onclick = () => ask('Aumentar precios', [{ name: 'cat', label: 'Categoría', type: 'select', options: ['Todas'].concat(cats.map(c => c.name)) }, { name: 'pct', label: 'Porcentaje (ej: 10)', type: 'number', inputmode: 'decimal' }, { name: 'red', label: 'Redondear a', type: 'select', options: ['100', '500', '1000'] }], v => {
    const pct = +v.pct; if (!pct) return false;
    const cid = cats.find(c => c.name === v.cat)?.id; const red = +v.red;
    const l = prods.filter(p => (!cid || p.cat === cid) && p.price > 0);
    confirmBox(`¿Subir ${pct}% a ${l.length} productos?`, () => { l.forEach(p => DB.put('prods', { ...p, price: Math.round(p.price * (1 + pct / 100) / red) * red })); toast('Precios actualizados'); }, 'Subir');
  }, 'Calcular');
}

/* ───────── usuarios ───────── */
function viewUsuarios(el) {
  const us = DB.list('users').sort((a, b) => a.name.localeCompare(b.name));
  el.innerHTML = `<div class="pad narrow"><div class="bar"><h2>Usuarios</h2><button class="btn yes" id="nuevo">+ Usuario</button></div>
    <table class="tbl click">${us.map(u => `<tr data-u="${u.id}" class="${u.active === false ? 'anul' : ''}"><td><b>${esc(u.name)}</b></td><td>${ROLES[u.role].name}</td><td class="muted">PIN ••••</td></tr>`).join('')}</table>
    <p class="muted">Mozo: toma pedidos. Cajero: además cobra y maneja la caja. Encargado: además anula y ve reportes. Cocina: solo la pantalla de cocina.</p></div>`;
  const edit = u => ask(u.id ? 'Editar ' + u.name : 'Nuevo usuario', [
    { name: 'name', label: 'Nombre', value: u.name || '' },
    { name: 'role', label: 'Rol', type: 'select', options: Object.values(ROLES).map(r => r.name), value: u.role ? ROLES[u.role].name : 'Mozo' },
    { name: 'pin', label: 'PIN (4 a 6 números)', type: 'password', inputmode: 'numeric', value: u.pin || '' },
    { name: 'active', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'], value: u.active === false ? 'Inactivo' : 'Activo' }
  ], v => {
    if (!v.name.trim() || !/^\d{4,6}$/.test(v.pin)) { toast('Poné nombre y un PIN de 4 a 6 números', 1); return false; }
    if (DB.list('users').some(x => x.pin === v.pin && x.id !== u.id)) { toast('Ese PIN ya lo usa otra persona', 1); return false; }
    const role = Object.keys(ROLES).find(k => ROLES[k].name === v.role);
    if (u.id === ME.id && role !== 'dueno') { toast('No te podés sacar el rol de dueño', 1); return false; }
    DB.put('users', { ...u, name: v.name.trim(), role, pin: v.pin, active: v.active === 'Activo' });
  });
  el.querySelectorAll('[data-u]').forEach(r => r.onclick = () => edit(DB.get('users', r.dataset.u)));
  $('#nuevo').onclick = () => edit({});
}

/* ───────── ajustes ───────── */
function viewAjustes(el) {
  const s = settings();
  el.innerHTML = `<div class="pad narrow"><h2>Ajustes</h2>
    <h3>Esta pantalla</h3>
    <label class="ck big"><input type="checkbox" id="printer" ${local.get('printer') ? 'checked' : ''}> Esta pantalla tiene la impresora (imprime comandas y tickets de todas)</label>
    <label class="ck big"><input type="checkbox" id="auto" ${local.get('autoTicket') !== false ? 'checked' : ''}> Imprimir ticket al cobrar</label>
    <button class="btn" id="test">Imprimir prueba</button>
    <h3>Local</h3><form class="form" id="loc">
      <label>Nombre en el ticket<input name="local" value="${esc(s.local)}"></label>
      <label>Dirección<input name="dir" value="${esc(s.dir)}"></label>
      <label>Pie del ticket<input name="pie" value="${esc(s.pie)}"></label>
      <label>Zonas y mesas (una por línea: Nombre, cantidad)<textarea name="zonas" rows="3">${s.zonas.map(z => z.name + ', ' + z.mesas).join('\n')}</textarea></label>
      <label>Medios de pago (uno por línea)<textarea name="medios" rows="5">${s.medios.join('\n')}</textarea></label>
      <label>Canales de pedidos (uno por línea)<textarea name="canales" rows="4">${s.canales.join('\n')}</textarea></label>
      <div class="btns"><button class="btn yes">Guardar</button></div></form>
    <h3>Datos</h3>${window.CLOUD_USER ? `<p class="muted">Conectado a la nube con ${esc(window.CLOUD_USER() || '')}</p>` : '<p class="warn">Modo local: los datos quedan solo en esta pantalla.</p>'}<div class="btns left">${window.CLOUD_SIGNOUT ? '<button class="btn ghost" id="sout">Desconectar este dispositivo</button>' : ''}<button class="btn" id="exp">Descargar copia de seguridad</button><label class="btn ghost">Restaurar copia<input type="file" id="imp" accept=".json" hidden></label></div></div>`;
  $('#printer').onchange = e => { local.set('printer', e.target.checked); toast(e.target.checked ? 'Esta pantalla imprime' : 'Esta pantalla ya no imprime'); printerLoop(); };
  $('#auto').onchange = e => local.set('autoTicket', e.target.checked);
  $('#test').onclick = () => printHTML(`<h1>${esc(s.local)}</h1><div class="c">Prueba de impresión ✓</div><hr><div class="c">${new Date().toLocaleString('es-AR')}</div>`);
  $('#loc').onsubmit = e => {
    e.preventDefault(); const f = new FormData(e.target);
    const lines = k => f.get(k).split('\n').map(x => x.trim()).filter(Boolean);
    DB.put('settings', { ...s, local: f.get('local'), dir: f.get('dir'), pie: f.get('pie'), medios: lines('medios'), canales: lines('canales'),
      zonas: lines('zonas').map(l => { const [n, c] = l.split(','); return { name: n.trim(), mesas: Math.max(1, Math.min(80, +c || 1)) }; }) });
    toast('Guardado');
  };
  $('#exp').onclick = async () => { toast('Preparando copia…'); const data = await DB.dump(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = 'shivos-backup-' + dayKey(Date.now()) + '.json'; a.click(); };
  $('#sout') && ($('#sout').onclick = () => confirmBox('¿Desconectar este dispositivo? Para volver a usarlo hay que entrar con Google.', () => window.CLOUD_SIGNOUT(), 'Desconectar'));
  $('#imp').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => confirmBox('¿Reemplazar TODOS los datos por esta copia?', () => { DB.load(JSON.parse(t)); toast('Copia restaurada'); }, 'Restaurar')); };
}

/* ───────── arranque ───────── */
let booted = false;
window.startApp = () => {
  if (booted) return; booted = true;
  seedIfEmpty();
  const saved = sessionStorage.getItem('shv_me');
  if (saved) ME = DB.get('users', saved) || null;
  render();
  printerLoop();
};
if (!window.FIREBASE_CONFIG) window.startApp();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
