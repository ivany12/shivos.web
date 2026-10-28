// Plantillas genéricas para locales nuevos y para la demo.
window.TEMPLATES = window.TEMPLATES || {};
window.TEMPLATES.vacio = () => ({
  settings: {},
  cats: [{ id: 'c1', name: 'Platos', pos: 0 }, { id: 'c2', name: 'Bebidas', pos: 1 }],
  prods: [], mods: [], users: [{ id: 'u1', name: 'Dueño', role: 'dueno', pin: '1234', active: true }]
});
window.TEMPLATES.demo = () => {
  const cats = [['c1', 'Hamburguesas'], ['c2', 'Pizzas'], ['c3', 'Para compartir'], ['c4', 'Ensaladas'], ['c5', 'Postres'], ['c6', 'Bebidas'], ['c7', 'Cervezas y tragos']];
  const ins = [
    ['i1', 'Medallón de carne 120 g', 'unidad', 950, 80, 30, 'Carnes', 'pv1'], ['i2', 'Pan de papa', 'unidad', 380, 70, 30, 'Panificados', 'pv2'],
    ['i3', 'Cheddar', 'feta', 120, 300, 100, 'Lácteos', 'pv3'], ['i4', 'Panceta', 'kg', 9800, 3, 1, 'Carnes', 'pv1'],
    ['i5', 'Papas congeladas', 'kg', 2600, 25, 10, 'Congelados', 'pv3'], ['i6', 'Muzzarella', 'kg', 7200, 8, 3, 'Lácteos', 'pv3'],
    ['i7', 'Prepizza', 'unidad', 650, 40, 15, 'Panificados', 'pv2'], ['i8', 'Lechuga', 'kg', 2200, 4, 2, 'Verdulería', 'pv4'],
    ['i9', 'Tomate', 'kg', 1900, 6, 2, 'Verdulería', 'pv4'], ['i10', 'Gaseosa 500 ml', 'unidad', 900, 96, 48, 'Bebidas', 'pv5'],
    ['i11', 'Cerveza tirada (litro)', 'litro', 2100, 60, 20, 'Bebidas', 'pv5'], ['i12', 'Aceite', 'litro', 2400, 18, 6, 'Almacén', 'pv3']
  ];
  const P = [
    ['c1', 'Clásica', 9800, 'punto,extras,guarn', 'Cocina', 'Medallón 120 g, cheddar, lechuga y tomate. Con papas.', [['i1', 1], ['i2', 1], ['i3', 2], ['i8', .02], ['i9', .03], ['i5', .2]], 1],
    ['c1', 'Doble cheddar', 12500, 'punto,extras,guarn', 'Cocina', 'Doble medallón, cuádruple cheddar. Con papas.', [['i1', 2], ['i2', 1], ['i3', 4], ['i5', .2]], 1],
    ['c1', 'Bacon BBQ', 13200, 'punto,extras,guarn', 'Cocina', 'Doble medallón, cheddar, panceta crocante y barbacoa.', [['i1', 2], ['i2', 1], ['i3', 2], ['i4', .04], ['i5', .2]], 1],
    ['c1', 'Veggie', 11000, 'extras,guarn', 'Cocina', 'Medallón de garbanzos, palta, rúcula y tomate.', [['i2', 1], ['i8', .02], ['i9', .03], ['i5', .2]], 0],
    ['c2', 'Muzzarella', 10500, 'pizza', 'Cocina', 'Salsa de tomate, muzzarella y orégano.', [['i7', 1], ['i6', .3]], 1],
    ['c2', 'Napolitana', 12000, 'pizza', 'Cocina', 'Muzzarella, tomate en rodajas y ajo.', [['i7', 1], ['i6', .3], ['i9', .1]], 0],
    ['c2', 'Especial', 13500, 'pizza', 'Cocina', 'Muzzarella, jamón, morrones y aceitunas.', [['i7', 1], ['i6', .3]], 0],
    ['c3', 'Papas fritas', 6500, '', 'Cocina', 'Porción grande.', [['i5', .35], ['i12', .03]], 1],
    ['c3', 'Papas cheddar y bacon', 8900, '', 'Cocina', 'Con salsa cheddar y panceta.', [['i5', .35], ['i3', 3], ['i4', .05]], 0],
    ['c3', 'Bastones de muzzarella', 8200, 'dip', 'Cocina', '8 unidades con dip a elección.', [['i6', .2]], 0],
    ['c3', 'Nachos con guacamole', 7900, '', 'Cocina', '', [], 0],
    ['c4', 'Caesar', 9500, '', 'Cocina', 'Lechuga, pollo grillado, croutons, parmesano y aderezo Caesar.', [['i8', .15]], 0],
    ['c4', 'Mixta', 6000, '', 'Cocina', 'Lechuga, tomate y cebolla.', [['i8', .1], ['i9', .1]], 0],
    ['c5', 'Flan con dulce de leche', 4800, '', 'Cocina', '', [], 0],
    ['c5', 'Brownie con helado', 6200, '', 'Cocina', '', [], 0],
    ['c6', 'Gaseosa 500 ml', 3200, '', 'Barra', 'Línea Coca-Cola.', [['i10', 1]], 1],
    ['c6', 'Agua mineral', 2800, '', 'Barra', 'Con o sin gas.', [], 0],
    ['c6', 'Limonada', 4200, '', 'Barra', 'Con menta y jengibre.', [], 0],
    ['c7', 'Pinta rubia', 5200, '', 'Barra', '', [['i11', .5]], 1],
    ['c7', 'Pinta IPA', 5800, '', 'Barra', '', [['i11', .5]], 0],
    ['c7', 'Fernet con Coca', 6500, '', 'Barra', '', [], 0],
    ['c7', 'Gin tonic', 7200, '', 'Barra', '', [], 0]
  ];
  const mods = [
    { id: 'punto', name: 'Punto de la carne', min: 1, max: 1, opts: [['Jugosa', 0], ['A punto', 0], ['Bien cocida', 0]] },
    { id: 'extras', name: 'Extras', min: 0, max: 5, opts: [['Extra cheddar', 1200], ['Extra medallón', 2800], ['Panceta', 1500], ['Huevo frito', 1000], ['Cebolla caramelizada', 1000]] },
    { id: 'guarn', name: 'Guarnición', min: 1, max: 1, opts: [['Papas fritas', 0], ['Ensalada', 0], ['Papas cheddar', 2500]] },
    { id: 'pizza', name: 'Tamaño', min: 1, max: 1, opts: [['Grande (8 porciones)', 0], ['Chica (4 porciones)', -3500]] },
    { id: 'dip', name: 'Dip', min: 1, max: 1, opts: [['Salsa de tomate', 0], ['Barbacoa', 0], ['Alioli', 0]] }
  ];
  return {
    settings: { local: 'La Esquina (demo)', dir: 'Av. Siempreviva 742', tel: '11 5555-0000', color: '#e4572e', zonas: [{ name: 'Salón', mesas: 12 }, { name: 'Patio', mesas: 6 }], repartidores: ['Lucas', 'Martina'],
      tienda: { activa: true, retiro: true, delivery: true, mesa: true, minimo: 8000, mensaje: 'Martes a domingo de 19 a 00 h · Envíos sin cargo en 10 cuadras', alias: 'la.esquina.mp' } },
    cats: cats.map(([id, name], i) => ({ id, name, pos: i })),
    insumos: ins.map(([id, name, unit, costo, stock, min, cat, prov]) => ({ id, name, unit, costo, stock, min, max: min * 3, cat, prov, controlar: true })),
    proveedores: [{ id: 'pv1', name: 'Carnicería Don José', cat: 'Carnes', tel: '11 4000-1111' }, { id: 'pv2', name: 'Panificadora del Sur', cat: 'Panificados', tel: '11 4000-2222' }, { id: 'pv3', name: 'Distribuidora Central', cat: 'Almacén y lácteos', tel: '11 4000-3333' }, { id: 'pv4', name: 'Verdulería La Huerta', cat: 'Verdulería' }, { id: 'pv5', name: 'Bebidas Express', cat: 'Bebidas' }],
    prods: P.map(([cat, name, price, g, station, desc, rec, fav], i) => ({ id: 'p' + (i + 1), cat, name, price, mods: g ? g.split(',') : [], station, desc, receta: rec.map(([ins, qty]) => ({ ins, qty })), active: true, online: true, fav: !!fav, pos: i })),
    mods: mods.map(m => ({ ...m, opts: m.opts.map(([n, p]) => ({ n, p })) })),
    users: [{ id: 'u1', name: 'Dueño', role: 'dueno', pin: '1234', active: true }, { id: 'u2', name: 'Sofía', role: 'mozo', pin: '1111', active: true }, { id: 'u3', name: 'Cocina', role: 'cocina', pin: '2222', active: true }, { id: 'u4', name: 'Tomás', role: 'cajero', pin: '3333', active: true }],
    clientes: [{ id: 'cl1', nombre: 'Carla Gómez', tel: '1155551234', dir: 'Corrientes 1234 3°B', alta: Date.now() }, { id: 'cl2', nombre: 'Juan Pérez', tel: '1155554321', dir: 'Rivadavia 800', nota: 'Celíaco: avisar en cocina', alta: Date.now() }]
  };
};
