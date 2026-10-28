/* Morfi · gestión: caja, ventas, reportes */
'use strict';

/* ───────── caja ───────── */
function cashSummary(c) {
  const os = DB.list('orders').filter(o => o.cajaId === c.id && o.estado !== 'anulada');
  const por = {}; let total = 0, propinas = 0;
  os.forEach(o => { (o.pagos || []).forEach(p => { por[p.medio] = (por[p.medio] || 0) + p.monto; total += p.monto; }); propinas += o.propina || 0; });
  const mv = DB.list('moves').filter(m => m.cajaId === c.id).sort((a, b) => a.t - b.t);
  const ing = sum(mv.filter(m => m.tipo === 'ingreso'), m => m.monto);
  const egr = sum(mv.filter(m => m.tipo === 'egreso'), m => m.monto);
  const efectivo = (c.inicial || 0) + (por['Efectivo'] || 0) + ing - egr;
  return { os, por, total, mv, ing, egr, efectivo, propinas, cerradas: os.filter(o => o.estado === 'cerrada').length };
}
VIEWFN.caja = el => {
  const c = openCash();
  const s = settings();
  const prev = DB.list('cash').filter(x => x.cerrada).sort((a, b) => b.cerrada - a.cerrada).slice(0, 15);
  if (!c) {
    el.innerHTML = `<div class="page narrow"><div class="hero-card"><h2>Caja cerrada</h2><p class="muted">Abrí la caja para empezar a cobrar.</p><button class="btn pri big" id="abrir">Abrir caja</button></div>
      ${prev.length ? `<h3>Cierres anteriores</h3><div class="tbl-wrap"><table class="tbl"><tr><th>Apertura</th><th>Abrió / cerró</th><th class="r">Ventas</th><th class="r">Diferencia</th></tr>${prev.map(p => `<tr data-c="${p.id}"><td>${fecha(p.abierta)} ${hhmm(p.abierta)}–${hhmm(p.cerrada)}</td><td>${esc(p.por)} / ${esc(p.cerro)}</td><td class="r">${money(p.resumen?.total)}</td><td class="r ${p.dif < 0 ? 'bad' : p.dif > 0 ? 'ok' : ''}">${money(p.dif)}</td></tr>`).join('')}</table></div>` : ''}</div>`;
    $('#abrir').onclick = () => ask('Abrir caja', [{ name: 'inicial', label: 'Efectivo inicial (cambio)', type: 'number', inputmode: 'numeric', value: prev[0]?.dejado ?? '' }], v => { DB.put('cash', { abierta: Date.now(), inicial: +v.inicial || 0, por: ME.name }); }, 'Abrir');
    $$('[data-c]', el).forEach(r => r.onclick = () => verCierre(DB.get('cash', r.dataset.c)));
    return;
  }
  const r = cashSummary(c);
  const abiertas = DB.list('orders').filter(o => o.estado === 'abierta' && o.items.length);
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Caja</h2><p class="muted">Abierta ${hhmm(c.abierta)} por ${esc(c.por)}</p></div>
    <div class="quick"><button class="btn" id="ing">+ Ingreso</button><button class="btn" id="egr">− Retiro / gasto</button><button class="btn danger" id="cerrar">Cerrar caja</button></div></div>
    <div class="kpis"><div class="kpi"><small>Cobrado</small><b>${money(r.total)}</b></div><div class="kpi"><small>Ventas cerradas</small><b>${r.cerradas}</b></div>
    <div class="kpi"><small>Efectivo en caja</small><b>${s.arqueoCiego && !can('anular') ? '•••' : money(r.efectivo)}</b></div><div class="kpi"><small>Cuentas abiertas</small><b>${abiertas.length}</b><span class="muted">${money(sum(abiertas, o => orderCalc(o).resta))}</span></div></div>
    <div class="two"><div class="card"><h3>Por medio de pago</h3>${bars(Object.entries(r.por).sort((a, b) => b[1] - a[1]), r.total)}${r.propinas ? `<p class="muted">Propinas cobradas: ${money(r.propinas)}</p>` : ''}</div>
    <div class="card"><h3>Movimientos de efectivo</h3><table class="tbl plain"><tr><td>Inicial</td><td></td><td class="r">${money(c.inicial)}</td></tr>${r.mv.map(m => `<tr><td>${hhmm(m.t)} ${esc(m.concepto)}</td><td class="muted">${esc(m.por)}</td><td class="r ${m.tipo === 'egreso' ? 'bad' : 'ok'}">${m.tipo === 'egreso' ? '−' : '+'}${money(m.monto)}</td></tr>`).join('')}</table></div></div></div>`;
  const mov = tipo => ask(tipo === 'ingreso' ? 'Ingreso de efectivo' : 'Retiro o gasto en efectivo', [
    { name: 'monto', label: 'Monto', type: 'number', inputmode: 'numeric' },
    { name: 'concepto', label: 'Concepto', ph: tipo === 'egreso' ? 'Ej: verdulería, retiro del dueño' : 'Ej: cambio' },
    ...(tipo === 'egreso' ? [{ name: 'gasto', label: '¿Registrar como gasto?', type: 'select', options: [['', 'No (retiro)']].concat(s.catGastos.map(g => [g, 'Sí · ' + g])) }] : [])
  ], v => {
    if (!+v.monto) return false;
    DB.put('moves', { cajaId: c.id, tipo, monto: +v.monto, concepto: v.concepto || '', t: Date.now(), por: ME.name });
    if (v.gasto) DB.put('gastos', { t: Date.now(), cat: v.gasto, monto: +v.monto, medio: 'Efectivo', desc: v.concepto || '', deCaja: true, por: ME.name });
  });
  $('#ing').onclick = () => mov('ingreso');
  $('#egr').onclick = () => mov('egreso');
  $('#cerrar').onclick = () => {
    if (abiertas.length) toast(`Ojo: hay ${abiertas.length} cuentas abiertas`, 1);
    ask('Cerrar caja', [
      { name: 'contado', label: s.arqueoCiego ? 'Efectivo contado' : `Efectivo contado (esperado ${money(r.efectivo)})`, type: 'number', inputmode: 'numeric' },
      { name: 'dejado', label: 'Efectivo que queda como cambio', type: 'number', inputmode: 'numeric', value: c.inicial || 0 },
      { name: 'nota', label: 'Nota', value: '' }
    ], v => {
      const contado = +v.contado || 0;
      const fin = { ...c, cerrada: Date.now(), cerro: ME.name, contado, dejado: +v.dejado || 0, nota: v.nota, dif: contado - r.efectivo, resumen: { total: r.total, por: r.por, ventas: r.cerradas, ing: r.ing, egr: r.egr, esperado: r.efectivo, propinas: r.propinas } };
      DB.put('cash', fin);
      queuePrint(cierreHTML(fin), 'cierre');
      toast(`Caja cerrada · diferencia ${money(fin.dif)}`, fin.dif < 0);
    }, 'Cerrar caja');
  };
};
function cierreHTML(c) {
  const r = c.resumen;
  return `<h1>CIERRE DE CAJA</h1><div class="c">${esc(settings().local)}<br>${fecha(c.abierta)} ${hhmm(c.abierta)} → ${hhmm(c.cerrada)}</div><hr>
    ${Object.entries(r.por).map(([m, x]) => `<div class="row"><span>${esc(m)}</span><span>${money(x)}</span></div>`).join('')}<hr>
    <div class="row big"><span>TOTAL</span><span>${money(r.total)}</span></div><div class="row"><span>Ventas</span><span>${r.ventas}</span></div><hr>
    <div class="row"><span>Inicial</span><span>${money(c.inicial)}</span></div><div class="row"><span>Ingresos</span><span>${money(r.ing)}</span></div><div class="row"><span>Egresos</span><span>-${money(r.egr)}</span></div>
    <div class="row"><span>Esperado</span><span>${money(r.esperado)}</span></div><div class="row"><span>Contado</span><span>${money(c.contado)}</span></div>
    <div class="row big"><span>Diferencia</span><span>${money(c.dif)}</span></div><hr><div>Abrió: ${esc(c.por)} · Cerró: ${esc(c.cerro)}</div>`;
}
function verCierre(c) {
  modal(`<h3>Cierre ${fecha(c.abierta)}</h3><div class="ticket-preview">${cierreHTML(c)}</div><div class="btns"><button class="btn ghost" data-close>Cerrar</button><button class="btn" id="rp">Imprimir</button></div>`, (m) => { $('#rp', m).onclick = () => queuePrint(cierreHTML(c), 'cierre'); });
}

/* ───────── ventas ───────── */
let ventasDia = null, ventasF = 'todas';
VIEWFN.ventas = el => {
  ventasDia = ventasDia || dayKey(Date.now());
  const all = between('orders', 'creado', ventasDia, ventasDia, () => route.v === 'ventas' && render());
  if (!all) { el.innerHTML = '<div class="page"><p class="muted">Cargando…</p></div>'; return; }
  let os = all.filter(o => o.estado !== 'abierta').sort((a, b) => b.creado - a.creado);
  const ok = os.filter(o => o.estado === 'cerrada');
  if (ventasF === 'anuladas') os = os.filter(o => o.estado === 'anulada'); else if (ventasF !== 'todas') os = os.filter(o => (o.tipo === 'mesa' ? 'Salón' : o.canal) === ventasF);
  const canales = [...new Set(all.map(o => o.tipo === 'mesa' ? 'Salón' : o.canal))];
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Ventas</h2></div><div class="quick"><input type="date" id="d" value="${ventasDia}"><button class="btn" id="csv">Exportar</button></div></div>
    <div class="kpis"><div class="kpi"><small>Total del día</small><b>${money(sum(ok, o => orderCalc(o).total))}</b></div><div class="kpi"><small>Ventas</small><b>${ok.length}</b></div><div class="kpi"><small>Ticket promedio</small><b>${money(ok.length ? sum(ok, o => orderCalc(o).total) / ok.length : 0)}</b></div><div class="kpi"><small>Anuladas</small><b>${all.filter(o => o.estado === 'anulada').length}</b></div></div>
    ${tabs([['todas', 'Todas']].concat(canales.map(c => [c, c])).concat([['anuladas', 'Anuladas']]), ventasF, 'f')}
    <div class="tbl-wrap"><table class="tbl click"><tr><th>#</th><th>Hora</th><th>Origen</th><th>Detalle</th><th>Pago</th><th class="r">Total</th></tr>
    ${os.map(o => `<tr data-o="${o.id}" class="${o.estado === 'anulada' ? 'anul' : ''}"><td>${o.num}</td><td>${hhmm(o.creado)}</td><td>${esc(o.tipo === 'mesa' ? 'Mesa ' + o.mesa : o.canal)}</td><td>${esc(o.items.map(i => i.q + ' ' + i.n).join(', ').slice(0, 80))}${o.estado === 'anulada' ? ' — <b>ANULADA</b>: ' + esc(o.motivo || '') : ''}</td><td>${esc((o.pagos || []).map(p => p.medio).join(' + '))}</td><td class="r">${money(orderCalc(o).total)}</td></tr>`).join('') || `<tr><td colspan="6">${empty('Sin ventas')}</td></tr>`}</table></div></div>`;
  $('#d').onchange = e => { ventasDia = e.target.value; render(); };
  $$('[data-f]', el).forEach(b => b.onclick = () => { ventasF = b.dataset.f; render(); });
  $$('[data-o]', el).forEach(r => r.onclick = () => go('orden', r.dataset.o));
  $('#csv').onclick = () => csv([['N°', 'Fecha', 'Hora', 'Origen', 'Estado', 'Cliente', 'Productos', 'Medios', 'Descuento', 'Total']].concat(os.map(o => { const c = orderCalc(o); return [o.num, fecha(o.creado), hhmm(o.creado), o.tipo === 'mesa' ? 'Mesa ' + o.mesa : o.canal, o.estado, o.cliente?.nombre || '', o.items.map(i => i.q + ' ' + i.n).join(' | '), (o.pagos || []).map(p => p.medio + ' ' + p.monto).join(' | '), c.desc, c.total]; })), 'ventas-' + ventasDia);
};

/* ───────── reportes ───────── */
let repD1 = null, repD2 = null, repTab = 'ventas';
VIEWFN.reportes = el => {
  const hoy = dayKey(Date.now());
  repD2 = repD2 || hoy; repD1 = repD1 || dayKey(Date.now() - 6 * 86400000);
  const all = between('orders', 'creado', repD1, repD2, () => route.v === 'reportes' && render());
  const gs = between('gastos', 't', repD1, repD2, () => route.v === 'reportes' && render());
  const cs = between('compras', 't', repD1, repD2, () => route.v === 'reportes' && render());
  if (!all || !gs || !cs) { el.innerHTML = '<div class="page"><p class="muted">Cargando…</p></div>'; return; }
  const os = all.filter(o => o.estado === 'cerrada');
  const anul = all.filter(o => o.estado === 'anulada' && o.items.length);
  const tot = sum(os, o => orderCalc(o).total);
  const group = key => { const m = {}; os.forEach(o => { const k = key(o); m[k] = (m[k] || 0) + orderCalc(o).total; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const medios = {}; os.forEach(o => (o.pagos || []).forEach(p => medios[p.medio] = (medios[p.medio] || 0) + p.monto));
  const prods = {}, catsT = {};
  const cats = Object.fromEntries(DB.list('cats').map(c => [c.id, c.name]));
  os.forEach(o => o.items.forEach(i => {
    const p = DB.get('prods', i.pid);
    const k = i.n; prods[k] = prods[k] || { q: 0, t: 0, costo: 0 };
    prods[k].q += i.q; prods[k].t += itemTotal(i); prods[k].costo += p ? prodCost(p) * i.q : 0;
    const cn = cats[p?.cat] || 'Otros'; catsT[cn] = (catsT[cn] || 0) + itemTotal(i);
  }));
  const cmv = sum(Object.values(prods), p => p.costo);
  const totGastos = sum(gs, g => g.monto), totCompras = sum(cs, c => c.total);
  const days = []; for (let t = dayStart(repD1); t <= dayStart(repD2); t += 86400000) days.push(dayKey(t));
  const perDay = days.map(d => [d, sum(os.filter(o => dayKey(o.creado) === d), o => orderCalc(o).total)]);
  const mxD = Math.max(1, ...perDay.map(d => d[1]));
  const horas = Array(24).fill(0); os.forEach(o => horas[new Date(o.creado).getHours()] += orderCalc(o).total); const mxH = Math.max(1, ...horas);
  const dows = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], dow = Array(7).fill(0); os.forEach(o => dow[new Date(o.creado).getDay()] += orderCalc(o).total);
  const desc = sum(os, o => orderCalc(o).desc);
  const pax = sum(os.filter(o => o.tipo === 'mesa'), o => o.pax || 0);
  const rng = [['hoy', 'Hoy', 0, 0], ['7', '7 días', 6, 0], ['30', '30 días', 29, 0], ['mes', 'Este mes']];
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Reportes</h2></div><div class="quick">${rng.map(r => `<button class="chip" data-rng="${r[0]}">${r[1]}</button>`).join('')}<input type="date" id="d1" value="${repD1}"><input type="date" id="d2" value="${repD2}"></div></div>
    <div class="kpis"><div class="kpi"><small>Vendido</small><b>${money(tot)}</b></div><div class="kpi"><small>Ventas</small><b>${os.length}</b></div><div class="kpi"><small>Ticket promedio</small><b>${money(os.length ? tot / os.length : 0)}</b></div>
    <div class="kpi"><small>Por persona (salón)</small><b>${money(pax ? sum(os.filter(o => o.tipo === 'mesa'), o => orderCalc(o).total) / pax : 0)}</b></div><div class="kpi"><small>Descuentos</small><b>${money(desc)}</b></div><div class="kpi"><small>Anulaciones</small><b>${anul.length}</b><span class="muted">${money(sum(anul, o => orderCalc(o).sub))}</span></div></div>
    ${tabs([['ventas', 'Ventas'], ['productos', 'Productos'], ['resultado', 'Resultado'], ['equipo', 'Equipo']], repTab)}
    <div id="rep"></div></div>`;
  const R = $('#rep', el);
  if (repTab === 'ventas') R.innerHTML = `<div class="card"><h3>Ventas por día</h3><div class="vbars">${perDay.map(([d, v]) => `<div title="${d} ${money(v)}"><i style="height:${v / mxD * 100}%"></i><small>${d.slice(8)}/${d.slice(5, 7)}</small></div>`).join('')}</div></div>
    <div class="two"><div class="card"><h3>Origen</h3>${bars(group(o => o.tipo === 'mesa' ? 'Salón' : o.canal), tot)}</div><div class="card"><h3>Medios de pago</h3>${bars(Object.entries(medios).sort((a, b) => b[1] - a[1]), tot)}</div></div>
    <div class="two"><div class="card"><h3>Por hora</h3><div class="vbars sm">${horas.map((v, h) => `<div title="${h}h ${money(v)}"><i style="height:${v / mxH * 100}%"></i><small>${h}</small></div>`).slice(8).join('')}</div></div>
    <div class="card"><h3>Por día de la semana</h3>${bars([1, 2, 3, 4, 5, 6, 0].map(i => [dows[i], dow[i]]), tot)}</div></div>`;
  if (repTab === 'productos') R.innerHTML = `<div class="two"><div class="card"><h3>Por categoría</h3>${bars(Object.entries(catsT).sort((a, b) => b[1] - a[1]), tot)}</div><div class="card"><h3>Margen estimado</h3><p class="big">${money(tot - cmv)} <span class="muted">(${tot ? Math.round((tot - cmv) / tot * 100) : 0}% sobre ventas)</span></p><p class="muted">Costo de mercadería por recetas: ${money(cmv)}. Cargá recetas en Carta → producto para afinarlo.</p></div></div>
    <div class="tbl-wrap"><table class="tbl"><tr><th>Producto</th><th class="r">Cant.</th><th class="r">Vendido</th><th class="r">Costo</th><th class="r">Margen</th></tr>${Object.entries(prods).sort((a, b) => b[1].t - a[1].t).map(([n, v]) => `<tr><td>${esc(n)}</td><td class="r">${v.q}</td><td class="r">${money(v.t)}</td><td class="r muted">${v.costo ? money(v.costo) : '—'}</td><td class="r">${v.costo ? Math.round((v.t - v.costo) / v.t * 100) + '%' : '—'}</td></tr>`).join('')}</table></div>
    <button class="btn" id="csvp">Exportar productos</button>`;
  if (repTab === 'resultado') {
    const gcat = {}; gs.forEach(g => gcat[g.cat] = (gcat[g.cat] || 0) + g.monto);
    const res = tot - totCompras - totGastos;
    R.innerHTML = `<div class="card result"><h3>Estado de resultados (simplificado)</h3>
      <div class="row big"><span>Ventas</span><span>${money(tot)}</span></div>
      <div class="row"><span>− Compras de mercadería</span><span>${money(totCompras)}</span></div>
      ${Object.entries(gcat).map(([k, v]) => `<div class="row"><span>− ${esc(k)}</span><span>${money(v)}</span></div>`).join('')}
      <div class="row big ${res < 0 ? 'bad' : 'ok'}"><span>Resultado</span><span>${money(res)}</span></div>
      <p class="muted">Basado en ventas cobradas, compras y gastos cargados en el período. Margen bruto por recetas: ${money(tot - cmv)}.</p></div>`;
  }
  if (repTab === 'equipo') {
    const mozos = {}; os.forEach(o => { const k = o.mozo || o.por || '—'; mozos[k] = mozos[k] || { v: 0, n: 0, prop: 0 }; mozos[k].v += orderCalc(o).total; mozos[k].n++; mozos[k].prop += o.propina || 0; });
    const rep = {}; os.filter(o => o.repartidor).forEach(o => { rep[o.repartidor] = rep[o.repartidor] || { n: 0, env: 0 }; rep[o.repartidor].n++; rep[o.repartidor].env += o.envio || 0; });
    R.innerHTML = `<div class="two"><div class="card"><h3>Por mozo / usuario</h3><table class="tbl plain"><tr><th>Nombre</th><th class="r">Ventas</th><th class="r">Total</th><th class="r">Propinas</th></tr>${Object.entries(mozos).sort((a, b) => b[1].v - a[1].v).map(([n, v]) => `<tr><td>${esc(n)}</td><td class="r">${v.n}</td><td class="r">${money(v.v)}</td><td class="r">${money(v.prop)}</td></tr>`).join('')}</table></div>
      <div class="card"><h3>Repartidores</h3>${Object.keys(rep).length ? `<table class="tbl plain"><tr><th>Nombre</th><th class="r">Viajes</th><th class="r">Envíos</th></tr>${Object.entries(rep).map(([n, v]) => `<tr><td>${esc(n)}</td><td class="r">${v.n}</td><td class="r">${money(v.env)}</td></tr>`).join('')}</table>` : '<p class="muted">Sin envíos con repartidor asignado.</p>'}</div></div>
      <div class="card"><h3>Anulaciones y bajas</h3>${anul.length || os.some(o => o.bajas) ? `<table class="tbl plain">${anul.map(o => `<tr><td>${fecha(o.creado)} ${hhmm(o.creado)}</td><td>${esc(orderLabel(o))}</td><td>${esc(o.motivo || '')}</td><td>${esc(o.anuladaPor || '')}</td><td class="r">${money(orderCalc(o).sub)}</td></tr>`).join('')}${all.flatMap(o => (o.bajas || []).map(b => `<tr><td>${fecha(b.t)} ${hhmm(b.t)}</td><td>${esc(orderLabel(o))}: ${b.q} ${esc(b.n)}</td><td>${esc(b.motivo)}</td><td>${esc(b.por)}</td><td></td></tr>`)).join('')}</table>` : '<p class="muted">Sin anulaciones. 👌</p>'}</div>`;
  }
  $$('[data-tab]', el).forEach(b => b.onclick = () => { repTab = b.dataset.tab; render(); });
  $$('[data-rng]', el).forEach(b => b.onclick = () => {
    const k = b.dataset.rng; repD2 = hoy;
    if (k === 'hoy') repD1 = hoy; else if (k === 'mes') repD1 = hoy.slice(0, 8) + '01'; else repD1 = dayKey(Date.now() - (+k - 1) * 86400000);
    render();
  });
  $('#d1').onchange = e => { repD1 = e.target.value; render(); };
  $('#d2').onchange = e => { repD2 = e.target.value; render(); };
  $('#csvp') && ($('#csvp').onclick = () => csv([['Producto', 'Cantidad', 'Vendido', 'Costo']].concat(Object.entries(prods).map(([n, v]) => [n, v.q, Math.round(v.t), Math.round(v.costo)])), 'productos-' + repD1 + '_' + repD2));
};
