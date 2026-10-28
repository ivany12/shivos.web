/* Morfi · administración: carta, stock, compras y gastos */
'use strict';

/* ───────── carta (productos, categorías, opciones) ───────── */
let cartaTab = 'prods';
VIEWFN.productos = el => {
  const cats = DB.list('cats').sort((a, b) => a.pos - b.pos);
  const prods = DB.list('prods').sort((a, b) => a.pos - b.pos);
  const mods = DB.list('mods').sort((a, b) => a.name.localeCompare(b.name));
  const edit = can('stock');
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Carta</h2><p class="muted">${prods.filter(p => p.active !== false).length} productos activos</p></div>
    <div class="quick">${edit ? '<button class="btn pri" id="nuevo">+ Producto</button><button class="btn" id="aum">Actualizar precios</button>' : ''}<button class="btn ghost" id="qr">Carta QR / tienda</button></div></div>
    ${tabs([['prods', 'Productos'], ['cats', 'Categorías'], ['mods', 'Opciones y extras']], cartaTab)}<div id="ct"></div></div>`;
  const C = $('#ct', el);
  if (cartaTab === 'prods') {
    C.innerHTML = `<input class="search" id="q" placeholder="Buscar producto…">${cats.map(c => { const l = prods.filter(p => p.cat === c.id); return l.length ? `<section class="pcat"><h3>${esc(c.name)} <span class="muted">${l.length}</span></h3><div class="tbl-wrap"><table class="tbl click">${l.map(p => { const cost = prodCost(p); return `<tr data-p="${p.id}" class="${p.active === false ? 'anul' : ''}"><td>${p.fav ? '★ ' : ''}<b>${esc(p.name)}</b>${p.active === false ? ' <span class="pill">pausado</span>' : ''}${p.online === false ? ' <span class="pill">no online</span>' : ''}<br><small class="muted">${esc(p.desc || '')}</small></td><td class="muted hide-m">${esc(p.station || '')}</td><td class="r muted hide-m">${cost ? 'costo ' + money(cost) + ' · ' + Math.round((p.price - cost) / p.price * 100) + '%' : ''}</td><td class="r"><b>${money(p.price)}</b></td></tr>`; }).join('')}</table></div></section>` : ''; }).join('')}
      ${prods.some(p => !cats.find(c => c.id === p.cat)) ? '<p class="warn">Hay productos sin categoría.</p>' : ''}`;
    $('#q').oninput = e => { const t = e.target.value.toLowerCase(); $$('tr[data-p]', C).forEach(r => r.style.display = r.textContent.toLowerCase().includes(t) ? '' : 'none'); };
    $$('[data-p]', C).forEach(r => r.onclick = () => edit ? editProd(DB.get('prods', r.dataset.p)) : null);
  }
  if (cartaTab === 'cats') {
    C.innerHTML = `<div class="tbl-wrap narrow"><table class="tbl">${cats.map((c, i) => `<tr><td><b>${esc(c.name)}</b> <span class="muted">${prods.filter(p => p.cat === c.id).length}</span></td><td class="r">${edit ? `<button class="btn sm ghost" data-up="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn sm ghost" data-down="${i}" ${i < cats.length - 1 ? '' : 'disabled'}>↓</button><button class="btn sm ghost" data-ren="${c.id}">Renombrar</button><button class="btn sm ghost danger-t" data-del="${c.id}">Borrar</button>` : ''}</td></tr>`).join('')}</table></div>${edit ? '<button class="btn" id="ncat">+ Categoría</button>' : ''}`;
    const swap = (i, j) => { const a = cats[i], b = cats[j]; DB.put('cats', { ...a, pos: j }); DB.put('cats', { ...b, pos: i }); cats.forEach((c, k) => c.pos !== k && k !== i && k !== j && DB.put('cats', { ...c, pos: k })); };
    $$('[data-up]', C).forEach(b => b.onclick = () => swap(+b.dataset.up, +b.dataset.up - 1));
    $$('[data-down]', C).forEach(b => b.onclick = () => swap(+b.dataset.down, +b.dataset.down + 1));
    $$('[data-ren]', C).forEach(b => b.onclick = () => { const c = DB.get('cats', b.dataset.ren); ask('Renombrar', [{ name: 'n', label: 'Nombre', value: c.name }], v => { DB.put('cats', { ...c, name: v.n.trim() || c.name }); }); });
    $$('[data-del]', C).forEach(b => b.onclick = () => { if (prods.some(p => p.cat === b.dataset.del)) return toast('Primero mové o borrá sus productos', 1); confirmBox('¿Borrar categoría?', () => DB.del('cats', b.dataset.del), 'Borrar'); });
    $('#ncat') && ($('#ncat').onclick = () => ask('Nueva categoría', [{ name: 'name', label: 'Nombre' }], v => { if (!v.name.trim()) return false; DB.put('cats', { id: 'c' + uid(), name: v.name.trim(), pos: cats.length }); }));
  }
  if (cartaTab === 'mods') {
    C.innerHTML = `<p class="muted">Grupos de opciones que se asignan a productos: extras, punto de cocción, guarnición, sabores…</p><div class="grid-cards">${mods.map(m => `<div class="card click" data-m="${m.id}"><b>${esc(m.name)}</b><span class="muted">${m.min ? 'Obligatorio · ' : ''}${m.max === 1 ? 'elige 1' : 'hasta ' + (m.max || '∞')}</span><small>${m.opts.map(o => esc(o.n) + (o.p ? ' +' + money(o.p) : '')).join(' · ')}</small><small class="muted">En ${prods.filter(p => (p.mods || []).includes(m.id)).length} productos</small></div>`).join('')}</div>${edit ? '<button class="btn" id="nmod">+ Grupo de opciones</button>' : ''}`;
    $$('[data-m]', C).forEach(b => b.onclick = () => edit && editMod(DB.get('mods', b.dataset.m)));
    $('#nmod') && ($('#nmod').onclick = () => editMod({ name: '', min: 0, max: 9, opts: [] }));
  }
  $$('[data-tab]', el).forEach(b => b.onclick = () => { cartaTab = b.dataset.tab; render(); });
  $('#nuevo') && ($('#nuevo').onclick = () => editProd({ cat: cats[0]?.id, active: true, mods: [], station: settings().estaciones[0] }));
  $('#qr').onclick = () => showQR();
  $('#aum') && ($('#aum').onclick = () => ask('Actualizar precios', [
    { name: 'cat', label: 'Categoría', type: 'select', options: [['', 'Todas']].concat(cats.map(c => [c.id, c.name])) },
    { name: 'pct', label: 'Porcentaje (ej: 10 sube, -5 baja)', type: 'number', inputmode: 'decimal', step: 'any' },
    { name: 'red', label: 'Redondear a', type: 'select', options: ['10', '50', '100', '500', '1000'], value: '100' }], v => {
    const pct = +v.pct; if (!pct) return false;
    const red = +v.red;
    const l = prods.filter(p => (!v.cat || p.cat === v.cat) && p.price > 0);
    modal(`<h3>Vista previa · ${pct > 0 ? '+' : ''}${pct}%</h3><div class="tbl-wrap" style="max-height:50vh"><table class="tbl plain">${l.map(p => `<tr><td>${esc(p.name)}</td><td class="r muted">${money(p.price)}</td><td class="r"><b>${money(Math.round(p.price * (1 + pct / 100) / red) * red)}</b></td></tr>`).join('')}</table></div>
      <div class="btns"><button class="btn ghost" data-close>Cancelar</button><button class="btn pri" id="ap">Aplicar a ${l.length}</button></div>`, (m, close) => {
      $('#ap', m).onclick = () => { l.forEach(p => DB.put('prods', { ...p, price: Math.round(p.price * (1 + pct / 100) / red) * red })); close(); toast('Precios actualizados'); };
    });
  }, 'Ver cambios'));
};
function editProd(p) {
  const cats = DB.list('cats').sort((a, b) => a.pos - b.pos), mods = DB.list('mods'), ins = DB.list('insumos').sort((a, b) => a.name.localeCompare(b.name));
  const est = settings().estaciones;
  let receta = (p.receta || []).map(r => ({ ...r }));
  const isNew = !p.id;
  modal(`<h3>${isNew ? 'Nuevo producto' : esc(p.name)}</h3><form class="form grid2">
    <label class="full">Nombre<input name="name" value="${esc(p.name || '')}" required></label>
    <label>Precio<input name="price" type="number" inputmode="numeric" value="${p.price ?? ''}" required></label>
    <label>Categoría<select name="cat">${cats.map(c => `<option value="${c.id}" ${c.id === p.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="full">Descripción (se ve en la carta online)<input name="desc" value="${esc(p.desc || '')}"></label>
    <label>Sale por<select name="station">${est.concat(['Ninguna']).map(e => `<option ${e === (p.station || est[0]) ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></label>
    <label>Foto (link, opcional)<input name="img" value="${esc(p.img || '')}" placeholder="https://…"></label>
    <div class="full"><h4>Opciones</h4><div class="checks">${mods.map(m => `<label class="ck"><input type="checkbox" name="m_${m.id}" ${(p.mods || []).includes(m.id) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('') || '<span class="muted">Creá grupos en “Opciones y extras”.</span>'}</div></div>
    <div class="full"><h4>Receta (descuenta stock y calcula costo)</h4><div id="rec"></div>
      ${ins.length ? `<div class="row"><select id="ri">${ins.map(i => `<option value="${i.id}">${esc(i.name)} (${esc(i.unit)})</option>`).join('')}</select><input id="rq" type="number" step="any" inputmode="decimal" placeholder="Cant." style="max-width:90px"><button type="button" class="btn sm" id="radd">Agregar</button></div>` : '<p class="muted">Cargá insumos en Stock para armar recetas.</p>'}</div>
    <div class="full checks"><label class="ck"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}> Activo</label><label class="ck"><input type="checkbox" name="online" ${p.online !== false ? 'checked' : ''}> En carta online</label><label class="ck"><input type="checkbox" name="fav" ${p.fav ? 'checked' : ''}> Favorito</label><label class="ck"><input type="checkbox" name="libre" ${p.libre ? 'checked' : ''}> Precio libre</label></div>
    <div class="btns full">${isNew ? '' : '<button type="button" class="btn ghost danger-t" id="del">Borrar</button><button type="button" class="btn ghost" id="dup">Duplicar</button>'}<button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Guardar</button></div></form>`, (m, close) => {
    const drawRec = () => {
      const cost = sum(receta, r => (DB.get('insumos', r.ins)?.costo || 0) * r.qty);
      $('#rec', m).innerHTML = receta.map((r, i) => { const x = DB.get('insumos', r.ins); return `<div class="row rec"><span>${esc(x?.name || '?')}</span><span class="muted">${num(r.qty)} ${esc(x?.unit || '')} · ${money((x?.costo || 0) * r.qty)}</span><button type="button" class="btn ghost sm" data-rx="${i}">✕</button></div>`; }).join('') + (receta.length ? `<div class="row"><b>Costo</b><b>${money(cost)}</b></div>` : '');
      $$('[data-rx]', m).forEach(b => b.onclick = () => { receta.splice(+b.dataset.rx, 1); drawRec(); });
    };
    drawRec();
    $('#radd', m) && ($('#radd', m).onclick = () => { const q = +$('#rq', m).value; if (!q) return; receta.push({ ins: $('#ri', m).value, qty: q }); $('#rq', m).value = ''; drawRec(); });
    $('form', m).onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target);
      DB.put('prods', { ...p, name: f.get('name').trim(), price: +f.get('price') || 0, cat: f.get('cat'), desc: f.get('desc').trim(), station: f.get('station'), img: f.get('img').trim(), active: !!f.get('active'), online: !!f.get('online'), fav: !!f.get('fav'), libre: !!f.get('libre'), mods: mods.filter(x => f.get('m_' + x.id)).map(x => x.id), receta, pos: p.pos ?? DB.list('prods').length });
      close(); toast('Guardado');
    };
    $('#del', m) && ($('#del', m).onclick = () => { close(); confirmBox('¿Borrar ' + p.name + '? (si solo no se vende más, pausalo)', () => DB.del('prods', p.id), 'Borrar'); });
    $('#dup', m) && ($('#dup', m).onclick = () => { close(); const { id, ...rest } = p; editProd({ ...rest, name: p.name + ' (copia)' }); });
  }, true);
}
function editMod(g) {
  let opts = g.opts.map(o => ({ ...o }));
  modal(`<h3>${g.id ? 'Editar opciones' : 'Nuevo grupo de opciones'}</h3><form class="form">
    <label>Nombre del grupo<input name="name" value="${esc(g.name)}" placeholder="Ej: Punto de la carne" required></label>
    <div class="grid2"><label>Mínimo a elegir<input name="min" type="number" value="${g.min || 0}"></label><label>Máximo<input name="max" type="number" value="${g.max || 9}"></label></div>
    <h4>Opciones</h4><div id="ol"></div><button type="button" class="btn sm" id="oadd">+ Opción</button>
    <div class="btns">${g.id ? '<button type="button" class="btn ghost danger-t" id="del">Borrar</button>' : ''}<button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Guardar</button></div></form>`, (m, close) => {
    const draw = () => {
      $('#ol', m).innerHTML = opts.map((o, i) => `<div class="row optrow"><input data-on="${i}" value="${esc(o.n)}" placeholder="Opción"><input data-op="${i}" type="number" inputmode="numeric" value="${o.p || 0}" style="max-width:110px"><button type="button" class="btn ghost sm" data-ox="${i}">✕</button></div>`).join('');
      $$('[data-on]', m).forEach(x => x.oninput = () => opts[+x.dataset.on].n = x.value);
      $$('[data-op]', m).forEach(x => x.oninput = () => opts[+x.dataset.op].p = +x.value || 0);
      $$('[data-ox]', m).forEach(x => x.onclick = () => { opts.splice(+x.dataset.ox, 1); draw(); });
    };
    draw();
    $('#oadd', m).onclick = () => { opts.push({ n: '', p: 0 }); draw(); $$('[data-on]', m).pop().focus(); };
    $('form', m).onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); DB.put('mods', { ...g, id: g.id || 'g' + uid(), name: f.get('name').trim(), min: +f.get('min') || 0, max: +f.get('max') || 1, opts: opts.filter(o => o.n.trim()) }); close(); toast('Guardado'); };
    $('#del', m) && ($('#del', m).onclick = () => { close(); confirmBox('¿Borrar grupo de opciones?', () => { DB.del('mods', g.id); DB.list('prods').filter(p => (p.mods || []).includes(g.id)).forEach(p => DB.put('prods', { ...p, mods: p.mods.filter(x => x !== g.id) })); }, 'Borrar'); });
  });
}
function showQR() {
  const url = window.PUBLIC_URL ? window.PUBLIC_URL() : location.href.replace(/app\/.*$/, 'app/carta.html');
  const s = settings();
  const mesas = s.zonas.flatMap((z, zi) => Array.from({ length: z.mesas }, (_, i) => (s.zonas.length > 1 && zi ? z.name[0].toUpperCase() : '') + (i + 1)));
  const qr = u => `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=10&data=${encodeURIComponent(u)}`;
  modal(`<h3>Carta online y QR</h3><p class="muted">Tus clientes ven la carta y hacen pedidos (retiro, delivery o desde la mesa). Los pedidos te llegan en Pedidos para aceptar.</p>
    <div class="qrbox"><img src="${qr(url)}" alt="QR de la carta" width="180" height="180"><div><b>Link de tu tienda</b><input readonly value="${esc(url)}" id="qu"><div class="quick"><button class="btn sm" id="cp">Copiar link</button><a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a><button class="btn sm" id="pq">Imprimir QR de mesas</button></div></div></div>
    ${DB.impl.kind === 'local' ? '<p class="warn">Modo demo: la tienda solo funciona en este dispositivo.</p>' : ''}
    <div class="btns"><button class="btn ghost" data-close>Cerrar</button></div>`, m => {
    $('#cp', m).onclick = () => { navigator.clipboard?.writeText(url); toast('Link copiado'); };
    $('#pq', m).onclick = () => {
      const w = open('', '_blank'); if (!w) return toast('Permití ventanas emergentes', 1);
      w.document.write(`<!doctype html><meta charset="utf-8"><title>QR mesas</title><style>body{font-family:system-ui;margin:0}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;padding:10mm}.q{border:1px dashed #999;border-radius:6mm;padding:6mm;text-align:center;break-inside:avoid}.q b{font-size:22px;display:block}.q span{font-size:12px;color:#555}</style><div class="g">${mesas.map(n => `<div class="q"><b>${esc(s.local)}</b><img src="${qr(url + (url.includes('?') ? '&' : '?') + 'mesa=' + n)}" width="160"><b>Mesa ${n}</b><span>Escaneá para ver la carta y pedir</span></div>`).join('')}</div><script>setTimeout(()=>print(),1200)<\/script>`);
    };
  });
}

/* ───────── stock e insumos ───────── */
let stockTab = 'insumos';
VIEWFN.stock = el => {
  const ins = DB.list('insumos').sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || a.name.localeCompare(b.name));
  const bajos = ins.filter(i => i.controlar && i.min != null && (i.stock || 0) <= i.min);
  const valor = sum(ins, i => Math.max(0, i.stock || 0) * (i.costo || 0));
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Stock</h2><p class="muted">${ins.length} insumos · valorizado ${money(valor)}${bajos.length ? ` · <b class="bad">${bajos.length} bajo mínimo</b>` : ''}</p></div>
    <div class="quick"><button class="btn pri" id="nuevo">+ Insumo</button><button class="btn" id="conteo">Conteo de inventario</button><button class="btn" id="merma">Registrar merma</button></div></div>
    ${tabs([['insumos', 'Insumos'], ['movs', 'Movimientos'], ['compra', 'Lista de compras']], stockTab)}<div id="sc"></div></div>`;
  const C = $('#sc', el);
  if (stockTab === 'insumos') {
    C.innerHTML = ins.length ? `<input class="search" id="q" placeholder="Buscar insumo…"><div class="tbl-wrap"><table class="tbl click"><tr><th>Insumo</th><th class="hide-m">Categoría</th><th class="r">Stock</th><th class="r hide-m">Mínimo</th><th class="r">Costo</th></tr>${ins.map(i => `<tr data-i="${i.id}" class="${i.controlar && (i.stock || 0) <= (i.min || 0) ? 'lowrow' : ''}"><td><b>${esc(i.name)}</b>${i.controlar ? '' : ' <small class="muted">(no controla)</small>'}</td><td class="muted hide-m">${esc(i.cat || '')}</td><td class="r"><b>${num(i.stock)}</b> ${esc(i.unit)}</td><td class="r muted hide-m">${i.min != null ? num(i.min) : '—'}</td><td class="r">${money(i.costo)}/${esc(i.unit)}</td></tr>`).join('')}</table></div>`
      : empty('Sin insumos todavía', 'Cargá carne, pan, queso, bebidas… y armá las recetas de cada producto para que el stock se descuente solo al vender.');
    $('#q') && ($('#q').oninput = e => { const t = e.target.value.toLowerCase(); $$('tr[data-i]', C).forEach(r => r.style.display = r.textContent.toLowerCase().includes(t) ? '' : 'none'); });
    $$('[data-i]', C).forEach(r => r.onclick = () => editInsumo(DB.get('insumos', r.dataset.i)));
  }
  if (stockTab === 'movs') {
    const mv = DB.list('stockmov').sort((a, b) => b.t - a.t).slice(0, 300);
    C.innerHTML = `<div class="tbl-wrap"><table class="tbl"><tr><th>Fecha</th><th>Insumo</th><th>Tipo</th><th class="r">Cantidad</th><th class="hide-m">Detalle</th></tr>${mv.map(m => { const i = DB.get('insumos', m.ins); return `<tr><td>${fecha(m.t)} ${hhmm(m.t)}</td><td>${esc(i?.name || '?')}</td><td><span class="pill">${esc(m.tipo)}</span></td><td class="r ${m.qty < 0 ? 'bad' : 'ok'}">${m.qty > 0 ? '+' : ''}${num(m.qty)} ${esc(i?.unit || '')}</td><td class="muted hide-m">${esc(m.ref)} ${esc(m.por)}</td></tr>`; }).join('') || `<tr><td colspan="5">${empty('Sin movimientos')}</td></tr>`}</table></div>`;
  }
  if (stockTab === 'compra') {
    const l = ins.filter(i => i.controlar && i.min != null && (i.stock || 0) <= (i.max || i.min * 2 || 0));
    const provs = Object.fromEntries(DB.list('proveedores').map(p => [p.id, p]));
    const by = {}; l.forEach(i => (by[i.prov || ''] = by[i.prov || ''] || []).push(i));
    C.innerHTML = l.length ? Object.entries(by).map(([pid, items]) => `<div class="card"><h3>${esc(provs[pid]?.name || 'Sin proveedor asignado')}</h3>${items.map(i => `<div class="row"><span>${esc(i.name)}</span><span class="muted">tenés ${num(i.stock)} ${esc(i.unit)}</span><b>pedir ${num(Math.max(0, (i.max || i.min * 2) - (i.stock || 0)))} ${esc(i.unit)}</b></div>`).join('')}
      ${provs[pid]?.tel ? `<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${provs[pid].tel.replace(/\D/g, '')}?text=${encodeURIComponent('Hola! Pedido de ' + settings().local + ':\n' + items.map(i => '- ' + num(Math.max(0, (i.max || i.min * 2) - (i.stock || 0))) + ' ' + i.unit + ' ' + i.name).join('\n'))}">Enviar por WhatsApp</a>` : ''}</div>`).join('') : empty('Nada para reponer', 'Cuando un insumo baja del mínimo aparece acá, agrupado por proveedor.');
  }
  $$('[data-tab]', el).forEach(b => b.onclick = () => { stockTab = b.dataset.tab; render(); });
  $('#nuevo').onclick = () => editInsumo({ unit: 'unidad', controlar: true });
  $('#merma').onclick = () => ask('Registrar merma / pérdida', [{ name: 'ins', label: 'Insumo', type: 'select', options: ins.map(i => [i.id, i.name + ' (' + i.unit + ')']) }, { name: 'q', label: 'Cantidad perdida', type: 'number', step: 'any', inputmode: 'decimal' }, { name: 'm', label: 'Motivo', value: 'Vencido' }], v => { if (!+v.q) return false; moveStock(v.ins, -Math.abs(+v.q), 'merma', v.m); toast('Merma registrada'); });
  $('#conteo').onclick = () => modal(`<h3>Conteo de inventario</h3><p class="muted">Poné lo que contaste. Lo que dejes vacío no se toca.</p><div class="tbl-wrap" style="max-height:55vh"><table class="tbl plain">${ins.filter(i => i.controlar).map(i => `<tr><td>${esc(i.name)}</td><td class="muted r">sistema ${num(i.stock)} ${esc(i.unit)}</td><td><input data-c="${i.id}" type="number" step="any" inputmode="decimal" style="width:100px"></td></tr>`).join('')}</table></div><div class="btns"><button class="btn ghost" data-close>Cancelar</button><button class="btn pri" id="ok">Ajustar stock</button></div>`, (m, close) => {
    $('#ok', m).onclick = () => { let n = 0; $$('[data-c]', m).forEach(x => { if (x.value === '') return; const i = DB.get('insumos', x.dataset.c); const d = +x.value - (i.stock || 0); if (d) { moveStock(i.id, d, 'conteo', 'Conteo de inventario'); n++; } }); close(); toast(n + ' insumos ajustados'); };
  });
};
function editInsumo(i) {
  const provs = DB.list('proveedores');
  ask(i.id ? i.name : 'Nuevo insumo', [
    { name: 'name', label: 'Nombre', value: i.name || '' },
    { name: 'cat', label: 'Categoría', value: i.cat || '', ph: 'Carnes, panificados, bebidas…' },
    { name: 'unit', label: 'Unidad', type: 'select', options: ['unidad', 'kg', 'g', 'litro', 'ml', 'paquete', 'caja', 'feta', 'porción'], value: i.unit, half: 1 },
    { name: 'costo', label: 'Costo por unidad', type: 'number', step: 'any', inputmode: 'decimal', value: i.costo ?? '', half: 1 },
    { name: 'stock', label: i.id ? 'Stock actual (usá conteo para ajustar)' : 'Stock inicial', type: 'number', step: 'any', inputmode: 'decimal', value: i.stock ?? 0, half: 1 },
    { name: 'min', label: 'Stock mínimo (alerta)', type: 'number', step: 'any', inputmode: 'decimal', value: i.min ?? '', half: 1 },
    { name: 'max', label: 'Stock ideal (para pedir)', type: 'number', step: 'any', inputmode: 'decimal', value: i.max ?? '', half: 1 },
    { name: 'prov', label: 'Proveedor habitual', type: 'select', options: [['', '—']].concat(provs.map(p => [p.id, p.name])), value: i.prov || '', half: 1 },
    { name: 'controlar', label: 'Controlar stock', type: 'select', options: [['1', 'Sí'], ['', 'No']], value: i.controlar ? '1' : '' }
  ], v => {
    if (!v.name.trim()) return false;
    const st = +v.stock || 0;
    const o = DB.put('insumos', { ...i, name: v.name.trim(), cat: v.cat.trim(), unit: v.unit, costo: +v.costo || 0, min: v.min === '' ? null : +v.min, max: v.max === '' ? null : +v.max, prov: v.prov, controlar: !!v.controlar, stock: i.id ? i.stock : st });
    if (i.id && st !== (i.stock || 0)) moveStock(o.id, st - (i.stock || 0), 'ajuste', 'Edición manual');
  });
}

/* ───────── compras, gastos y proveedores ───────── */
let compTab = 'compras';
VIEWFN.compras = el => {
  const s = settings();
  const provs = DB.list('proveedores').sort((a, b) => a.name.localeCompare(b.name));
  const pmap = Object.fromEntries(provs.map(p => [p.id, p]));
  const d1 = dayKey(Date.now() - 30 * 86400000), hoy = dayKey(Date.now());
  const compras = (between('compras', 't', d1, hoy, () => route.v === 'compras' && render()) || []).sort((a, b) => b.t - a.t);
  const gastos = (between('gastos', 't', d1, hoy, () => route.v === 'compras' && render()) || []).sort((a, b) => b.t - a.t);
  const deudaProv = id => sum(DB.list('compras').filter(c => c.prov === id), c => c.total - (c.pagado || 0)) - sum(DB.list('pagosprov') || [], p => p.prov === id ? p.monto : 0);
  el.innerHTML = `<div class="page"><div class="bar"><div><h2>Compras y gastos</h2><p class="muted">Últimos 30 días: compras ${money(sum(compras, c => c.total))} · gastos ${money(sum(gastos, g => g.monto))}</p></div>
    <div class="quick"><button class="btn pri" id="ncomp">+ Compra</button><button class="btn" id="ngasto">+ Gasto</button><button class="btn ghost" id="nprov">+ Proveedor</button></div></div>
    ${tabs([['compras', 'Compras'], ['gastos', 'Gastos'], ['provs', 'Proveedores']], compTab)}<div id="cc"></div></div>`;
  const C = $('#cc', el);
  if (compTab === 'compras') C.innerHTML = `<div class="tbl-wrap"><table class="tbl click"><tr><th>Fecha</th><th>Proveedor</th><th class="hide-m">Detalle</th><th class="r">Total</th><th class="r">Estado</th></tr>${compras.map(c => `<tr data-c="${c.id}"><td>${fecha(c.t)}</td><td>${esc(pmap[c.prov]?.name || c.provName || '—')}</td><td class="muted hide-m">${esc((c.items || []).map(i => num(i.qty) + ' ' + (DB.get('insumos', i.ins)?.name || i.n || '')).join(', ').slice(0, 70))}${c.factura ? ' · Fc ' + esc(c.factura) : ''}</td><td class="r">${money(c.total)}</td><td class="r">${(c.pagado || 0) >= c.total ? '<span class="pill ok">pagada</span>' : `<span class="pill warn">debe ${money(c.total - (c.pagado || 0))}</span>`}</td></tr>`).join('') || `<tr><td colspan="5">${empty('Sin compras cargadas', 'Al cargar una compra con insumos, el stock y los costos se actualizan solos.')}</td></tr>`}</table></div>`;
  if (compTab === 'gastos') {
    const gc = {}; gastos.forEach(g => gc[g.cat] = (gc[g.cat] || 0) + g.monto);
    C.innerHTML = `${gastos.length ? `<div class="card">${bars(Object.entries(gc).sort((a, b) => b[1] - a[1]), sum(gastos, g => g.monto))}</div>` : ''}<div class="tbl-wrap"><table class="tbl click"><tr><th>Fecha</th><th>Categoría</th><th>Detalle</th><th class="hide-m">Medio</th><th class="r">Monto</th></tr>${gastos.map(g => `<tr data-g="${g.id}"><td>${fecha(g.t)}</td><td>${esc(g.cat)}</td><td>${esc(g.desc || '')}${g.prov ? ' · ' + esc(pmap[g.prov]?.name || '') : ''}</td><td class="muted hide-m">${esc(g.medio || '')}${g.deCaja ? ' (caja)' : ''}</td><td class="r">${money(g.monto)}</td></tr>`).join('') || `<tr><td colspan="5">${empty('Sin gastos cargados')}</td></tr>`}</table></div>`;
  }
  if (compTab === 'provs') C.innerHTML = `<div class="grid-cards">${provs.map(p => { const d = deudaProv(p.id); return `<div class="card click" data-p="${p.id}"><b>${esc(p.name)}</b><span class="muted">${esc(p.cat || '')}</span><small>${esc(p.tel || '')} ${esc(p.cuit ? '· CUIT ' + p.cuit : '')}</small>${d > 0 ? `<span class="pill warn">Le debés ${money(d)}</span>` : '<span class="pill ok">Al día</span>'}</div>`; }).join('') || empty('Sin proveedores')}</div>`;
  $$('[data-tab]', el).forEach(b => b.onclick = () => { compTab = b.dataset.tab; render(); });
  $('#nprov').onclick = () => editProv({});
  $$('[data-p]', C).forEach(b => b.onclick = () => verProv(DB.get('proveedores', b.dataset.p)));
  $('#ngasto').onclick = () => editGasto({});
  $$('[data-g]', C).forEach(r => r.onclick = () => editGasto(DB.get('gastos', r.dataset.g)));
  $('#ncomp').onclick = () => editCompra({});
  $$('[data-c]', C).forEach(r => r.onclick = () => editCompra(DB.get('compras', r.dataset.c)));
};
function editProv(p) {
  ask(p.id ? p.name : 'Nuevo proveedor', [{ name: 'name', label: 'Nombre', value: p.name || '' }, { name: 'cat', label: 'Rubro', value: p.cat || '', ph: 'Carnicería, verdulería, bebidas…' }, { name: 'tel', label: 'Teléfono / WhatsApp', type: 'tel', value: p.tel || '' }, { name: 'cuit', label: 'CUIT', value: p.cuit || '' }, { name: 'nota', label: 'Notas (días de entrega, contacto…)', type: 'textarea', value: p.nota || '' }],
    v => { if (!v.name.trim()) return false; DB.put('proveedores', { ...p, ...v, name: v.name.trim() }); });
}
function verProv(p) {
  const cs = DB.list('compras').filter(c => c.prov === p.id).sort((a, b) => b.t - a.t);
  const deuda = sum(cs, c => c.total - (c.pagado || 0));
  modal(`<h3>${esc(p.name)}</h3><p class="muted">${esc(p.cat || '')} ${esc(p.tel || '')} ${esc(p.cuit || '')}</p>${p.nota ? `<p>${esc(p.nota)}</p>` : ''}
    <div class="kpis"><div class="kpi"><small>Comprado (total)</small><b>${money(sum(cs, c => c.total))}</b></div><div class="kpi"><small>Saldo a pagar</small><b class="${deuda > 0 ? 'bad' : ''}">${money(deuda)}</b></div></div>
    <table class="tbl plain">${cs.slice(0, 20).map(c => `<tr><td>${fecha(c.t)}</td><td>${esc(c.factura || '')}</td><td class="r">${money(c.total)}</td><td class="r">${(c.pagado || 0) >= c.total ? 'pagada' : 'debe ' + money(c.total - (c.pagado || 0))}</td></tr>`).join('')}</table>
    <div class="btns"><button class="btn ghost" id="ed">Editar datos</button>${deuda > 0 ? '<button class="btn" id="pg">Registrar pago</button>' : ''}${p.tel ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${p.tel.replace(/\D/g, '')}">WhatsApp</a>` : ''}<button class="btn ghost" data-close>Cerrar</button></div>`, (m, close) => {
    $('#ed', m).onclick = () => { close(); editProv(p); };
    $('#pg', m) && ($('#pg', m).onclick = () => { close(); ask('Pago a ' + p.name, [{ name: 'monto', label: 'Monto', type: 'number', value: deuda }, { name: 'medio', label: 'Medio', type: 'select', options: ['Transferencia', 'Efectivo', 'Cheque', 'Otro'] }], v => {
      let resto = +v.monto || 0;
      cs.slice().reverse().forEach(c => { const d = c.total - (c.pagado || 0); if (d > 0 && resto > 0) { const x = Math.min(d, resto); resto -= x; DB.put('compras', { ...c, pagado: (c.pagado || 0) + x }); } });
      if (v.medio === 'Efectivo' && openCash()) DB.put('moves', { cajaId: openCash().id, tipo: 'egreso', monto: +v.monto, concepto: 'Pago a ' + p.name, t: Date.now(), por: ME.name });
      toast('Pago registrado');
    }); });
  });
}
function editGasto(g) {
  const s = settings(), provs = DB.list('proveedores');
  ask(g.id ? 'Editar gasto' : 'Nuevo gasto', [
    { name: 'cat', label: 'Categoría', type: 'select', options: s.catGastos, value: g.cat },
    { name: 'monto', label: 'Monto', type: 'number', inputmode: 'numeric', value: g.monto ?? '' },
    { name: 'desc', label: 'Detalle', value: g.desc || '' },
    { name: 'fecha', label: 'Fecha', type: 'date', value: dayKey(g.t || Date.now()) },
    { name: 'medio', label: 'Medio de pago', type: 'select', options: ['Transferencia', 'Efectivo (de caja)', 'Efectivo (aparte)', 'Débito automático', 'Tarjeta', 'Otro'], value: g.medio },
    { name: 'prov', label: 'Proveedor (opcional)', type: 'select', options: [['', '—']].concat(provs.map(p => [p.id, p.name])), value: g.prov || '' }
  ], v => {
    if (!+v.monto) return false;
    const t = v.fecha === dayKey(Date.now()) ? (g.t || Date.now()) : dayStart(v.fecha) + 12 * 3600000;
    const deCaja = v.medio === 'Efectivo (de caja)';
    if (deCaja && !g.id) { const c = openCash(); if (c) DB.put('moves', { cajaId: c.id, tipo: 'egreso', monto: +v.monto, concepto: v.cat + ' ' + v.desc, t: Date.now(), por: ME.name }); }
    DB.put('gastos', { ...g, cat: v.cat, monto: +v.monto, desc: v.desc, t, medio: v.medio, prov: v.prov, deCaja, por: g.por || ME.name });
  }, 'Guardar', g.id ? '<button type="button" class="btn ghost danger-t" onclick="this.closest(\'.modal-bg\').remove();confirmBox(\'¿Borrar gasto?\',()=>DB.del(\'gastos\',\'' + g.id + '\'),\'Borrar\')">Borrar gasto</button>' : '');
}
function editCompra(c) {
  const provs = DB.list('proveedores'), ins = DB.list('insumos').sort((a, b) => a.name.localeCompare(b.name));
  let items = (c.items || []).map(i => ({ ...i }));
  const ro = !!c.id;
  modal(`<h3>${ro ? 'Compra ' + fecha(c.t) : 'Nueva compra'}</h3><form class="form grid2">
    <label>Proveedor<select name="prov" ${ro ? 'disabled' : ''}><option value="">—</option>${provs.map(p => `<option value="${p.id}" ${p.id === c.prov ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label>N° factura / remito<input name="factura" value="${esc(c.factura || '')}"></label>
    <div class="full"><h4>Insumos comprados</h4><div id="ci"></div>${ro ? '' : `${ins.length ? `<div class="row"><select id="ii">${ins.map(i => `<option value="${i.id}">${esc(i.name)} (${esc(i.unit)})</option>`).join('')}</select><input id="iq" type="number" step="any" placeholder="Cant." style="max-width:80px"><input id="ip" type="number" step="any" placeholder="$ total" style="max-width:110px"><button type="button" class="btn sm" id="iadd">+</button></div>` : '<p class="muted">Sin insumos: cargá el total abajo o creá insumos en Stock.</p>'}`}</div>
    <label>Total<input name="total" type="number" inputmode="numeric" value="${c.total ?? ''}" ${ro ? 'readonly' : ''}></label>
    <label>Pagado<input name="pagado" type="number" inputmode="numeric" value="${c.pagado ?? ''}" placeholder="vacío = pagado todo"></label>
    <label>Medio<select name="medio"><option>Transferencia</option><option>Efectivo (de caja)</option><option>Efectivo (aparte)</option><option>Cuenta corriente</option></select></label>
    <label>Fecha<input name="fecha" type="date" value="${dayKey(c.t || Date.now())}" ${ro ? 'readonly' : ''}></label>
    <div class="btns full">${ro && can('anular') ? '<button type="button" class="btn ghost danger-t" id="del">Borrar</button>' : ''}<button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Guardar</button></div></form>`, (m, close) => {
    const draw = () => {
      $('#ci', m).innerHTML = items.map((it, i) => { const x = DB.get('insumos', it.ins); return `<div class="row rec"><span>${esc(x?.name || it.n || '?')}</span><span class="muted">${num(it.qty)} ${esc(x?.unit || '')} · ${money(it.costo * it.qty)} (${money(it.costo)}/${esc(x?.unit || 'u')})</span>${ro ? '' : `<button type="button" class="btn ghost sm" data-x="${i}">✕</button>`}</div>`; }).join('');
      $$('[data-x]', m).forEach(b => b.onclick = () => { items.splice(+b.dataset.x, 1); draw(); });
      if (!ro && items.length) $('[name=total]', m).value = Math.round(sum(items, i => i.costo * i.qty));
    };
    draw();
    $('#iadd', m) && ($('#iadd', m).onclick = () => { const q = +$('#iq', m).value, p = +$('#ip', m).value; if (!q || !p) return toast('Poné cantidad y precio total', 1); items.push({ ins: $('#ii', m).value, qty: q, costo: p / q }); $('#iq', m).value = $('#ip', m).value = ''; draw(); });
    $('form', m).onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target);
      const total = +f.get('total') || 0; if (!total) return toast('Falta el total', 1);
      const pagado = f.get('medio') === 'Cuenta corriente' ? (+f.get('pagado') || 0) : (f.get('pagado') === '' ? total : +f.get('pagado'));
      if (ro) { DB.put('compras', { ...c, factura: f.get('factura'), pagado }); close(); return; }
      const t = f.get('fecha') === dayKey(Date.now()) ? Date.now() : dayStart(f.get('fecha')) + 12 * 3600000;
      const prov = f.get('prov');
      const cp = DB.put('compras', { prov, provName: DB.get('proveedores', prov)?.name || '', factura: f.get('factura'), items, total, pagado, medio: f.get('medio'), t, por: ME.name });
      items.forEach(it => moveStock(it.ins, it.qty, 'compra', (DB.get('proveedores', prov)?.name || 'Compra') + (cp.factura ? ' Fc ' + cp.factura : ''), it.costo));
      if (f.get('medio') === 'Efectivo (de caja)' && openCash()) DB.put('moves', { cajaId: openCash().id, tipo: 'egreso', monto: pagado, concepto: 'Compra ' + (cp.provName || ''), t: Date.now(), por: ME.name });
      close(); toast('Compra guardada' + (items.length ? ' · stock actualizado' : ''));
    };
    $('#del', m) && ($('#del', m).onclick = () => { close(); confirmBox('¿Borrar compra? (el stock no se revierte)', () => DB.del('compras', c.id), 'Borrar'); });
  }, true);
}
