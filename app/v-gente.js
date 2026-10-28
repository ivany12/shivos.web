/* Morfi · clientes, reservas, personal, ajustes */
'use strict';

/* ───────── clientes y cuentas corrientes ───────── */
let cliQ = '';
VIEWFN.clientes = el => {
  const cl = DB.list('clientes');
  const mv = DB.list('ctamov');
  const saldo = {}; mv.forEach(m => saldo[m.cli] = (saldo[m.cli] || 0) + m.monto);
  const recent = DB.list('orders').filter(o => o.cliente?.id);
  const stats = {}; recent.forEach(o => { const s = stats[o.cliente.id] = stats[o.cliente.id] || { n: 0, t: 0, last: 0 }; if (o.estado === 'cerrada') { s.n++; s.t += orderCalc(o).total; s.last = Math.max(s.last, o.creado); } });
  const deben = cl.filter(c => (saldo[c.id] || 0) > 0);
  const t = cliQ.toLowerCase();
  const list = cl.filter(c => !t || [c.nombre, c.tel, c.dir].join(' ').toLowerCase().includes(t)).sort((a, b) => (saldo[b.id] || 0) - (saldo[a.id] || 0) || (a.nombre || '').localeCompare(b.nombre || '')).slice(0, 200);
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Clientes</h2><p class="muted">${cl.length} clientes · ${deben.length} con saldo deudor ${deben.length ? '(' + money(sum(deben, c => saldo[c.id])) + ')' : ''}</p></div>
    <div class="quick"><button class="btn pri" id="nuevo">+ Cliente</button><button class="btn" id="csv">Exportar</button></div></div>
    <input class="search" id="q" placeholder="Buscar por nombre, teléfono o dirección…" value="${esc(cliQ)}">
    <div class="tbl-wrap"><table class="tbl click"><tr><th>Cliente</th><th class="hide-m">Teléfono</th><th class="hide-m">Dirección</th><th class="r">Compras</th><th class="r">Saldo</th></tr>
    ${list.map(c => `<tr data-c="${c.id}"><td><b>${esc(c.nombre || '—')}</b>${c.nota ? `<br><small class="muted">${esc(c.nota)}</small>` : ''}</td><td class="hide-m">${esc(c.tel || '')}</td><td class="muted hide-m">${esc(c.dir || '')}</td><td class="r">${stats[c.id]?.n || ''}</td><td class="r ${(saldo[c.id] || 0) > 0 ? 'bad' : ''}">${saldo[c.id] ? money(saldo[c.id]) : ''}</td></tr>`).join('') || `<tr><td colspan="5">${empty('Sin clientes', 'Se cargan solos al tomar pedidos de delivery o teléfono.')}</td></tr>`}</table></div></div>`;
  const q = $('#q'); q.oninput = () => { cliQ = q.value; clearTimeout(q._t); q._t = setTimeout(() => { render(); const n = $('#q'); n && (n.focus(), n.setSelectionRange(n.value.length, n.value.length)); }, 250); };
  $('#nuevo').onclick = () => editCliente({});
  $$('[data-c]', el).forEach(r => r.onclick = () => verCliente(DB.get('clientes', r.dataset.c)));
  $('#csv').onclick = () => csv([['Nombre', 'Teléfono', 'Dirección', 'Saldo', 'Notas']].concat(cl.map(c => [c.nombre, c.tel, c.dir, saldo[c.id] || 0, c.nota || ''])), 'clientes');
};
function editCliente(c) {
  ask(c.id ? 'Editar cliente' : 'Nuevo cliente', [{ name: 'nombre', label: 'Nombre', value: c.nombre || '' }, { name: 'tel', label: 'Teléfono', type: 'tel', value: c.tel || '' }, { name: 'dir', label: 'Dirección', value: c.dir || '' }, { name: 'email', label: 'Email', type: 'email', value: c.email || '' }, { name: 'cuit', label: 'CUIT/DNI (para facturar)', value: c.cuit || '' }, { name: 'nota', label: 'Notas (alergias, preferencias…)', value: c.nota || '' }],
    v => { if (!v.nombre.trim() && !v.tel.trim()) return false; DB.put('clientes', { ...c, ...v, alta: c.alta || Date.now() }); });
}
function verCliente(c) {
  const mv = DB.list('ctamov').filter(m => m.cli === c.id).sort((a, b) => b.t - a.t);
  const saldo = sum(mv, m => m.monto);
  const os = DB.list('orders').filter(o => o.cliente?.id === c.id && o.estado === 'cerrada').sort((a, b) => b.creado - a.creado);
  modal(`<h3>${esc(c.nombre)}</h3><p class="muted">${esc(c.tel || '')} ${c.dir ? '· ' + esc(c.dir) : ''} ${c.email ? '· ' + esc(c.email) : ''}</p>${c.nota ? `<p class="nota">${esc(c.nota)}</p>` : ''}
    <div class="kpis"><div class="kpi"><small>Saldo cuenta corriente</small><b class="${saldo > 0 ? 'bad' : ''}">${money(saldo)}</b></div><div class="kpi"><small>Compras recientes</small><b>${os.length}</b><span class="muted">${money(sum(os, o => orderCalc(o).total))}</span></div></div>
    ${mv.length ? `<h4>Cuenta corriente</h4><table class="tbl plain">${mv.slice(0, 15).map(m => `<tr><td>${fecha(m.t)}</td><td>${esc(m.ref || m.nota || '')}</td><td class="r ${m.monto > 0 ? 'bad' : 'ok'}">${m.monto > 0 ? '+' : ''}${money(m.monto)}</td></tr>`).join('')}</table>` : ''}
    ${os.length ? `<h4>Últimos pedidos</h4><table class="tbl plain">${os.slice(0, 8).map(o => `<tr><td>${fecha(o.creado)}</td><td>${esc(o.items.map(i => i.q + ' ' + i.n).join(', ').slice(0, 60))}</td><td class="r">${money(orderCalc(o).total)}</td></tr>`).join('')}</table>` : ''}
    <div class="btns"><button class="btn ghost" id="ed">Editar</button>${saldo > 0 && can('cobrar') ? '<button class="btn ok" id="pg">Registrar pago</button>' : ''}<button class="btn ghost" id="cargo">Cargo manual</button>${c.tel ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${c.tel.replace(/\D/g, '').replace(/^(?!54)/, '549')}">WhatsApp</a>` : ''}<button class="btn ghost" data-close>Cerrar</button></div>`, (m, close) => {
    $('#ed', m).onclick = () => { close(); editCliente(c); };
    $('#pg', m) && ($('#pg', m).onclick = () => { close(); ask('Pago de ' + c.nombre, [{ name: 'monto', label: 'Monto', type: 'number', value: saldo }, { name: 'medio', label: 'Medio', type: 'select', options: settings().medios.filter(x => x !== 'Cuenta corriente') }], v => {
      if (!+v.monto) return false;
      DB.put('ctamov', { cli: c.id, t: Date.now(), monto: -(+v.monto), ref: 'Pago ' + v.medio, por: ME.name });
      const caja = openCash();
      if (caja && /efectivo/i.test(v.medio)) DB.put('moves', { cajaId: caja.id, tipo: 'ingreso', monto: +v.monto, concepto: 'Cobro cta cte ' + c.nombre, t: Date.now(), por: ME.name });
      toast('Pago registrado');
    }); });
    $('#cargo', m).onclick = () => { close(); ask('Cargo / ajuste a ' + c.nombre, [{ name: 'monto', label: 'Monto (+ suma deuda, − descuenta)', type: 'number' }, { name: 'nota', label: 'Concepto' }], v => { if (!+v.monto) return false; DB.put('ctamov', { cli: c.id, t: Date.now(), monto: +v.monto, nota: v.nota, por: ME.name }); }); };
  }, true);
}

/* ───────── reservas ───────── */
let resDia = null;
VIEWFN.reservas = el => {
  resDia = resDia || dayKey(Date.now());
  const rs = DB.list('reservas').filter(r => r.fecha === resDia).sort((a, b) => a.hora.localeCompare(b.hora));
  const prox = DB.list('reservas').filter(r => r.fecha > resDia && ['pendiente', 'confirmada'].includes(r.estado)).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).slice(0, 8);
  const EST = { pendiente: 'Pendiente', confirmada: 'Confirmada', sentada: 'Sentada', cancelada: 'Cancelada', novino: 'No vino' };
  const pax = sum(rs.filter(r => r.estado !== 'cancelada'), r => +r.pax || 0);
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Reservas</h2><p class="muted">${rs.length} reservas · ${pax} personas</p></div>
    <div class="quick"><button class="btn ghost" id="prev">←</button><input type="date" id="d" value="${resDia}"><button class="btn ghost" id="next">→</button><button class="btn pri" id="nueva">+ Reserva</button></div></div>
    <div class="res-list">${rs.map(r => `<div class="card res ${r.estado}" data-r="${r.id}"><div class="rh"><b>${esc(r.hora)}</b><span class="pill">${EST[r.estado]}</span></div><b>${esc(r.nombre)}</b><span>${r.pax} personas${r.mesa ? ' · mesa ' + esc(r.mesa) : ''}</span><small class="muted">${esc(r.tel || '')} ${esc(r.nota || '')}</small>
      <div class="act">${r.estado === 'pendiente' ? `<button class="btn sm" data-st="confirmada" data-id="${r.id}">Confirmar</button>` : ''}${['pendiente', 'confirmada'].includes(r.estado) ? `<button class="btn sm pri" data-sit="${r.id}">Sentar</button><button class="btn sm ghost" data-st="novino" data-id="${r.id}">No vino</button>` : ''}${r.tel ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="https://wa.me/${r.tel.replace(/\D/g, '').replace(/^(?!54)/, '549')}?text=${encodeURIComponent(`Hola ${r.nombre}! Te confirmamos tu reserva en ${settings().local} para el ${r.fecha.split('-').reverse().join('/')} a las ${r.hora}, ${r.pax} personas. ¡Te esperamos!`)}">WhatsApp</a>` : ''}</div></div>`).join('') || empty('Sin reservas para este día')}</div>
    ${prox.length ? `<h3>Próximas</h3><div class="tbl-wrap"><table class="tbl click">${prox.map(r => `<tr data-go="${r.fecha}"><td>${r.fecha.split('-').reverse().join('/')}</td><td>${esc(r.hora)}</td><td>${esc(r.nombre)}</td><td>${r.pax} p</td></tr>`).join('')}</table></div>` : ''}</div>`;
  const shift = d => { resDia = dayKey(dayStart(resDia) + d * 86400000 + 3600000); render(); };
  $('#prev').onclick = () => shift(-1); $('#next').onclick = () => shift(1);
  $('#d').onchange = e => { resDia = e.target.value; render(); };
  $('#nueva').onclick = () => editReserva({ fecha: resDia, hora: '21:00', pax: 2, estado: 'confirmada' });
  $$('.res[data-r]', el).forEach(c => c.onclick = e => { if (!e.target.closest('button,a')) editReserva(DB.get('reservas', c.dataset.r)); });
  $$('[data-st]', el).forEach(b => b.onclick = () => DB.put('reservas', { ...DB.get('reservas', b.dataset.id), estado: b.dataset.st }));
  $$('[data-sit]', el).forEach(b => b.onclick = () => {
    const r = DB.get('reservas', b.dataset.sit);
    ask('Sentar a ' + r.nombre, [{ name: 'mesa', label: 'Mesa', value: r.mesa || '' }], v => {
      const m = v.mesa.trim().toUpperCase(); if (!m) return false;
      if (DB.list('orders').some(o => o.estado === 'abierta' && o.tipo === 'mesa' && o.mesa === m)) { toast('Esa mesa está ocupada', 1); return false; }
      const o = newOrder({ tipo: 'mesa', canal: 'Salón', mesa: m, pax: +r.pax || 0, mozo: ME.name, cliente: { nombre: r.nombre, tel: r.tel || '' }, reserva: r.id });
      DB.put('reservas', { ...r, estado: 'sentada', mesa: m });
      go('orden', o.id);
    }, 'Sentar');
  });
  $$('[data-go]', el).forEach(r => r.onclick = () => { resDia = r.dataset.go; render(); });
};
function editReserva(r) {
  ask(r.id ? 'Editar reserva' : 'Nueva reserva', [
    { name: 'nombre', label: 'Nombre', value: r.nombre || '' }, { name: 'tel', label: 'Teléfono', type: 'tel', value: r.tel || '' },
    { name: 'fecha', label: 'Fecha', type: 'date', value: r.fecha, half: 1 }, { name: 'hora', label: 'Hora', type: 'time', value: r.hora, half: 1 },
    { name: 'pax', label: 'Personas', type: 'number', inputmode: 'numeric', value: r.pax, half: 1 }, { name: 'mesa', label: 'Mesa (opcional)', value: r.mesa || '', half: 1 },
    { name: 'nota', label: 'Notas (cumpleaños, alergias…)', value: r.nota || '' },
    { name: 'estado', label: 'Estado', type: 'select', options: [['pendiente', 'Pendiente'], ['confirmada', 'Confirmada'], ['sentada', 'Sentada'], ['cancelada', 'Cancelada'], ['novino', 'No vino']], value: r.estado }
  ], v => { if (!v.nombre.trim()) return false; DB.put('reservas', { ...r, ...v, mesa: v.mesa.trim().toUpperCase(), por: r.por || ME.name }); resDia = v.fecha; });
}

/* ───────── personal: usuarios y fichajes ───────── */
let perTab = 'equipo', perD1 = null, perD2 = null;
VIEWFN.personal = el => {
  const us = DB.list('users').sort((a, b) => a.name.localeCompare(b.name));
  const hoy = dayKey(Date.now());
  perD2 = perD2 || hoy; perD1 = perD1 || hoy.slice(0, 8) + '01';
  const fs = DB.list('fichajes').filter(f => dayKey(f.in) >= perD1 && dayKey(f.in) <= perD2).sort((a, b) => b.in - a.in);
  const enTurno = DB.list('fichajes').filter(f => !f.out);
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Personal</h2><p class="muted">${us.filter(u => u.active !== false).length} activos · ${enTurno.length} en turno ahora</p></div><div class="quick">${perTab === 'equipo' && can('anular') && ME.role === 'dueno' ? '<button class="btn pri" id="nuevo">+ Usuario</button>' : ''}</div></div>
    ${tabs([['equipo', 'Equipo'], ['horas', 'Horas trabajadas']], perTab)}<div id="pc"></div></div>`;
  const C = $('#pc', el);
  if (perTab === 'equipo') {
    C.innerHTML = `<div class="grid-cards">${us.map(u => { const on = enTurno.find(f => f.user === u.id); return `<div class="card click ${u.active === false ? 'anul' : ''}" data-u="${u.id}"><div class="row"><span class="av lg">${esc(u.name[0])}</span><div style="flex:1"><b>${esc(u.name)}</b><br><span class="muted">${ROLES[u.role]?.name}</span></div>${on ? `<span class="pill ok">en turno desde ${hhmm(on.in)}</span>` : ''}</div>${u.tel ? `<small class="muted">${esc(u.tel)}</small>` : ''}</div>`; }).join('')}</div>
      <p class="muted">Cada persona entra con su PIN. En la pantalla de ingreso también se ficha entrada y salida. Mozo: toma pedidos · Cajero: además cobra y maneja caja · Encargado: además anula, carta, stock y reportes · Cocina: pantalla de cocina y stock.</p>`;
    $$('[data-u]', C).forEach(r => r.onclick = () => ME.role === 'dueno' ? editUser(DB.get('users', r.dataset.u)) : null);
  } else {
    const per = {}; fs.forEach(f => { const h = ((f.out || Date.now()) - f.in) / 3600000; const p = per[f.user] = per[f.user] || { h: 0, n: 0 }; p.h += h; p.n++; });
    C.innerHTML = `<div class="quick"><input type="date" id="d1" value="${perD1}"><input type="date" id="d2" value="${perD2}"><button class="btn" id="csv">Exportar</button></div>
      <div class="tbl-wrap"><table class="tbl"><tr><th>Persona</th><th class="r">Turnos</th><th class="r">Horas</th><th class="r">A pagar</th></tr>${Object.entries(per).map(([id, p]) => { const u = DB.get('users', id); return `<tr><td>${esc(u?.name || '?')}</td><td class="r">${p.n}</td><td class="r">${num(p.h)}</td><td class="r">${u?.valorHora ? money(p.h * u.valorHora) : '—'}</td></tr>`; }).join('') || `<tr><td colspan="4">${empty('Sin fichajes en el período')}</td></tr>`}</table></div>
      <h3>Detalle</h3><div class="tbl-wrap"><table class="tbl">${fs.slice(0, 200).map(f => `<tr><td>${esc(DB.get('users', f.user)?.name || f.name)}</td><td>${fecha(f.in)}</td><td>${hhmm(f.in)} → ${f.out ? hhmm(f.out) : '<span class="pill ok">en turno</span>'}</td><td class="r">${num(((f.out || Date.now()) - f.in) / 3600000)} h</td>${ME.role === 'dueno' ? `<td class="r"><button class="btn sm ghost" data-f="${f.id}">Editar</button></td>` : ''}</tr>`).join('')}</table></div>`;
    $('#d1').onchange = e => { perD1 = e.target.value; render(); };
    $('#d2').onchange = e => { perD2 = e.target.value; render(); };
    $('#csv').onclick = () => csv([['Persona', 'Fecha', 'Entrada', 'Salida', 'Horas']].concat(fs.map(f => [DB.get('users', f.user)?.name || f.name, fecha(f.in), hhmm(f.in), f.out ? hhmm(f.out) : '', num(((f.out || Date.now()) - f.in) / 3600000)])), 'horas-' + perD1 + '_' + perD2);
    $$('[data-f]', C).forEach(b => b.onclick = () => { const f = DB.get('fichajes', b.dataset.f); const t2s = t => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      ask('Editar fichaje', [{ name: 'in', label: 'Entrada', type: 'datetime-local', value: t2s(f.in) }, { name: 'out', label: 'Salida', type: 'datetime-local', value: f.out ? t2s(f.out) : '' }], v => { DB.put('fichajes', { ...f, in: new Date(v.in).getTime(), out: v.out ? new Date(v.out).getTime() : null, editado: ME.name }); }, 'Guardar', '<button type="button" class="btn ghost danger-t" onclick="this.closest(\'.modal-bg\').remove();DB.del(\'fichajes\',\'' + f.id + '\')">Borrar fichaje</button>'); });
  }
  $$('[data-tab]', el).forEach(b => b.onclick = () => { perTab = b.dataset.tab; render(); });
  $('#nuevo') && ($('#nuevo').onclick = () => editUser({}));
};
function editUser(u) {
  ask(u.id ? 'Editar ' + u.name : 'Nuevo usuario', [
    { name: 'name', label: 'Nombre', value: u.name || '' },
    { name: 'role', label: 'Rol', type: 'select', options: Object.entries(ROLES).map(([k, r]) => [k, r.name]), value: u.role || 'mozo' },
    { name: 'pin', label: 'PIN (4 a 6 números)', type: 'text', secret: 1, inputmode: 'numeric', value: u.pin || '' },
    { name: 'tel', label: 'Teléfono', type: 'tel', value: u.tel || '', half: 1 },
    { name: 'valorHora', label: 'Valor hora $ (opcional)', type: 'number', value: u.valorHora || '', half: 1 },
    { name: 'active', label: 'Estado', type: 'select', options: [['1', 'Activo'], ['', 'Inactivo']], value: u.active === false ? '' : '1' }
  ], v => {
    if (!v.name.trim() || !/^\d{4,6}$/.test(v.pin)) { toast('Poné nombre y un PIN de 4 a 6 números', 1); return false; }
    if (DB.list('users').some(x => x.pin === v.pin && x.id !== u.id)) { toast('Ese PIN ya lo usa otra persona', 1); return false; }
    if (u.id === ME.id && v.role !== 'dueno') { toast('No te podés sacar el rol de dueño', 1); return false; }
    const n = DB.put('users', { ...u, name: v.name.trim(), role: v.role, pin: v.pin, tel: v.tel, valorHora: +v.valorHora || 0, active: !!v.active });
    if (n.id === ME.id) ME = n;
  });
}

/* ───────── ajustes ───────── */
let ajTab = 'local';
VIEWFN.ajustes = el => {
  const s = settings();
  el.innerHTML = `<div class="page narrow"><h2>Ajustes</h2>${tabs([['local', 'Local'], ['venta', 'Venta'], ['tienda', 'Tienda online'], ['equipo', 'Este dispositivo'], ['cuenta', 'Cuenta y datos']], ajTab)}<div id="aj"></div></div>`;
  const C = $('#aj', el);
  const lines = (f, k) => f.get(k).split('\n').map(x => x.trim()).filter(Boolean);
  const saveForm = (form, fn) => { form.onsubmit = e => { e.preventDefault(); DB.put('settings', { ...settings(), id: 'main', ...fn(new FormData(form)) }); toast('Guardado'); }; };
  if (ajTab === 'local') {
    C.innerHTML = `<form class="form" id="f">
      <label>Nombre del local<input name="local" value="${esc(s.local)}"></label>
      <div class="grid2"><label>Dirección<input name="dir" value="${esc(s.dir)}"></label><label>Teléfono / WhatsApp<input name="tel" value="${esc(s.tel)}"></label></div>
      <label>Color de la marca<div class="colors">${['#e4572e', '#f1bb00', '#2a9d8f', '#3a86ff', '#8338ec', '#ef476f', '#118ab2', '#111111'].map(c => `<button type="button" class="sw ${c === s.color ? 'on' : ''}" data-col="${c}" style="background:${c}"></button>`).join('')}<input name="color" type="color" value="${esc(s.color)}"></div></label>
      <label>Pie del ticket<input name="pie" value="${esc(s.pie)}"></label>
      <div class="grid2"><label>Razón social<input name="rs" value="${esc(s.fiscal?.rs || '')}"></label><label>CUIT<input name="cuit" value="${esc(s.fiscal?.cuit || '')}"></label></div>
      <label>Condición frente al IVA<select name="iva">${['', 'Monotributista', 'Responsable inscripto', 'Exento'].map(x => `<option ${x === (s.fiscal?.iva || '') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <p class="muted">Factura electrónica (ARCA): próximamente. Con estos datos y tu certificado digital vamos a poder emitir facturas A/B/C desde el cobro.</p>
      <p class="muted">Las zonas y las mesas se arman en <a href="#salon">Salón → Editar plano</a>.</p>
      <label>Estaciones de preparación (una por línea; cada una tiene su comanda y pantalla)<textarea name="estaciones" rows="3">${s.estaciones.join('\n')}</textarea></label>
      <div class="btns"><button class="btn pri">Guardar</button></div></form>`;
    $$('[data-col]', C).forEach(b => b.onclick = () => { $('[name=color]', C).value = b.dataset.col; $$('.sw', C).forEach(x => x.classList.toggle('on', x === b)); document.documentElement.style.setProperty('--acc', b.dataset.col); });
    saveForm($('#f'), f => ({ local: f.get('local'), dir: f.get('dir'), tel: f.get('tel'), pie: f.get('pie'), color: f.get('color'), fiscal: { rs: f.get('rs'), cuit: f.get('cuit'), iva: f.get('iva') }, estaciones: lines(f, 'estaciones').length ? lines(f, 'estaciones') : ['Cocina']}));
  }
  if (ajTab === 'venta') {
    C.innerHTML = `<form class="form" id="f">
      <label>Medios de pago (uno por línea)<textarea name="medios" rows="6">${s.medios.join('\n')}</textarea></label>
      <label>Canales de pedidos (uno por línea)<textarea name="canales" rows="4">${s.canales.join('\n')}</textarea></label>
      <label>Zonas de envío (una por línea: Zona, precio)<textarea name="envios" rows="3">${s.envios.map(e => e.zona + ', ' + e.precio).join('\n')}</textarea></label>
      <label>Repartidores (uno por línea)<textarea name="repartidores" rows="3">${s.repartidores.join('\n')}</textarea></label>
      <label>Categorías de gastos (una por línea)<textarea name="catGastos" rows="4">${s.catGastos.join('\n')}</textarea></label>
      <label>Propinas sugeridas en la precuenta (% separados por coma)<input name="propinas" value="${s.propinas.join(', ')}"></label>
      <label>Promociones automáticas (una por línea: Nombre; días; horario; categoría o todas; %)<textarea name="promos" rows="3" placeholder="Happy hour; lun,mar,mie,jue; 18:00-20:00; Cervezas y tragos; 30">${(s.promos || []).map(p => [p.nombre, (p.dias || []).join(','), p.desde ? p.desde + '-' + p.hasta : '', p.cat || 'todas', p.pct].join('; ')).join('\n')}</textarea></label>
      <label class="ck"><input type="checkbox" name="arqueoCiego" ${s.arqueoCiego ? 'checked' : ''}> Arqueo ciego (el cajero no ve el efectivo esperado)</label>
      <div class="btns"><button class="btn pri">Guardar</button></div></form>`;
    saveForm($('#f'), f => ({ medios: lines(f, 'medios'), canales: lines(f, 'canales'), repartidores: lines(f, 'repartidores'), catGastos: lines(f, 'catGastos'), arqueoCiego: !!f.get('arqueoCiego'),
      propinas: f.get('propinas').split(',').map(x => +x.trim()).filter(Boolean),
      promos: lines(f, 'promos').map(l => { const [nombre, dias, hor, cat, pct] = l.split(';').map(x => (x || '').trim()); const [desde, hasta] = (hor || '').split('-').map(x => x.trim()); return { nombre: nombre || 'Promo', dias: (dias || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(',').map(x => x.trim().slice(0, 3)).filter(Boolean), desde: desde || '', hasta: hasta || '', cat: cat || 'todas', pct: +pct || 0 }; }).filter(p => p.pct),
      envios: lines(f, 'envios').map(l => { const i = l.lastIndexOf(','); return { zona: (i > 0 ? l.slice(0, i) : l).trim(), precio: +(i > 0 ? l.slice(i + 1) : 0) || 0 }; }) }));
  }
  if (ajTab === 'tienda') {
    const t = s.tienda || {};
    C.innerHTML = `<form class="form" id="f"><p class="muted">Tu carta online: los clientes ven fotos y precios y hacen pedidos que te llegan en Pedidos. Sin comisiones.</p>
      <label class="ck"><input type="checkbox" name="activa" ${t.activa ? 'checked' : ''}> Recibir pedidos online</label>
      <div class="checks"><label class="ck"><input type="checkbox" name="retiro" ${t.retiro ? 'checked' : ''}> Retiro en el local</label><label class="ck"><input type="checkbox" name="delivery" ${t.delivery ? 'checked' : ''}> Delivery</label><label class="ck"><input type="checkbox" name="mesa" ${t.mesa ? 'checked' : ''}> Pedir desde la mesa (QR)</label></div>
      <label>Pedido mínimo para delivery $<input name="minimo" type="number" value="${t.minimo || 0}"></label>
      <label>Mensaje destacado (horarios, promos…)<input name="mensaje" value="${esc(t.mensaje || '')}"></label>
      <label>Alias / CBU para transferencias (se muestra al cliente)<input name="alias" value="${esc(t.alias || '')}"></label>
      <div class="btns"><button type="button" class="btn ghost" id="qr">Ver link y QR</button><button class="btn pri">Guardar</button></div></form>`;
    saveForm($('#f'), f => ({ tienda: { activa: !!f.get('activa'), retiro: !!f.get('retiro'), delivery: !!f.get('delivery'), mesa: !!f.get('mesa'), minimo: +f.get('minimo') || 0, mensaje: f.get('mensaje'), alias: f.get('alias') } }));
    $('#qr').onclick = () => showQR();
  }
  if (ajTab === 'equipo') {
    C.innerHTML = `<div class="card">
      <label class="ck big"><input type="checkbox" id="printer" ${local.get('printer') ? 'checked' : ''}> Este dispositivo tiene la impresora (imprime comandas y tickets de todos)</label>
      <label class="ck big"><input type="checkbox" id="auto" ${local.get('autoTicket') !== false ? 'checked' : ''}> Imprimir ticket al cobrar</label>
      <label class="ck big"><input type="checkbox" id="pc" ${local.get('printComandas') !== false ? 'checked' : ''}> Imprimir comandas (si usan la pantalla de cocina se puede apagar)</label>
      <div class="quick"><button class="btn" id="test">Imprimir prueba</button></div></div>
      <div class="card"><h3>Apariencia</h3>${tabs([['light', 'Claro'], ['dark', 'Oscuro'], ['auto', 'Automático']], local.get('theme') || 'auto', 'th')}</div>
      <div class="card"><h3>Instalar como app</h3><p class="muted">En la tablet o el celu: abrí el menú del navegador y elegí “Agregar a pantalla de inicio”. Abre a pantalla completa y funciona sin internet.</p></div>`;
    $('#printer').onchange = e => { local.set('printer', e.target.checked); toast(e.target.checked ? 'Este dispositivo imprime' : 'Ya no imprime'); printerLoop(); };
    $('#auto').onchange = e => local.set('autoTicket', e.target.checked);
    $('#pc').onchange = e => local.set('printComandas', e.target.checked);
    $('#test').onclick = () => printHTML(`<h1>${esc(s.local)}</h1><div class="c">Prueba de impresión ✓</div><hr><div class="c">${new Date().toLocaleString('es-AR')}</div>`);
    $$('[data-th]', C).forEach(b => b.onclick = () => { local.set('theme', b.dataset.th === 'auto' ? null : b.dataset.th); applyTheme(); render(); });
  }
  if (ajTab === 'cuenta') {
    const members = window.TENANT_MEMBERS ? window.TENANT_MEMBERS() : null;
    C.innerHTML = `${members ? `<div class="card"><h3>Cuentas de Google con acceso</h3><p class="muted">Cada tablet o celu del local se habilita una vez entrando con una de estas cuentas. Después cada persona entra con su PIN.</p>
      ${members.list.map(e => `<div class="row"><span>${esc(e)}${e === members.owner ? ' <span class="pill">dueño</span>' : ''}</span>${members.canEdit && e !== members.owner ? `<button class="btn sm ghost" data-rm="${esc(e)}">Quitar</button>` : ''}</div>`).join('')}
      ${members.canEdit ? '<div class="row"><input id="nm" type="email" placeholder="email@gmail.com"><button class="btn" id="add">Agregar</button></div>' : ''}
      <p class="muted">Este dispositivo: ${esc(window.CLOUD_USER?.() || '')}</p><div class="quick"><button class="btn ghost" id="sout">Desconectar este dispositivo</button>${window.TENANT_SWITCH ? '<button class="btn ghost" id="sw">Cambiar / crear otro local</button>' : ''}</div></div>`
      : `<div class="card"><h3>Modo demo</h3><p class="muted">Los datos quedan solo en este navegador. Para usarlo en varias pantallas creá tu cuenta.</p><div class="quick"><a class="btn pri" href="./?cuenta=1">Crear mi cuenta</a><button class="btn danger" id="wipe">Borrar demo y empezar de cero</button></div></div>`}
      <div class="card"><h3>Copia de seguridad</h3><div class="quick"><button class="btn" id="exp">Descargar copia</button><label class="btn ghost">Restaurar copia<input type="file" id="imp" accept=".json" hidden></label></div></div>
      <div class="card"><h3>Importar productos (CSV)</h3><p class="muted">Columnas: categoría;nombre;precio;descripción. Sirve para traer la carta desde Excel, Fudo u otro sistema.</p><label class="btn">Elegir archivo CSV<input type="file" id="impcsv" accept=".csv,.txt" hidden></label></div>`;
    $$('[data-rm]', C).forEach(b => b.onclick = () => confirmBox('¿Quitar acceso a ' + b.dataset.rm + '?', () => members.remove(b.dataset.rm).then(() => render()), 'Quitar'));
    $('#add') && ($('#add').onclick = () => { const e = $('#nm').value.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(e)) return toast('Email inválido', 1); members.add(e).then(() => { toast('Acceso agregado'); render(); }); });
    $('#sout') && ($('#sout').onclick = () => confirmBox('¿Desconectar este dispositivo?', () => window.CLOUD_SIGNOUT(), 'Desconectar'));
    $('#sw') && ($('#sw').onclick = () => window.TENANT_SWITCH());
    $('#wipe') && ($('#wipe').onclick = () => confirmBox('¿Borrar todos los datos de la demo?', () => { LocalDB.wipe(); sessionStorage.clear(); location.reload(); }, 'Borrar'));
    $('#exp').onclick = async () => { toast('Preparando copia…'); const data = await DB.dump(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = 'morfi-' + (s.local || 'backup').replace(/\W+/g, '-') + '-' + dayKey(Date.now()) + '.json'; a.click(); };
    $('#imp').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => confirmBox('¿Cargar esta copia? Se suman/pisan los datos actuales.', () => { DB.load(JSON.parse(t)); toast('Copia restaurada'); }, 'Restaurar')); };
    $('#impcsv').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => {
      const rows = t.split(/\r?\n/).map(l => l.split(/;|\t/)).filter(r => r.length >= 3 && +String(r[2]).replace(/[^\d.]/g, ''));
      confirmBox(`¿Importar ${rows.length} productos?`, () => {
        const cats = DB.list('cats');
        rows.forEach((r, i) => { const cn = r[0].trim() || 'General'; let c = cats.find(x => x.name.toLowerCase() === cn.toLowerCase()); if (!c) { c = DB.put('cats', { id: 'c' + uid(), name: cn, pos: cats.length }); cats.push(c); }
          DB.put('prods', { cat: c.id, name: r[1].trim(), price: +String(r[2]).replace(/[^\d.]/g, ''), desc: (r[3] || '').trim(), active: true, mods: [], station: settings().estaciones[0], pos: 1000 + i }); });
        toast(rows.length + ' productos importados');
      }, 'Importar'); }); };
  }
  $$('[data-tab]', el).forEach(b => b.onclick = () => { ajTab = b.dataset.tab; render(); });
};
