/* Morfi — sistema de gestión gastronómica · núcleo */
'use strict';

/* ───────── utilidades ───────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = n => (n < 0 ? '−' : '') + '$ ' + Math.abs(Math.round(n || 0)).toLocaleString('es-AR');
const num = n => (Math.round((n || 0) * 100) / 100).toLocaleString('es-AR');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = t => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const fecha = t => new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const dayStart = k => new Date(k + 'T00:00:00').getTime();
const mins = t => Math.max(0, Math.floor((Date.now() - t) / 60000));
const sum = (l, f) => l.reduce((a, x) => a + (f(x) || 0), 0);
const local = { get: k => { try { return JSON.parse(localStorage.getItem('morfi_' + k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('morfi_' + k, JSON.stringify(v)); } catch { } } };
const csv = (rows, name) => {
  const s = rows.map(r => r.map(c => { c = String(c ?? ''); return /[",;\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + s], { type: 'text/csv' })); a.download = name + '.csv'; a.click();
};
function beep(kind) {
  try {
    const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)());
    [0, .18].slice(0, kind === 'online' ? 2 : 1).forEach(d => {
      const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination);
      o.frequency.value = kind === 'online' ? 1046 : 880; g.gain.setValueAtTime(.25, ac.currentTime + d); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + d + .3);
      o.start(ac.currentTime + d); o.stop(ac.currentTime + d + .32);
    });
  } catch { }
}

/* ───────── base de datos ─────────
   Motor local (demo / una pantalla) y motor nube (cloud.js, todas las pantallas sincronizadas). Misma interfaz. */
const COLS = ['settings', 'cats', 'prods', 'mods', 'users', 'orders', 'kds', 'cash', 'moves', 'prints', 'insumos', 'stockmov', 'proveedores', 'compras', 'gastos', 'clientes', 'ctamov', 'reservas', 'fichajes', 'inbox', 'public'];
const BUS = (() => { const subs = {}; return {
  on: (c, f) => (subs[c] = subs[c] || []).push(f),
  fire: c => { (subs[c] || []).forEach(f => { try { f(); } catch (e) { console.error(e); } }); (subs['*'] || []).forEach(f => f(c)); } }; })();
window.BUS_FIRE = c => BUS.fire(c);
const LocalDB = (() => {
  const K = 'morfidb_';
  let ch = null; try { ch = new BroadcastChannel('morfi'); } catch { }
  const read = c => { try { return JSON.parse(localStorage.getItem(K + c) || '{}'); } catch { return {}; } };
  const write = (c, m) => { try { localStorage.setItem(K + c, JSON.stringify(m)); } catch (e) { toast('Sin espacio en este dispositivo', 1); } ch && ch.postMessage(c); BUS.fire(c); };
  if (ch) ch.onmessage = e => BUS.fire(e.data);
  addEventListener('storage', e => { if (e.key && e.key.startsWith(K)) BUS.fire(e.key.slice(K.length)); });
  return {
    kind: 'local', since: 0,
    list: c => Object.values(read(c)),
    get: (c, id) => read(c)[id],
    put: (c, o) => { const m = read(c); o.id = o.id || uid(); o.upd = Date.now(); m[o.id] = o; write(c, m); return o; },
    del: (c, id) => { const m = read(c); delete m[id]; write(c, m); },
    range: async (c, field, from, to) => Object.values(read(c)).filter(o => o[field] >= from && o[field] < to),
    empty: () => !localStorage.getItem(K + 'settings'),
    dump: async () => { const o = {}; COLS.forEach(c => o[c] = read(c)); return o; },
    load: o => Object.entries(o).forEach(([c, m]) => write(c, m)),
    wipe: () => COLS.forEach(c => localStorage.removeItem(K + c))
  };
})();
const DB = {
  impl: LocalDB,
  list: c => DB.impl.list(c), get: (c, id) => DB.impl.get(c, id), put: (c, o) => DB.impl.put(c, o), del: (c, id) => DB.impl.del(c, id),
  range: (c, f, a, b) => DB.impl.range(c, f, a, b), empty: () => DB.impl.empty(), dump: () => DB.impl.dump(), load: o => DB.impl.load(o),
  on: BUS.on
};
window.DB_USE = impl => { DB.impl = impl; };
// Registros entre dos días. Usa lo que está en memoria si alcanza; si no, consulta y vuelve a dibujar.
const rangeCache = {};
function between(c, field, d1, d2, cb) {
  const from = dayStart(d1), to = dayStart(d2) + 86400000;
  if (from >= (DB.impl.since || 0)) return DB.list(c).filter(o => o[field] >= from && o[field] < to);
  const k = c + d1 + d2;
  if (rangeCache[k] && Date.now() - rangeCache[k].t < 60000) return rangeCache[k].l;
  if (!rangeCache[k] || !rangeCache[k].p) { rangeCache[k] = { p: 1 }; DB.range(c, field, from, to).then(l => { rangeCache[k] = { t: Date.now(), l }; cb(); }); }
  return null;
}

/* ───────── roles y permisos ───────── */
const VIEWS = {
  salon: ['Salón', 'M3 4h18v4H3zM5 8v12M19 8v12M8 12h8'],
  pedidos: ['Pedidos', 'M4 5h16v14H4zM8 9h8M8 13h5'],
  cocina: ['Cocina', 'M6 13a6 6 0 0 1 12 0v6H6zM12 4v3'],
  reservas: ['Reservas', 'M4 6h16v14H4zM4 10h16M9 3v5M15 3v5'],
  caja: ['Caja', 'M3 8h18v11H3zM7 8V5h10v3M12 12v3'],
  ventas: ['Ventas', 'M5 19V9M10 19V5M15 19v-7M20 19V8'],
  clientes: ['Clientes', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0'],
  stock: ['Stock', 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10'],
  compras: ['Compras y gastos', 'M3 4h3l2 11h11l2-8H7M10 20h.01M17 20h.01'],
  reportes: ['Reportes', 'M4 20V4M4 20h16M8 16l4-5 3 3 5-6'],
  productos: ['Carta', 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h4'],
  personal: ['Personal', 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M21 19a6 6 0 0 0-4-5.6'],
  ajustes: ['Ajustes', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 1.8L6 8.3 4 8 3 11l2 1-2 1 1 3 2-.3 1.5 1.5L7 19l3 1 1-2h2l1 2 3-1-.5-1.8 1.5-1.5 2 .3 1-3z']
};
const ROLES = {
  dueno: { name: 'Dueño', views: Object.keys(VIEWS), cobrar: 1, anular: 1, desc: 1, stock: 1 },
  encargado: { name: 'Encargado', views: ['salon', 'pedidos', 'cocina', 'reservas', 'caja', 'ventas', 'clientes', 'stock', 'compras', 'reportes', 'productos', 'personal'], cobrar: 1, anular: 1, desc: 1, stock: 1 },
  cajero: { name: 'Cajero', views: ['salon', 'pedidos', 'cocina', 'reservas', 'caja', 'ventas', 'clientes'], cobrar: 1, anular: 0, desc: 1 },
  mozo: { name: 'Mozo', views: ['salon', 'pedidos', 'reservas'], cobrar: 0, anular: 0, desc: 0 },
  cocina: { name: 'Cocina', views: ['cocina', 'stock'], cobrar: 0, anular: 0, desc: 0 }
};
let ME = null;
const can = k => !!(ME && ROLES[ME.role] && ROLES[ME.role][k]);
const settings = () => ({ ...DEFAULT_SETTINGS, ...(DB.get('settings', 'main') || {}) });
const DEFAULT_SETTINGS = {
  local: 'Mi restaurante', dir: '', tel: '', pie: '¡Gracias por tu visita!', color: '#e4572e',
  zonas: [{ name: 'Salón', mesas: 10 }], estaciones: ['Cocina', 'Barra'],
  medios: ['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'QR Mercado Pago', 'Cuenta corriente'],
  canales: ['Mostrador', 'Teléfono/WhatsApp', 'PedidosYa', 'Rappi'], repartidores: [],
  envios: [{ zona: 'Cerca (hasta 10 cuadras)', precio: 1500 }, { zona: 'Lejos', precio: 2500 }],
  catGastos: ['Servicios', 'Alquiler', 'Sueldos', 'Limpieza', 'Mantenimiento', 'Impuestos', 'Publicidad', 'Otros'],
  propinas: [10, 15], arqueoCiego: false,
  tienda: { activa: true, retiro: true, delivery: true, mesa: true, minimo: 0, mensaje: '' }
};

/* ───────── pedidos: cálculos ───────── */
const itemTotal = it => (it.p + sum(it.mods || [], m => m.p)) * it.q;
function orderCalc(o) {
  const sub = sum(o.items || [], itemTotal);
  const desc = o.desc ? (o.desc.tipo === '%' ? Math.round(sub * o.desc.v / 100) : Math.min(sub, o.desc.v)) : 0;
  const total = Math.max(0, sub - desc) + (o.propina || 0) + (o.envio || 0);
  const pagado = sum(o.pagos || [], p => p.monto);
  return { sub, desc, total, pagado, resta: total - pagado };
}
function nextNum() {
  const hoy = dayKey(Date.now());
  return DB.list('orders').filter(o => dayKey(o.creado) === hoy).reduce((a, o) => Math.max(a, o.num || 0), 0) + 1;
}
const newOrder = data => DB.put('orders', { num: nextNum(), estado: 'abierta', items: [], pagos: [], creado: Date.now(), por: ME ? ME.name : 'Online', ...data });
const orderLabel = o => o.tipo === 'mesa' ? 'Mesa ' + o.mesa : (o.canal || 'Pedido') + ' #' + o.num + (o.cliente && o.cliente.nombre ? ' · ' + o.cliente.nombre : '');
const openCash = () => DB.list('cash').find(c => !c.cerrada);
const prodCost = p => sum(p.receta || [], r => { const i = DB.get('insumos', r.ins); return i ? i.costo * r.qty : 0; });

// cierre definitivo: descuenta stock por receta y registra cuenta corriente
function finalizeOrder(o) {
  if (o.estado === 'cerrada') return;
  const caja = openCash();
  const fin = { ...o, estado: 'cerrada', cerrado: Date.now(), cajaId: o.cajaId || caja?.id || null };
  DB.put('orders', fin);
  const uso = {};
  fin.items.forEach(it => { const p = DB.get('prods', it.pid); (p?.receta || []).forEach(r => uso[r.ins] = (uso[r.ins] || 0) + r.qty * it.q); });
  Object.entries(uso).forEach(([ins, q]) => moveStock(ins, -q, 'venta', orderLabel(fin)));
  (fin.pagos || []).filter(p => p.medio === 'Cuenta corriente' && fin.cliente?.id).forEach(p => DB.put('ctamov', { cli: fin.cliente.id, t: Date.now(), monto: p.monto, ref: orderLabel(fin), por: ME?.name }));
  if (fin.inbox) { const ib = DB.get('inbox', fin.inbox); ib && DB.put('inbox', { ...ib, estado: 'entregado' }); }
}
function moveStock(ins, qty, tipo, ref, costo) {
  const i = DB.get('insumos', ins); if (!i) return;
  const patch = { ...i, stock: Math.round(((i.stock || 0) + qty) * 1000) / 1000 };
  if (costo != null && qty > 0) patch.costo = costo;
  DB.put('insumos', patch);
  DB.put('stockmov', { ins, qty, tipo, ref: ref || '', t: Date.now(), por: ME?.name || '' });
}
const saldoCliente = id => sum(DB.list('ctamov').filter(m => m.cli === id), m => m.monto);

/* ───────── impresión (80 mm) ───────── */
function printHTML(body) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:80mm auto;margin:0}body{width:72mm;margin:0 auto;padding:4mm 0;font:13px/1.35 'Courier New',monospace;color:#000}
    h1{font-size:20px;margin:0 0 4px;text-align:center}h2{font-size:17px;margin:6px 0}.c{text-align:center}
    .row{display:flex;justify-content:space-between;gap:6px}.big{font-size:18px;font-weight:bold}.m{padding-left:12px;font-size:12px}
    hr{border:0;border-top:1px dashed #000;margin:6px 0}.n{font-weight:bold;font-size:16px}
  </style></head><body>${body}</body></html>`);
  d.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 250);
}
function ticketHTML(o, titulo) {
  const s = settings(), c = orderCalc(o);
  return `<h1>${esc(s.local)}</h1><div class="c">${esc(s.dir)}${s.tel ? '<br>' + esc(s.tel) : ''}</div><hr>
    ${titulo ? `<div class="c n">${esc(titulo)}</div><hr>` : ''}
    <div class="row"><span>${esc(orderLabel(o))}</span><span>${fecha(o.creado)} ${hhmm(o.creado)}</span></div>
    ${o.cliente?.dir ? `<div>${esc(o.cliente.dir)} ${esc(o.cliente.tel || '')}</div>` : ''}<hr>
    ${o.items.map(it => `<div class="row"><span>${it.q} ${esc(it.n)}</span><span>${money(itemTotal(it))}</span></div>${(it.mods || []).map(m => `<div class="m">+ ${esc(m.n)}</div>`).join('')}`).join('')}
    <hr>${c.desc ? `<div class="row"><span>Subtotal</span><span>${money(c.sub)}</span></div><div class="row"><span>Descuento</span><span>-${money(c.desc)}</span></div>` : ''}
    ${o.envio ? `<div class="row"><span>Envío</span><span>${money(o.envio)}</span></div>` : ''}
    ${o.propina ? `<div class="row"><span>Propina</span><span>${money(o.propina)}</span></div>` : ''}
    <div class="row big"><span>TOTAL</span><span>${money(c.total)}</span></div>
    ${(o.pagos || []).map(p => `<div class="row"><span>${esc(p.medio)}</span><span>${money(p.monto)}</span></div>`).join('')}
    ${!o.pagos?.length && s.propinas?.length ? `<hr>${s.propinas.map(p => `<div class="row"><span>Propina sugerida ${p}%</span><span>${money(c.total * p / 100)}</span></div>`).join('')}` : ''}
    <hr><div class="c">${esc(s.pie)}</div><div class="c">No válido como factura</div>`;
}
function comandaHTML(k) {
  return `<h2 class="c">${esc((k.station || 'Cocina').toUpperCase())}</h2><div class="row n"><span>${esc(k.label)}</span><span>${hhmm(k.t)}</span></div><div>${esc(k.por || '')}</div><hr>
    ${k.items.map(it => `<div class="n">${it.q} x ${esc(it.n)}</div>${(it.mods || []).map(m => `<div class="m">+ ${esc(m.n)}</div>`).join('')}${it.nota ? `<div class="m">» ${esc(it.nota)}</div>` : ''}`).join('')}
    ${k.nota ? `<hr><div>${esc(k.nota)}</div>` : ''}<hr>`;
}
// Cola de impresión: cualquier pantalla manda; la marcada como "impresora" imprime.
function queuePrint(html, tipo) {
  if (local.get('printer')) return printHTML(html);
  DB.put('prints', { html, tipo, t: Date.now(), done: false });
  toast(tipo === 'comanda' ? 'Comanda enviada a la impresora' : 'Enviado a la impresora');
}
function printerLoop() {
  if (!local.get('printer')) return;
  const j = DB.list('prints').filter(j => !j.done && Date.now() - j.t < 3600000).sort((a, b) => a.t - b.t)[0];
  if (!j) return;
  DB.put('prints', { ...j, done: true });
  printHTML(j.html);
  setTimeout(printerLoop, 1500);
}
BUS.on('prints', () => setTimeout(printerLoop, 300));

/* ───────── UI base ───────── */
function toast(msg, bad) {
  $$('.toast').forEach(x => x.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2600);
}
function modal(html, onMount, wide) {
  const w = document.createElement('div');
  w.className = 'modal-bg';
  w.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog">${html}</div>`;
  w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-close]')) w.remove(); });
  document.body.appendChild(w);
  onMount && onMount(w.firstElementChild, () => w.remove());
  const f = w.querySelector('[autofocus]'); f && f.focus();
  return w;
}
function field(f) {
  const v = f.value ?? '';
  if (f.type === 'select') return `<select name="${f.name}">${f.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  if (f.type === 'textarea') return `<textarea name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea>`;
  return `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.list ? `list="${f.list}"` : ''} ${f.step ? `step="${f.step}"` : ''} autocomplete="off">`;
}
function ask(title, fields, onOk, okText = 'Guardar', extra = '') {
  modal(`<h3>${esc(title)}</h3><form class="form">${fields.map(f => f.type === 'html' ? f.html : `<label class="${f.half ? 'half' : ''}">${esc(f.label)}${field(f)}</label>`).join('')}${extra}
      <div class="btns"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">${esc(okText)}</button></div></form>`,
    (m, close) => {
      const f = $('form', m); const first = $('input:not([type=hidden]),select,textarea', f); first && setTimeout(() => first.focus(), 30);
      f.onsubmit = e => { e.preventDefault(); const v = Object.fromEntries(new FormData(f)); if (onOk(v, m) !== false) close(); };
    });
}
function confirmBox(msg, onYes, yes = 'Sí') {
  modal(`<h3>${esc(msg)}</h3><div class="btns"><button class="btn ghost" data-close>No</button><button class="btn danger" id="cf-y">${esc(yes)}</button></div>`,
    (m, close) => { $('#cf-y', m).onclick = () => { close(); onYes(); }; });
}
const icon = (d, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const empty = (t, sub = '') => `<div class="empty"><b>${esc(t)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
const tabs = (list, cur, attr = 'tab') => `<div class="seg">${list.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-${attr}="${k}">${esc(l)}</button>`).join('')}</div>`;
function bars(rows, total) {
  const mx = Math.max(1, ...rows.map(r => r[1]));
  return rows.map(([k, v]) => `<div class="hb"><span title="${esc(k)}">${esc(k)}</span><i><b style="width:${v / mx * 100}%"></b></i><strong>${money(v)}</strong><em>${total ? Math.round(v / total * 100) : 0}%</em></div>`).join('') || '<p class="muted">Sin datos</p>';
}

/* ───────── tema y marca ───────── */
function applyTheme() {
  const s = settings();
  const r = document.documentElement;
  r.style.setProperty('--acc', s.color || '#e4572e');
  const dark = local.get('theme') === 'dark' || (local.get('theme') == null && matchMedia('(prefers-color-scheme: dark)').matches);
  r.dataset.theme = dark ? 'dark' : 'light';
  document.title = (s.local || 'Morfi') + ' · Morfi';
}

/* ───────── router ───────── */
const app = $('#app');
let route = { v: '', id: null }, rerenderT = null;
const go = (v, id) => { location.hash = id ? `${v}/${id}` : v; };
const parse = () => { const [v, id] = location.hash.slice(1).split('/'); route = { v: v || '', id: id || null }; };
addEventListener('hashchange', () => render());
BUS.on('*', c => {
  if (c === 'prints' || c === 'public') return;
  if (c === 'settings') applyTheme();
  clearTimeout(rerenderT); rerenderT = setTimeout(() => render(true), 80);
});
setInterval(() => { if (['salon', 'pedidos', 'cocina'].includes(route.v)) render(true); }, 30000);
const VIEWFN = {};
function render(soft) {
  if (!window.__started) return;
  parse();
  if (!ME) { if (soft && $('.login .keys')) return; return viewLogin(); }
  const allowed = ROLES[ME.role].views;
  if (route.v === 'orden' && route.id) return shell(VIEWFN.orden, soft);
  if (!allowed.includes(route.v)) return go(allowed[0]);
  shell(VIEWFN[route.v], soft);
}
function shell(view, soft) {
  const ae = document.activeElement;
  if (soft && ae && ae.matches('input,textarea,select') && ae.closest('.main')) return; // no pisar mientras escriben
  if (soft && $('.modal-bg')) return;
  const y = soft ? ($('.main') || {}).scrollTop : 0;
  const s = settings();
  const kdsN = DB.list('kds').filter(k => k.estado === 'pendiente').length;
  const inN = DB.list('inbox').filter(i => i.estado === 'nuevo').length;
  const res = DB.list('reservas').filter(r => r.fecha === dayKey(Date.now()) && ['pendiente', 'confirmada'].includes(r.estado)).length;
  const badge = { cocina: kdsN, pedidos: inN, reservas: res };
  const nav = ROLES[ME.role].views.map(v => `<a href="#${v}" class="${route.v === v || (route.v === 'orden' && v === 'salon') ? 'on' : ''}">${icon(VIEWS[v][1])}<span>${VIEWS[v][0]}</span>${badge[v] ? `<b class="badge ${v === 'pedidos' ? 'hot' : ''}">${badge[v]}</b>` : ''}</a>`).join('');
  app.innerHTML = `<aside class="side"><div class="brand"><span class="dot"></span><div><b>${esc(s.local)}</b><small>Morfi</small></div></div><nav class="nav">${nav}</nav>
    <button class="me" id="me"><span class="av">${esc((ME.name || '?')[0])}</span><span><b>${esc(ME.name)}</b><small>${ROLES[ME.role].name} · salir</small></span></button></aside>
    <main class="main"></main>`;
  $('#me').onclick = () => confirmBox('¿Cerrar sesión de ' + ME.name + '?', () => { ME = null; sessionStorage.removeItem('morfi_me'); render(); }, 'Salir');
  view($('.main'));
  if (y) $('.main').scrollTop = y;
}

/* ───────── ingreso con PIN + fichaje ───────── */
function viewLogin() {
  const s = settings();
  const users = DB.list('users').filter(u => u.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  let sel = null, pin = '', modo = 'entrar';
  app.innerHTML = `<div class="login"><div class="login-box">
    <div class="brand big"><span class="dot"></span><div><b>${esc(s.local)}</b><small>Elegí quién sos</small></div></div>
    <div class="who">${users.map(u => { const on = DB.list('fichajes').some(f => f.user === u.id && !f.out); return `<button class="user" data-u="${u.id}"><span class="av">${esc(u.name[0])}</span>${esc(u.name)}<small>${ROLES[u.role]?.name || ''}${on ? ' · <i class="ok">en turno</i>' : ''}</small></button>`; }).join('')}</div>
    <div class="pinpad hide"><div class="seg sm" id="modo"><button data-m="entrar" class="on">Entrar</button><button data-m="fichar">Fichar entrada/salida</button></div>
    <div class="dots"></div>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '←', 0, 'OK'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div></div>
    ${window.TENANT_SWITCH ? '<button class="btn ghost sm" id="sw" style="margin-top:18px">Cambiar de local</button>' : ''}
    ${DB.impl.kind === 'local' && window.DEMO ? '<p class="muted c" style="margin-top:16px">Modo demo: PIN 1234 (dueño) · 1111 (mozo) · 2222 (cocina)</p>' : ''}
  </div></div>`;
  const pad = $('.pinpad'), dots = $('.dots');
  const draw = () => dots.innerHTML = '<span class="dotp"></span>'.repeat(pin.length) || `<span class="hint">${modo === 'entrar' ? 'Ingresá tu PIN' : 'PIN para fichar'}</span>`;
  $$('.user').forEach(b => b.onclick = () => {
    sel = DB.get('users', b.dataset.u); pin = '';
    $$('.user').forEach(x => x.classList.toggle('on', x === b));
    pad.classList.remove('hide'); draw();
  });
  $$('#modo button').forEach(b => b.onclick = () => { modo = b.dataset.m; $$('#modo button').forEach(x => x.classList.toggle('on', x === b)); pin = ''; draw(); });
  const tryPin = () => {
    if (!(sel && pin === String(sel.pin))) { pin = ''; draw(); dots.classList.add('shake'); setTimeout(() => dots.classList.remove('shake'), 400); return; }
    if (modo === 'fichar') {
      const f = DB.list('fichajes').find(f => f.user === sel.id && !f.out);
      if (f) { DB.put('fichajes', { ...f, out: Date.now() }); toast(`${sel.name}: salida ${hhmm(Date.now())} · ${num((Date.now() - f.in) / 3600000)} h`); }
      else { DB.put('fichajes', { user: sel.id, name: sel.name, in: Date.now() }); toast(`${sel.name}: entrada ${hhmm(Date.now())}`); }
      pin = ''; setTimeout(viewLogin, 600); return;
    }
    ME = sel; sessionStorage.setItem('morfi_me', sel.id); go(ROLES[sel.role].views[0]); render();
  };
  $$('[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === '←') pin = pin.slice(0, -1); else if (k === 'OK') return tryPin(); else if (pin.length < 6) pin += k;
    draw(); if (pin.length >= 4 && sel && pin === String(sel.pin)) tryPin();
  });
  onkeydown = e => { if (!sel || ME || $('.modal-bg')) return; if (/^\d$/.test(e.key) && pin.length < 6) { pin += e.key; draw(); if (pin === String(sel.pin)) tryPin(); } else if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); } else if (e.key === 'Enter') tryPin(); };
  $('#sw') && ($('#sw').onclick = () => window.TENANT_SWITCH());
  if (users.length === 1) $('.user').click();
}

/* ───────── carta pública (QR / tienda online) ───────── */
let pubT = null;
function publishMenu() {
  clearTimeout(pubT);
  pubT = setTimeout(() => {
    const s = settings();
    const cats = DB.list('cats').sort((a, b) => a.pos - b.pos);
    const prods = DB.list('prods').filter(p => p.active !== false && p.online !== false && p.price > 0).sort((a, b) => a.pos - b.pos);
    const mods = DB.list('mods');
    const used = new Set(prods.flatMap(p => p.mods || []));
    const menu = {
      id: 'menu', local: s.local, dir: s.dir, tel: s.tel, color: s.color, tienda: s.tienda, envios: s.envios, mesas: s.zonas,
      cats: cats.filter(c => prods.some(p => p.cat === c.id)).map(c => ({ id: c.id, name: c.name })),
      prods: prods.map(p => ({ id: p.id, cat: p.cat, name: p.name, price: p.price, desc: p.desc || '', mods: p.mods || [], img: p.img || '' })),
      mods: mods.filter(m => used.has(m.id)), t: Date.now()
    };
    const sig = JSON.stringify({ ...menu, t: 0 });
    if (sig === publishMenu.last || (!publishMenu.last && DB.get('public', 'menu') && local.get('pubsig') === sig)) { publishMenu.last = sig; return; }
    publishMenu.last = sig; local.set('pubsig', sig);
    DB.put('public', menu);
  }, 1500);
}
['prods', 'cats', 'mods', 'settings'].forEach(c => BUS.on(c, () => window.__started && publishMenu()));

/* ───────── avisos: pedidos online y comandas nuevas ───────── */
let seenInbox = null, seenKds = null;
BUS.on('inbox', () => {
  const ids = DB.list('inbox').filter(i => i.estado === 'nuevo').map(i => i.id);
  if (seenInbox && ids.some(id => !seenInbox.includes(id)) && ME) { beep('online'); toast('🛎 Nuevo pedido online'); }
  seenInbox = ids;
});
BUS.on('kds', () => {
  const ids = DB.list('kds').filter(i => i.estado === 'pendiente').map(i => i.id);
  if (seenKds && ids.some(id => !seenKds.includes(id)) && route.v === 'cocina') beep();
  seenKds = ids;
});

/* ───────── arranque ───────── */
function seedIfEmpty(tpl) {
  if (!DB.empty()) return;
  const S = (window.TEMPLATES[tpl] || window.TEMPLATES.demo)();
  const P = window.SEED_PATCH;
  if (P) { S.settings = { ...S.settings, local: P.local || S.settings.local }; S.users = [{ ...S.users[0], name: P.owner || S.users[0].name, pin: P.pin || S.users[0].pin }].concat(tpl === 'demo' ? S.users.slice(1) : []); }
  DB.put('settings', { ...DEFAULT_SETTINGS, ...S.settings, id: 'main' });
  ['cats', 'prods', 'mods', 'users', 'insumos', 'proveedores', 'clientes'].forEach(c => (S[c] || []).forEach(x => DB.put(c, x)));
}
window.startApp = (tpl) => {
  window.__started = true;
  seedIfEmpty(tpl);
  applyTheme();
  const saved = sessionStorage.getItem('morfi_me');
  ME = saved ? DB.get('users', saved) || null : null;
  seenInbox = DB.list('inbox').filter(i => i.estado === 'nuevo').map(i => i.id);
  seenKds = DB.list('kds').filter(i => i.estado === 'pendiente').map(i => i.id);
  render();
  printerLoop();
  publishMenu();
};
