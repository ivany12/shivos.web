/* Morfi · servicio: salón, pedidos, pedido/mesa, cobro, cocina */
'use strict';

/* ───────── salón: plano por zonas (como el local real) ───────── */
let zonaSel = 0, planEdit = false, moving = null, salonVista = null;
VIEWFN.salon = el => {
  const s = settings();
  const zonas = s.zonas.length ? s.zonas : [{ name: 'Salón', tables: [] }];
  if (zonaSel >= zonas.length) zonaSel = 0;
  const abiertas = DB.list('orders').filter(o => o.estado === 'abierta' && o.tipo === 'mesa');
  const hoy = dayKey(Date.now());
  const resHoy = DB.list('reservas').filter(r => r.fecha === hoy && ['pendiente', 'confirmada'].includes(r.estado));
  const tot = sum(abiertas, o => orderCalc(o).total);
  const z = zonas[zonaSel];
  const tables = zonaTables(z, zonaSel, zonas);
  const vista = salonVista || local.get('salonVista') || (innerWidth < 600 ? 'lista' : 'plano');
  const cols = Math.max(1, z.cols || 0, ...tables.map(t => t.c + 1)) + (planEdit ? 1 : 0);
  const rows = Math.max(1, z.rows || 0, ...tables.map(t => t.r + 1)) + (planEdit ? 1 : 0);
  const busyIn = zz => zonaTables(zz, zonas.indexOf(zz), zonas).filter(t => abiertas.some(o => o.mesa === t.n)).length;
  const cell = t => {
    const o = abiertas.find(x => x.mesa === t.n);
    const r = !o && resHoy.find(x => x.mesa === t.n);
    const c = o ? orderCalc(o) : null;
    return `<button class="mesa ${t.shape === 'rd' ? 'rd' : ''} ${t.size === 's' ? 'sm' : ''} ${o ? (o.cuenta ? 'bill' : 'busy') : r ? 'res' : ''} ${moving === t.n ? 'moving' : ''}" data-m="${esc(t.n)}" style="grid-row:${t.r + 1};grid-column:${t.c + 1}">
      <b>${esc(t.n)}</b>${o ? `<strong>${money(c.total)}</strong><small>${mins(o.creado)}′${o.pax ? ' · ' + o.pax + 'p' : ''}</small>` : r ? `<small>${esc(r.hora)} ${esc(r.nombre)}</small>` : ''}</button>`;
  };
  let grid = '';
  if (vista === 'plano' || planEdit) {
    const empties = [];
    if (planEdit) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!tables.some(t => t.r === r && t.c === c)) empties.push(`<button class="slot" data-r="${r}" data-c="${c}" style="grid-row:${r + 1};grid-column:${c + 1}">${moving ? 'mover acá' : '+'}</button>`);
    grid = `<div class="plano ${planEdit ? 'edit' : ''}" style="--c:${cols};--r:${rows}">${tables.map(cell).join('')}${empties.join('')}${planEdit ? '' : Array.from({ length: rows }, (_, r) => `<i style="grid-row:${r + 1};grid-column:1"></i>`).join('')}</div>`;
  } else grid = `<div class="mesas">${tables.slice().sort((a, b) => String(a.n).localeCompare(String(b.n), 'es', { numeric: true })).map(t => cell({ ...t, r: -1 }).replace(/style="[^"]*"/, '')).join('')}</div>`;
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Salón</h2><p class="muted">${abiertas.length} mesas abiertas · ${money(tot)} en curso${resHoy.length ? ` · ${resHoy.length} reservas hoy` : ''}</p></div>
    <div class="quick">${planEdit ? '<button class="btn" id="zadd">+ Zona</button><button class="btn" id="zren">Renombrar zona</button><button class="btn ghost danger-t" id="zdel">Borrar zona</button><button class="btn pri" id="pdone">Listo</button>'
      : `${tabs([['plano', 'Plano'], ['lista', 'Lista']], vista, 'vista')}${can('stock') ? '<button class="btn ghost" id="pedit">Editar plano</button>' : ''}`}</div></div>
    <div class="zonetabs">${zonas.map((zz, i) => `<button class="${i === zonaSel ? 'on' : ''}" data-z="${i}">${esc(zz.name)}${busyIn(zz) ? ` <b>${busyIn(zz)}</b>` : ''}</button>`).join('')}</div>
    ${planEdit ? `<p class="hint">${moving ? `Tocá el lugar vacío adonde va la mesa ${esc(moving)}.` : 'Tocá un “+” para agregar una mesa, o una mesa para cambiarle número, forma o lugar.'}</p>` : ''}
    ${tables.length || planEdit ? grid : empty('Esta zona no tiene mesas', can('stock') ? 'Tocá “Editar plano” para armarla.' : '')}
    ${planEdit ? '' : '<div class="legend"><span><i class="lg free"></i>Libre</span><span><i class="lg busy"></i>Ocupada</span><span><i class="lg bill"></i>Pidió la cuenta</span><span><i class="lg res"></i>Reservada</span></div>'}</div>`;
  $$('[data-z]', el).forEach(b => b.onclick = () => { zonaSel = +b.dataset.z; moving = null; render(); });
  $$('[data-vista]', el).forEach(b => b.onclick = () => { salonVista = b.dataset.vista; local.set('salonVista', salonVista); render(); });
  const saveZonas = nz => DB.put('settings', { ...settings(), id: 'main', zonas: nz });
  const curZonas = () => settings().zonas.map((zz, i) => ({ name: zz.name, cols: zz.cols, rows: zz.rows, tables: zonaTables(zz, i, settings().zonas).map(t => ({ ...t })) }));
  const nameTaken = (n, except) => allTables().some(x => x === n && x !== except);
  $('#pedit') && ($('#pedit').onclick = () => { planEdit = true; moving = null; render(); });
  if (planEdit) {
    $('#pdone').onclick = () => { planEdit = false; moving = null; render(); };
    $('#zadd').onclick = () => ask('Nueva zona', [{ name: 'n', label: 'Nombre', ph: 'Ej: Terraza, Barra, Take away' }], v => { if (!v.n.trim()) return false; const nz = curZonas(); nz.push({ name: v.n.trim(), tables: [] }); saveZonas(nz); zonaSel = nz.length - 1; });
    $('#zren').onclick = () => ask('Renombrar zona', [{ name: 'n', label: 'Nombre', value: z.name }], v => { const nz = curZonas(); nz[zonaSel].name = v.n.trim() || z.name; saveZonas(nz); });
    $('#zdel').onclick = () => { if (tables.length) return toast('Primero borrá o mové sus mesas', 1); if (zonas.length < 2) return toast('Tiene que quedar al menos una zona', 1); confirmBox('¿Borrar la zona ' + z.name + '?', () => { const nz = curZonas(); nz.splice(zonaSel, 1); zonaSel = 0; saveZonas(nz); }, 'Borrar'); };
    $$('.slot', el).forEach(b => b.onclick = () => {
      const r = +b.dataset.r, c = +b.dataset.c, nz = curZonas();
      if (moving) { const t = nz.flatMap(x => x.tables).find(t => t.n === moving); nz.forEach(x => x.tables = x.tables.filter(t => t.n !== moving)); nz[zonaSel].tables.push({ ...t, r, c }); moving = null; return saveZonas(nz); }
      const nums = allTables().map(n => parseInt(n, 10)).filter(n => !isNaN(n));
      ask('Nueva mesa', [{ name: 'n', label: 'Número o nombre', value: String((nums.length ? Math.max(...nums) : 0) + 1) }, { name: 'shape', label: 'Forma', type: 'select', options: [['sq', 'Cuadrada'], ['rd', 'Redonda']] }, { name: 'size', label: 'Tamaño', type: 'select', options: [['l', 'Grande'], ['s', 'Chica']] }], v => {
        const n = v.n.trim().toUpperCase(); if (!n) return false; if (nameTaken(n)) { toast('Ya existe la mesa ' + n, 1); return false; }
        nz[zonaSel].tables.push({ n, r, c, shape: v.shape, size: v.size }); saveZonas(nz);
      }, 'Agregar');
    });
    $$('.mesa', el).forEach(b => b.onclick = () => {
      const t = tables.find(x => x.n === b.dataset.m);
      if (moving === t.n) { moving = null; return render(); }
      modal(`<h3>Mesa ${esc(t.n)}</h3><form class="form"><label>Número o nombre<input name="n" value="${esc(t.n)}"></label>
        <div class="grid2"><label>Forma<select name="shape"><option value="sq" ${t.shape !== 'rd' ? 'selected' : ''}>Cuadrada</option><option value="rd" ${t.shape === 'rd' ? 'selected' : ''}>Redonda</option></select></label>
        <label>Tamaño<select name="size"><option value="l" ${t.size !== 's' ? 'selected' : ''}>Grande</option><option value="s" ${t.size === 's' ? 'selected' : ''}>Chica</option></select></label></div>
        <label>Zona<select name="z">${zonas.map((zz, i) => `<option value="${i}" ${i === zonaSel ? 'selected' : ''}>${esc(zz.name)}</option>`).join('')}</select></label>
        <div class="btns"><button type="button" class="btn ghost danger-t" id="del">Borrar</button><button type="button" class="btn" id="mv">Mover de lugar</button><button class="btn pri">Guardar</button></div></form>`, (m, close) => {
        $('#mv', m).onclick = () => { close(); moving = t.n; render(); };
        $('#del', m).onclick = () => { if (abiertas.some(o => o.mesa === t.n)) return toast('La mesa está ocupada', 1); close(); const nz = curZonas(); nz[zonaSel].tables = nz[zonaSel].tables.filter(x => x.n !== t.n); saveZonas(nz); };
        $('form', m).onsubmit = e => {
          e.preventDefault(); const f = new FormData(e.target); const n = f.get('n').trim().toUpperCase();
          if (!n) return; if (n !== t.n && nameTaken(n)) return toast('Ya existe la mesa ' + n, 1);
          if (n !== t.n && abiertas.some(o => o.mesa === t.n)) return toast('Cerrá la mesa antes de renombrarla', 1);
          const nz = curZonas(); nz[zonaSel].tables = nz[zonaSel].tables.filter(x => x.n !== t.n);
          const zi = +f.get('z'); let { r, c } = t;
          if (zi !== zonaSel) { const occ = nz[zi].tables; r = 0; c = 0; while (occ.some(x => x.r === r && x.c === c)) { c++; if (c > 7) { c = 0; r++; } } }
          nz[zi].tables.push({ n, r, c, shape: f.get('shape'), size: f.get('size') }); saveZonas(nz); close();
        };
      });
    });
    return;
  }
  $$('.mesa', el).forEach(b => b.onclick = () => {
    const m = b.dataset.m;
    const o = abiertas.find(x => x.mesa === m);
    if (o) return go('orden', o.id);
    const r = resHoy.find(x => x.mesa === m);
    ask('Abrir mesa ' + m, [{ name: 'pax', label: 'Personas', type: 'number', inputmode: 'numeric', value: r?.pax || 2 }, { name: 'nombre', label: 'Nombre (opcional)', value: r?.nombre || '' }], v => {
      const n = newOrder({ tipo: 'mesa', canal: 'Salón', mesa: m, pax: +v.pax || 0, mozo: ME.name, cliente: v.nombre ? { nombre: v.nombre, tel: r?.tel || '' } : null });
      if (r) DB.put('reservas', { ...r, estado: 'sentada' });
      go('orden', n.id);
    }, 'Abrir');
  });
};

/* ───────── pedidos (mostrador / delivery / apps / online) ───────── */
const FLOW = ['nuevo', 'cocina', 'listo', 'camino', 'entregado'];
const FLOWN = { nuevo: 'Nuevos', cocina: 'En preparación', listo: 'Listos', camino: 'En camino' };
function clienteFields(c = {}) {
  const cl = DB.list('clientes');
  return [{ type: 'html', html: `<datalist id="dl-cli">${cl.slice(0, 500).map(x => `<option value="${esc(x.tel || '')}">${esc(x.nombre)} · ${esc(x.dir || '')}</option>`).join('')}</datalist>` },
    { name: 'tel', label: 'Teléfono (busca clientes)', type: 'tel', list: 'dl-cli', value: c.tel || '' },
    { name: 'nombre', label: 'Nombre', value: c.nombre || '' },
    { name: 'dir', label: 'Dirección (vacío = retira en el local)', value: c.dir || '' }];
}
function bindClienteLookup(m) {
  const tel = $('[name=tel]', m); if (!tel) return;
  tel.addEventListener('input', () => {
    const c = DB.list('clientes').find(x => x.tel && x.tel === tel.value.trim());
    if (c) { $('[name=nombre]', m).value = c.nombre || ''; const d = $('[name=dir]', m); if (d) d.value = c.dir || ''; toast('Cliente encontrado: ' + c.nombre); }
  });
}
function upsertCliente(v) {
  if (!v.nombre && !v.tel) return null;
  let c = v.tel ? DB.list('clientes').find(x => x.tel === v.tel.trim()) : null;
  c = DB.put('clientes', { ...(c || { alta: Date.now() }), nombre: v.nombre || c?.nombre || '', tel: (v.tel || '').trim(), dir: v.dir || c?.dir || '' });
  return { id: c.id, nombre: c.nombre, tel: c.tel, dir: c.dir };
}
VIEWFN.pedidos = el => {
  const s = settings();
  const hoy = dayKey(Date.now());
  const os = DB.list('orders').filter(o => o.tipo !== 'mesa' && o.estado !== 'anulada' && (o.estado === 'abierta' || (o.etapa !== 'entregado' && dayKey(o.creado) === hoy))).sort((a, b) => a.creado - b.creado);
  const inbox = DB.list('inbox').filter(i => i.estado === 'nuevo').sort((a, b) => a.t - b.t);
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Pedidos</h2><p class="muted">${os.length} activos</p></div><div class="quick">${s.canales.map(c => `<button class="btn" data-c="${esc(c)}">+ ${esc(c)}</button>`).join('')}</div></div>
    ${inbox.length ? `<section class="inbox"><h3>🛎 Pedidos online por aceptar</h3>${inbox.map(i => `<div class="card in">
      <div class="row"><b>${esc(i.cliente?.nombre || '')} · ${i.tipo === 'delivery' ? 'Delivery' : i.tipo === 'mesa' ? 'Mesa ' + esc(i.mesa) : 'Retira'}</b><span class="muted">${hhmm(i.t)} · ${mins(i.t)}′</span></div>
      <div class="muted">${esc(i.cliente?.tel || '')} ${esc(i.cliente?.dir || '')}</div>
      <div>${i.items.map(it => `${it.q}× ${esc(it.n)}${(it.mods || []).length ? ' (' + it.mods.map(m => esc(m.n)).join(', ') + ')' : ''}${it.nota ? ' «' + esc(it.nota) + '»' : ''}`).join('<br>')}</div>
      ${i.nota ? `<div class="nota">» ${esc(i.nota)}</div>` : ''}
      <div class="row"><b>${money(i.total)}</b><span class="muted">${esc(i.pago || '')}</span><div class="quick"><button class="btn ghost sm" data-rej="${i.id}">Rechazar</button><button class="btn pri sm" data-acc="${i.id}">Aceptar</button></div></div></div>`).join('')}</section>` : ''}
    <div class="cols">${Object.keys(FLOWN).map(st => {
    const l = os.filter(o => (o.etapa || 'nuevo') === st);
    return `<section class="col"><h3>${FLOWN[st]} <span>${l.length}</span></h3>${l.map(o => {
      const c = orderCalc(o);
      const next = st === 'nuevo' ? 'A preparar →' : st === 'cocina' ? 'Listo →' : st === 'listo' ? (o.cliente?.dir ? 'Despachar →' : 'Entregado ✓') : 'Entregado ✓';
      return `<div class="card ord" data-o="${o.id}"><div class="row"><b>#${o.num} ${esc(o.canal)}</b><span class="t ${mins(o.creado) > 40 ? 'late' : ''}">${mins(o.creado)}′</span></div>
        <div>${esc(o.cliente?.nombre || '')}${o.ref ? ' · app #' + esc(o.ref) : ''}</div>${o.cliente?.dir ? `<div class="muted">📍 ${esc(o.cliente.dir)}</div>` : ''}
        ${o.repartidor ? `<div class="muted">🛵 ${esc(o.repartidor)}</div>` : ''}
        <div class="row"><span class="muted">${sum(o.items, i => i.q)} ítems · ${money(c.total)}</span>${o.items.length ? (c.resta <= 0 ? '<span class="pill ok">pagado</span>' : '<span class="pill warn">a cobrar</span>') : ''}</div>
        <div class="act"><button class="btn sm ${st === 'camino' || next.includes('✓') ? 'pri' : ''}" data-next="${o.id}">${next}</button></div></div>`;
    }).join('') || '<p class="muted pad">—</p>'}</section>`;
  }).join('')}</div></div>`;
  $$('[data-c]', el).forEach(b => b.onclick = () => {
    const canal = b.dataset.c;
    const app = /pedidosya|rappi|uber|didi/i.test(canal);
    const mostr = canal === 'Mostrador';
    const fs = app ? [{ name: 'ref', label: 'N° de pedido en la app', inputmode: 'numeric' }, { name: 'nombre', label: 'Nombre del cliente' }]
      : mostr ? [{ name: 'nombre', label: 'Nombre (para llamarlo)' }] : clienteFields();
    if (!app && !mostr && s.envios.length) fs.push({ name: 'envio', label: 'Envío', type: 'select', options: [['', 'Sin envío / retira']].concat(s.envios.map((e, i) => [i, `${e.zona} · ${money(e.precio)}`])) });
    ask('Nuevo pedido · ' + canal, fs, v => {
      const cli = app || mostr ? (v.nombre ? { nombre: v.nombre } : null) : upsertCliente(v);
      const env = v.envio !== undefined && v.envio !== '' ? s.envios[+v.envio] : null;
      const n = newOrder({ tipo: app || v.dir ? 'delivery' : 'mostrador', canal, etapa: 'nuevo', cliente: cli, ref: v.ref || '', envio: env ? env.precio : 0, zona: env ? env.zona : '' });
      go('orden', n.id);
    }, 'Crear');
    const m = $('.modal'); m && bindClienteLookup(m);
  });
  $$('.ord', el).forEach(c => c.onclick = e => { if (!e.target.closest('[data-next]')) go('orden', c.dataset.o); });
  $$('[data-next]', el).forEach(b => b.onclick = () => advance(DB.get('orders', b.dataset.next)));
  $$('[data-acc]', el).forEach(b => b.onclick = () => acceptOnline(DB.get('inbox', b.dataset.acc)));
  $$('[data-rej]', el).forEach(b => b.onclick = () => ask('Rechazar pedido online', [{ name: 'motivo', label: 'Motivo (lo ve el cliente)', value: 'No podemos tomarlo ahora' }], v => DB.put('inbox', { ...DB.get('inbox', b.dataset.rej), estado: 'rechazado', motivo: v.motivo }), 'Rechazar'));
};
function advance(o) {
  const st = o.etapa || 'nuevo';
  let nx = FLOW[FLOW.indexOf(st) + 1];
  if (st === 'listo' && !o.cliente?.dir) nx = 'entregado';
  if (st === 'nuevo') sendKitchen(o);
  const cur = DB.get('orders', o.id);
  if (nx === 'camino' && settings().repartidores.length) {
    return ask('¿Quién lo lleva?', [{ name: 'r', label: 'Repartidor', type: 'select', options: settings().repartidores }], v => { DB.put('orders', { ...cur, etapa: 'camino', repartidor: v.r, salio: Date.now() }); syncInbox(cur, 'camino'); }, 'Despachar');
  }
  if (nx === 'entregado') {
    if (orderCalc(cur).resta > 0) { if (!can('cobrar')) return toast('Falta cobrarlo', 1); return cobrar(cur.id, true); }
    DB.put('orders', { ...cur, etapa: 'entregado' }); finalizeOrder({ ...cur, etapa: 'entregado' }); return;
  }
  DB.put('orders', { ...cur, etapa: nx }); syncInbox(cur, nx);
}
function syncInbox(o, estado) { if (o.inbox) { const ib = DB.get('inbox', o.inbox); ib && DB.put('inbox', { ...ib, estado }); } }
function acceptOnline(i) {
  const tipo = i.tipo === 'mesa' ? 'mesa' : i.tipo === 'delivery' ? 'delivery' : 'mostrador';
  const items = i.items.map(it => { const p = DB.get('prods', it.pid); return { id: uid(), pid: it.pid, n: p?.name || it.n, p: p?.price ?? it.p, q: it.q, mods: it.mods || [], nota: it.nota || '', station: p?.station || settings().estaciones[0], by: 'Online' }; });
  if (tipo === 'mesa') {
    const open = DB.list('orders').find(o => o.estado === 'abierta' && o.tipo === 'mesa' && o.mesa === i.mesa);
    if (open) { DB.put('orders', { ...open, items: open.items.concat(items) }); DB.put('inbox', { ...i, estado: 'cocina' }); sendKitchen(DB.get('orders', open.id)); toast('Agregado a mesa ' + i.mesa); return; }
  }
  const cli = tipo === 'mesa' ? { nombre: i.cliente?.nombre || '' } : upsertCliente(i.cliente || {});
  const s = settings();
  const env = i.tipo === 'delivery' && i.zona != null ? s.envios.find(e => e.zona === i.zona) : null;
  const o = newOrder({ tipo, canal: tipo === 'mesa' ? 'Salón' : 'Tienda online', mesa: i.mesa || undefined, etapa: tipo === 'mesa' ? undefined : 'nuevo', cliente: cli, items, nota: i.nota || '', inbox: i.id, envio: env ? env.precio : 0, zona: env?.zona || '', pagoPref: i.pago || '' });
  DB.put('inbox', { ...i, estado: 'cocina', orderId: o.id });
  sendKitchen(DB.get('orders', o.id));
  if (tipo !== 'mesa') DB.put('orders', { ...DB.get('orders', o.id), etapa: 'cocina' });
  toast('Pedido aceptado y enviado a cocina');
}

/* ───────── pantalla de pedido / mesa ───────── */
let catSel = null, mobTab = 'carta', lastOrder = null;
VIEWFN.orden = el => {
  const o = DB.get('orders', route.id);
  if (!o) { el.innerHTML = empty('Este pedido ya no existe'); return; }
  const s = settings();
  const cats = DB.list('cats').sort((a, b) => a.pos - b.pos);
  const prods = DB.list('prods').filter(p => p.active !== false).sort((a, b) => a.pos - b.pos);
  if (lastOrder !== o.id) { lastOrder = o.id; catSel = null; mobTab = 'carta'; }
  const fav = prods.filter(p => p.fav);
  if (!catSel || (catSel !== 'fav' && !cats.find(c => c.id === catSel))) catSel = fav.length ? 'fav' : cats[0]?.id;
  const c = orderCalc(o), closed = o.estado !== 'abierta';
  const pend = o.items.filter(i => !i.sent).length;
  const stockMap = Object.fromEntries(DB.list('insumos').map(i => [i.id, i]));
  const sinStock = p => (p.receta || []).some(r => stockMap[r.ins] && stockMap[r.ins].controlar && (stockMap[r.ins].stock || 0) < r.qty);
  el.innerHTML = `<div class="order ${mobTab === 'ticket' ? 'show-ticket' : ''}">
    <section class="carta">
      <div class="bar tight"><button class="btn ghost sm" id="back">← Volver</button><h2>${esc(orderLabel(o))}</h2></div>
      ${closed ? empty('Pedido ' + o.estado, o.estado === 'cerrada' ? 'Cobrado ' + fecha(o.cerrado) + ' ' + hhmm(o.cerrado) + (o.cobro ? ' por ' + o.cobro : '') : o.motivo || '') : `
      <input class="search" id="q" placeholder="Buscar producto…" autocomplete="off">
      <div class="chips">${fav.length ? `<button class="chip ${catSel === 'fav' ? 'on' : ''}" data-cat="fav">★ Favoritos</button>` : ''}${cats.filter(ct => prods.some(p => p.cat === ct.id)).map(ct => `<button class="chip ${ct.id === catSel ? 'on' : ''}" data-cat="${ct.id}">${esc(ct.name)}</button>`).join('')}</div>
      <div class="prods" id="prods"></div>`}
    </section>
    <section class="ticket">
      <div class="tk-head"><b>${esc(orderLabel(o))}</b><span class="muted">${o.pax ? o.pax + ' pers · ' : ''}abierto ${hhmm(o.creado)} · ${esc(o.mozo || o.por)}</span>
        ${o.cliente && (o.cliente.tel || o.cliente.dir) ? `<span class="muted">${esc(o.cliente.tel || '')} ${o.cliente.dir ? '· 📍 ' + esc(o.cliente.dir) : ''}</span>` : ''}
        ${o.cliente?.id && saldoCliente(o.cliente.id) > 0 ? `<span class="pill warn">Debe ${money(saldoCliente(o.cliente.id))}</span>` : ''}
        ${o.pagoPref ? `<span class="pill">Paga con: ${esc(o.pagoPref)}</span>` : ''}${o.nota ? `<span class="nota">» ${esc(o.nota)}</span>` : ''}</div>
      <div class="items">${o.items.map((it, i) => `<div class="it ${it.sent ? 'sent' : ''}">
        <div class="qty">${closed ? `<b>${it.q}</b>` : `<button data-q="${i}" data-d="-1" aria-label="menos">−</button><b>${it.q}</b><button data-q="${i}" data-d="1" aria-label="más">+</button>`}</div>
        <div class="it-n" data-edit="${i}">${esc(it.n)}${(it.mods || []).map(m => `<small>+ ${esc(m.n)}${m.p ? ' ' + money(m.p) : ''}</small>`).join('')}${it.nota ? `<small class="nota">» ${esc(it.nota)}</small>` : ''}</div>
        <div class="it-p">${money(itemTotal(it))}${it.sent ? '<small>✓ enviado</small>' : ''}</div></div>`).join('') || empty('Sin productos', 'Tocá los productos de la carta para agregarlos')}</div>
      <div class="tot">
        ${c.desc || o.envio || o.propina ? `<div class="row"><span>Subtotal</span><span>${money(c.sub)}</span></div>` : ''}
        ${c.desc ? `<div class="row"><span>Descuento ${o.desc.tipo === '%' ? o.desc.v + '%' : ''}</span><span>−${money(c.desc)}</span></div>` : ''}
        ${o.envio ? `<div class="row"><span>Envío ${esc(o.zona || '')}</span><span>${money(o.envio)}</span></div>` : ''}
        ${o.propina ? `<div class="row"><span>Propina</span><span>${money(o.propina)}</span></div>` : ''}
        ${c.pagado ? `<div class="row ok"><span>Pagado (${(o.pagos || []).map(p => esc(p.medio)).join(', ')})</span><span>${money(c.pagado)}</span></div>` : ''}
        <div class="row big"><span>${c.pagado && c.resta > 0 ? 'Falta' : 'Total'}</span><span>${money(c.pagado && c.resta > 0 ? c.resta : c.total)}</span></div></div>
      ${closed ? `<div class="acts"><button class="btn" id="print">Reimprimir ticket</button>${can('anular') && o.estado === 'cerrada' ? '<button class="btn ghost" id="reopen">Reabrir</button>' : ''}</div>` : `
      <div class="acts">
        <button class="btn pri wide" id="send" ${pend ? '' : 'disabled'}>Enviar a cocina${pend ? ` (${pend})` : ''}</button>
        <button class="btn" id="cuenta">Precuenta</button>
        <button class="btn" id="desc" ${can('desc') ? '' : 'disabled'}>Descuento</button>
        ${can('cobrar') ? `<button class="btn ok wide" id="cobrar" ${o.items.length ? '' : 'disabled'}>Cobrar ${money(c.resta)}</button>` : ''}
        ${o.tipo === 'mesa' ? '<button class="btn ghost" id="mover">Mover / juntar</button>' : '<button class="btn ghost" id="cli">Cliente</button>'}
        <button class="btn ghost" id="nota">Nota</button>
        <button class="btn ghost danger-t wide" id="anular">${o.items.length ? 'Anular pedido' : 'Borrar'}</button>
      </div>`}
    </section>
    <button class="mob-toggle" id="mobt">${mobTab === 'carta' ? `Ver pedido · ${sum(o.items, i => i.q)} · ${money(c.total)}` : '← Volver a la carta'}</button>
  </div>`;

  $('#back').onclick = () => go(o.tipo === 'mesa' ? 'salon' : 'pedidos');
  $('#mobt').onclick = () => { mobTab = mobTab === 'carta' ? 'ticket' : 'carta'; render(); };
  const save = patch => DB.put('orders', { ...DB.get('orders', o.id), ...patch });

  if (closed) {
    $('#print').onclick = () => queuePrint(ticketHTML(o), 'ticket');
    $('#reopen') && ($('#reopen').onclick = () => confirmBox('¿Reabrir? Se borran los pagos registrados (el stock ya descontado no se devuelve).', () => save({ estado: 'abierta', pagos: [], cerrado: null, cajaId: null })));
    return;
  }
  const grid = $('#prods'), q = $('#q');
  const drawProds = () => {
    const t = q.value.trim().toLowerCase();
    const l = t ? prods.filter(p => p.name.toLowerCase().includes(t)) : catSel === 'fav' ? fav : prods.filter(p => p.cat === catSel);
    grid.innerHTML = l.map(p => { const pr = promoFor(p); return `<button class="prod ${sinStock(p) ? 'out' : ''}" data-p="${p.id}">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : ''}<b>${esc(p.name)}</b><span>${money(p.price)}${pr ? ` <i class="promo">−${pr.pct}%</i>` : ''}</span>${sinStock(p) ? '<em>sin stock</em>' : ''}</button>`; }).join('') || '<p class="muted">Sin resultados</p>';
    $$('.prod', grid).forEach(b => b.onclick = () => addProduct(DB.get('prods', b.dataset.p)));
  };
  q.oninput = drawProds;
  $$('[data-cat]', el).forEach(b => b.onclick = () => { catSel = b.dataset.cat; q.value = ''; $$('[data-cat]', el).forEach(x => x.classList.toggle('on', x === b)); drawProds(); });
  drawProds();

  const addProduct = p => {
    const groups = (p.mods || []).map(id => DB.get('mods', id)).filter(Boolean);
    const push = (mods, nota, qty = 1, price) => {
      const cur = DB.get('orders', o.id);
      const pr = price ?? p.price;
      const promo = price == null ? promoFor(p) : null;
      if (promo) mods = mods.concat({ g: 'promo', n: promo.nombre + ' −' + promo.pct + '%', p: -Math.round((pr + sum(mods, m => m.p)) * promo.pct / 100) });
      const same = cur.items.find(i => !i.sent && i.pid === p.id && i.p === pr && JSON.stringify(i.mods) === JSON.stringify(mods) && (i.nota || '') === (nota || ''));
      if (same) same.q += qty; else cur.items.push({ id: uid(), pid: p.id, n: p.name, p: pr, q: qty, mods, nota: nota || '', station: p.station || settings().estaciones[0], by: ME.name });
      DB.put('orders', cur);
      toast('+ ' + p.name + (promo ? ' · ' + promo.nombre : ''));
    };
    if (p.libre) return ask(p.name, [{ name: 'n', label: 'Descripción', value: '' }, { name: 'p', label: 'Precio', type: 'number', inputmode: 'numeric' }], v => { if (!+v.p) return false; push([], v.n, 1, +v.p); }, 'Agregar');
    if (!groups.length) return push([], '');
    itemOptions(p, groups, [], '', push);
  };

  $$('[data-q]', el).forEach(b => b.onclick = () => {
    const cur = DB.get('orders', o.id), it = cur.items[+b.dataset.q], d = +b.dataset.d;
    if (it.sent && d < 0 && !can('anular')) return toast('Ya se envió: pedile al encargado', 1);
    const apply = motivo => { it.q += d; if (motivo) (cur.bajas = cur.bajas || []).push({ n: it.n, q: 1, motivo, por: ME.name, t: Date.now() }); if (it.q <= 0) cur.items.splice(+b.dataset.q, 1); DB.put('orders', cur); };
    if (it.sent && d < 0) ask(`Sacar 1 ${it.n}`, [{ name: 'm', label: 'Motivo', value: 'Error de carga' }], v => apply(v.m || 'Sin motivo'), 'Sacar'); else apply();
  });
  $$('[data-edit]', el).forEach(d => d.onclick = () => {
    const cur = DB.get('orders', o.id), it = cur.items[+d.dataset.edit];
    if (it.sent) return toast('Ya se envió a cocina');
    const p = DB.get('prods', it.pid) || { name: it.n, price: it.p, mods: [] };
    const groups = (p.mods || []).map(id => DB.get('mods', id)).filter(Boolean);
    itemOptions(p, groups, it.mods || [], it.nota, (mods, nota) => { it.mods = mods; it.nota = nota; DB.put('orders', cur); });
  });
  $('#send').onclick = () => sendKitchen(DB.get('orders', o.id));
  $('#cuenta').onclick = () => { const cur = DB.get('orders', o.id); save({ cuenta: true }); queuePrint(ticketHTML(cur, 'PRECUENTA'), 'ticket'); };
  $('#desc').onclick = () => ask('Descuento y propina', [
    { name: 'tipo', label: 'Tipo de descuento', type: 'select', options: [['%', 'Porcentaje'], ['$', 'Monto fijo']], value: o.desc?.tipo || '%' },
    { name: 'v', label: 'Valor (0 = sin descuento)', type: 'number', inputmode: 'decimal', value: o.desc?.v || '' },
    { name: 'motivo', label: 'Motivo', value: o.desc?.motivo || '' },
    { name: 'propina', label: 'Propina $', type: 'number', inputmode: 'numeric', value: o.propina || '' }],
    v => save({ desc: +v.v ? { tipo: v.tipo, v: +v.v, motivo: v.motivo, por: ME.name } : null, propina: +v.propina || 0 }));
  $('#nota').onclick = () => ask('Nota del pedido', [{ name: 'nota', label: 'Nota para cocina', value: o.nota || '' }], v => save({ nota: v.nota }));
  $('#cli') && ($('#cli').onclick = () => {
    const s2 = settings();
    ask('Datos del cliente', clienteFields(o.cliente || {}).concat(s2.envios.length ? [{ name: 'envio', label: 'Envío', type: 'select', value: s2.envios.findIndex(e => e.zona === o.zona), options: [['-1', 'Sin envío / retira']].concat(s2.envios.map((e, i) => [i, `${e.zona} · ${money(e.precio)}`])) }] : []), v => {
      const env = v.envio != null && +v.envio >= 0 ? s2.envios[+v.envio] : null;
      save({ cliente: upsertCliente(v), envio: env ? env.precio : 0, zona: env?.zona || '', tipo: v.dir || o.tipo === 'delivery' && o.ref ? 'delivery' : o.tipo });
    });
    bindClienteLookup($('.modal'));
  });
  $('#mover') && ($('#mover').onclick = () => ask('Mover a otra mesa', [{ name: 'mesa', label: 'Mesa destino' }], v => {
    const m = v.mesa.trim().toUpperCase(); if (!m) return false;
    const busy = DB.list('orders').find(x => x.estado === 'abierta' && x.tipo === 'mesa' && x.mesa === m && x.id !== o.id);
    if (busy) confirmBox(`La mesa ${m} está ocupada. ¿Juntar las dos cuentas?`, () => {
      const cur = DB.get('orders', o.id); DB.put('orders', { ...busy, items: busy.items.concat(cur.items), pagos: (busy.pagos || []).concat(cur.pagos || []), pax: (busy.pax || 0) + (cur.pax || 0) });
      DB.put('orders', { ...cur, estado: 'anulada', motivo: 'Unida a mesa ' + m, items: [], pagos: [] }); go('orden', busy.id);
    }, 'Juntar');
    else save({ mesa: m });
  }, 'Mover'));
  $('#anular').onclick = () => {
    const cur = DB.get('orders', o.id);
    if (!cur.items.length) { DB.del('orders', o.id); return go(o.tipo === 'mesa' ? 'salon' : 'pedidos'); }
    if (!can('anular')) return toast('Solo el encargado puede anular', 1);
    ask('Anular ' + orderLabel(cur), [{ name: 'motivo', label: 'Motivo', ph: 'Ej: se fueron, error de carga' }], v => {
      DB.put('orders', { ...cur, estado: 'anulada', motivo: v.motivo || 'Sin motivo', anuladaPor: ME.name, cerrado: Date.now() });
      DB.list('kds').filter(k => k.orderId === cur.id && k.estado === 'pendiente').forEach(k => DB.put('kds', { ...k, estado: 'anulado' }));
      syncInbox(cur, 'rechazado');
      go(o.tipo === 'mesa' ? 'salon' : 'pedidos');
    }, 'Anular');
  };
  $('#cobrar') && ($('#cobrar').onclick = () => cobrar(o.id));
};

function itemOptions(p, groups, sel, nota, done) {
  const has = (g, n) => sel.some(m => m.g === g.id && m.n === n);
  let qty = 1;
  modal(`<h3>${esc(p.name)} <span class="muted">${money(p.price)}</span></h3>${p.desc ? `<p class="muted">${esc(p.desc)}</p>` : ''}
    ${groups.map(g => `<div class="grp" data-g="${g.id}"><h4>${esc(g.name)} ${g.min ? '<em>obligatorio</em>' : g.max > 1 ? `<em class="muted">hasta ${g.max}</em>` : ''}</h4><div class="opts">
      ${g.opts.map(op => `<button type="button" class="opt ${has(g, op.n) ? 'on' : ''}" data-n="${esc(op.n)}" data-p="${op.p}">${esc(op.n)}${op.p ? ` <small>+${money(op.p)}</small>` : ''}</button>`).join('')}</div></div>`).join('')}
    <label class="form">Aclaración<input id="it-nota" value="${esc(nota)}" placeholder="Ej: sin cebolla, bien cocida"></label>
    ${sel.length || nota ? '' : '<div class="row qtyrow"><span>Cantidad</span><div class="qty"><button type="button" id="qm">−</button><b id="qv">1</b><button type="button" id="qp">+</button></div></div>'}
    <div class="btns"><button class="btn ghost" data-close>Cancelar</button><button class="btn pri" id="ok">Agregar</button></div>`, (m, close) => {
    $$('.grp', m).forEach(gEl => {
      const g = groups.find(x => x.id === gEl.dataset.g);
      $$('.opt', gEl).forEach(b => b.onclick = () => {
        if (g.max === 1) $$('.opt', gEl).forEach(x => x !== b && x.classList.remove('on'));
        else if (!b.classList.contains('on') && $$('.opt.on', gEl).length >= (g.max || 99)) return toast('Máximo ' + g.max);
        b.classList.toggle('on');
      });
    });
    $('#qm', m) && ($('#qm', m).onclick = () => { qty = Math.max(1, qty - 1); $('#qv', m).textContent = qty; });
    $('#qp', m) && ($('#qp', m).onclick = () => { qty++; $('#qv', m).textContent = qty; });
    $('#ok', m).onclick = () => {
      const mods = []; let bad = null;
      $$('.grp', m).forEach(gEl => {
        const g = groups.find(x => x.id === gEl.dataset.g);
        const on = $$('.opt.on', gEl);
        if (on.length < (g.min || 0)) bad = g.name;
        on.forEach(b => mods.push({ g: g.id, n: b.dataset.n, p: +b.dataset.p }));
      });
      if (bad) return toast('Elegí ' + bad.toLowerCase(), 1);
      close(); done(mods, $('#it-nota', m).value.trim(), qty);
    };
  });
}

function sendKitchen(o) {
  const nuevos = o.items.filter(i => !i.sent);
  if (!nuevos.length) return;
  const est = settings().estaciones;
  const byStation = {};
  nuevos.forEach(i => { const p = DB.get('prods', i.pid); const st = i.station || p?.station || est[0]; if (st === 'Ninguna' || p?.kitchen === false) return; (byStation[st] = byStation[st] || []).push(i); });
  Object.entries(byStation).forEach(([station, items]) => {
    const k = DB.put('kds', { orderId: o.id, label: orderLabel(o), canal: o.canal, tipo: o.tipo, station, por: ME?.name || 'Online', nota: o.nota || '', t: Date.now(), estado: 'pendiente', items: items.map(i => ({ n: i.n, q: i.q, mods: i.mods, nota: i.nota })) });
    if (local.get('printComandas') !== false) queuePrint(comandaHTML(k), 'comanda');
  });
  nuevos.forEach(i => i.sent = true);
  const cur = DB.get('orders', o.id) || o;
  DB.put('orders', { ...cur, items: o.items, etapa: o.tipo !== 'mesa' && (o.etapa || 'nuevo') === 'nuevo' ? 'cocina' : o.etapa });
  if (!Object.keys(byStation).length) toast('Marcado como enviado');
}

/* ───────── cobrar (parcial, dividido, cuenta corriente) ───────── */
function cobrar(id, entregar) {
  const caja = openCash();
  if (!caja) { toast('Primero abrí la caja', 1); return go('caja'); }
  const o0 = DB.get('orders', id);
  if (o0.items.some(i => !i.sent) && o0.tipo === 'mesa') sendKitchen(o0);
  const s = settings();
  const prev = (o0.pagos || []).length;
  let pagos = (o0.pagos || []).slice();
  modal(`<h3>Cobrar · ${esc(orderLabel(o0))}</h3><div class="pay-total" id="pt"></div>
    <div class="split"><span class="muted">Dividir:</span>${[2, 3, 4, 5, 6].map(n => `<button class="chip" data-split="${n}">÷${n}</button>`).join('')}</div>
    <div class="medios">${s.medios.map(m => `<button class="btn medio" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>
    <div id="pl"></div>
    <div class="btns"><button class="btn ghost" data-close>Cancelar</button><button class="btn" id="parcial">Guardar pago parcial</button><button class="btn ok" id="fin">Cerrar cuenta</button></div>`, (m, close) => {
    const tot = () => orderCalc({ ...DB.get('orders', id), pagos });
    const drawTot = () => { const t = tot(); $('#pt', m).innerHTML = `<div class="row big"><span>Total</span><span>${money(t.total)}</span></div><div class="row ${t.resta > 0 ? 'warn' : 'ok'}"><span>${t.resta > 0 ? 'Falta' : 'Vuelto'}</span><span>${money(Math.abs(t.resta))}</span></div>`; };
    const draw = () => {
      drawTot();
      $('#pl', m).innerHTML = pagos.map((p, i) => `<div class="row payrow"><span>${esc(p.medio)}${i < prev ? ' <small class="muted">(ya pagado)</small>' : ''}</span>${i < prev ? `<b>${money(p.monto)}</b>` : `<input inputmode="numeric" data-i="${i}" value="${p.monto}"><button class="btn ghost sm" data-x="${i}">✕</button>`}</div>`).join('');
      $$('[data-i]', m).forEach(inp => inp.oninput = () => { pagos[+inp.dataset.i].monto = +inp.value.replace(/\D/g, '') || 0; drawTot(); });
      $$('[data-x]', m).forEach(b => b.onclick = () => { pagos.splice(+b.dataset.x, 1); draw(); });
    };
    $$('.medio', m).forEach(b => b.onclick = () => {
      if (b.dataset.m === 'Cuenta corriente' && !DB.get('orders', id).cliente?.id) return toast('Para cuenta corriente asigná un cliente (botón Cliente)', 1);
      pagos.push({ medio: b.dataset.m, monto: Math.max(0, tot().resta), por: ME.name, t: Date.now() }); draw();
      const inp = m.querySelector(`[data-i="${pagos.length - 1}"]`); inp && inp.select();
    });
    $$('[data-split]', m).forEach(b => b.onclick = () => {
      const n = +b.dataset.split, t = tot();
      const parte = Math.ceil(t.resta / n);
      toast(`${n} partes de ${money(parte)}`);
      $('#pt', m).insertAdjacentHTML('beforeend', `<div class="row muted"><span>Cada uno (÷${n})</span><span>${money(parte)}</span></div>`);
    });
    $('#parcial', m).onclick = () => {
      if (pagos.length === prev) return toast('Agregá un pago', 1);
      if (tot().resta < 0) return toast('El pago supera el total', 1);
      DB.put('orders', { ...DB.get('orders', id), pagos, cajaId: caja.id }); close(); toast('Pago parcial guardado');
    };
    $('#fin', m).onclick = () => {
      const cur = DB.get('orders', id), t = tot();
      if (!pagos.length) return toast('Elegí cómo paga', 1);
      if (t.resta > 0) return toast('Falta cobrar ' + money(t.resta), 1);
      if (t.resta < 0) { const ef = pagos.slice(prev).find(p => /efectivo/i.test(p.medio)); if (ef) { ef.vuelto = -t.resta; ef.monto += t.resta; } else return toast('El monto supera el total', 1); }
      const fin = { ...cur, pagos, cajaId: caja.id, cobro: ME.name };
      close();
      if (cur.tipo === 'mesa' || entregar || cur.etapa === 'entregado' || (cur.etapa === 'listo' && !cur.cliente?.dir)) { finalizeOrder({ ...fin, etapa: cur.tipo === 'mesa' ? undefined : 'entregado' }); }
      else DB.put('orders', fin);
      if (local.get('autoTicket') !== false) queuePrint(ticketHTML(DB.get('orders', id)), 'ticket');
      toast('Cobrado ✓' + (pagos.find(p => p.vuelto) ? ' · vuelto ' + money(pagos.find(p => p.vuelto).vuelto) : ''));
      if (cur.tipo === 'mesa') go('salon');
    };
    draw();
  });
}

/* ───────── cocina (KDS por estación) ───────── */
VIEWFN.cocina = el => {
  const est = settings().estaciones;
  const sel = local.get('kdsStation') || 'Todas';
  const all = DB.list('kds');
  const ks = all.filter(k => k.estado === 'pendiente' && (sel === 'Todas' || (k.station || est[0]) === sel)).sort((a, b) => a.t - b.t);
  const done = all.filter(k => k.estado === 'listo' && Date.now() - k.listo < 3600000 && (sel === 'Todas' || k.station === sel)).sort((a, b) => b.listo - a.listo).slice(0, 10);
  const avg = done.length ? Math.round(sum(done, k => (k.listo - k.t) / 60000) / done.length) : null;
  // resumen de producción: cuántas de cada cosa hay que hacer
  const prod = {}; ks.forEach(k => k.items.forEach((it, i) => { if (!(k.hechos || []).includes(i)) prod[it.n] = (prod[it.n] || 0) + it.q; }));
  el.innerHTML = `<div class="page kitchen"><div class="bar"><div><h2>Cocina</h2><p class="muted">${ks.length} comandas · ${avg != null ? 'promedio ' + avg + ' min' : ''}</p></div>
    ${tabs([['Todas', 'Todas']].concat(est.map(e => [e, e])), sel, 'st')}</div>
    ${Object.keys(prod).length ? `<div class="prodsum">${Object.entries(prod).sort((a, b) => b[1] - a[1]).map(([n, q]) => `<span><b>${q}</b> ${esc(n)}</span>`).join('')}</div>` : ''}
    <div class="kds">${ks.map(k => `<div class="kc ${mins(k.t) > 20 ? 'late' : mins(k.t) > 12 ? 'warn' : ''}"><div class="kh"><b>${esc(k.label)}</b><span>${mins(k.t)}′</span></div>
      <div class="kmeta">${esc(k.station || '')} · ${esc(k.por || '')} · ${hhmm(k.t)}</div>
      <div class="ki">${k.items.map((it, i) => `<div class="kit ${(k.hechos || []).includes(i) ? 'done' : ''}" data-k="${k.id}" data-i="${i}"><b>${it.q}</b> ${esc(it.n)}${(it.mods || []).map(m => `<small>+ ${esc(m.n)}</small>`).join('')}${it.nota ? `<small class="nota">» ${esc(it.nota)}</small>` : ''}</div>`).join('')}
      ${k.nota ? `<div class="kit nota">${esc(k.nota)}</div>` : ''}</div>
      <button class="btn pri wide" data-ok="${k.id}">Listo ✓</button></div>`).join('') || empty('Nada pendiente', 'Las comandas aparecen acá al instante')}</div>
    ${done.length ? `<h3>Últimos listos</h3><div class="done-list">${done.map(k => `<button class="chip" data-back="${k.id}">${esc(k.label)} · ${hhmm(k.listo)} ↺</button>`).join('')}</div>` : ''}</div>`;
  $$('[data-st]', el).forEach(b => b.onclick = () => { local.set('kdsStation', b.dataset.st); render(); });
  $$('.kit[data-k]', el).forEach(d => d.onclick = () => {
    const k = DB.get('kds', d.dataset.k), i = +d.dataset.i; const h = k.hechos || [];
    DB.put('kds', { ...k, hechos: h.includes(i) ? h.filter(x => x !== i) : h.concat(i) });
  });
  $$('[data-ok]', el).forEach(b => b.onclick = () => {
    const k = DB.get('kds', b.dataset.ok); DB.put('kds', { ...k, estado: 'listo', listo: Date.now() });
    const o = DB.get('orders', k.orderId);
    if (o && o.tipo !== 'mesa' && o.etapa === 'cocina' && !DB.list('kds').some(x => x.orderId === o.id && x.estado === 'pendiente' && x.id !== k.id)) { DB.put('orders', { ...o, etapa: 'listo' }); syncInbox(o, 'listo'); }
  });
  $$('[data-back]', el).forEach(b => b.onclick = () => DB.put('kds', { ...DB.get('kds', b.dataset.back), estado: 'pendiente' }));
};
