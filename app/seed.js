// Plantillas de arranque. Se cargan solo cuando el local está vacío.
window.TEMPLATES = window.TEMPLATES || {};
// Shivo's: carta importada de Fudo (28/10/2026)
// Plano real de Shivo's (importado de Fudo): [mesa, fila, columna, forma 0=cuadrada 1=redonda, tamaño]
const SHIVOS_PLANO = [['ADENTRO', [[1, 0, 0, 0, 'l'], [2, 2, 0, 0, 'l'], [3, 4, 0, 1, 'l'], [4, 0, 2, 1, 'l'], [5, 2, 2, 0, 's'], [6, 4, 2, 0, 's'], [7, 0, 4, 0, 's'], [8, 2, 4, 0, 's'], [19, 4, 4, 0, 'l']]],
  ['AFUERA', [[9, 1, 0, 0, 'l'], [10, 1, 3, 0, 'l'], [11, 1, 6, 0, 'l']]], ['TAKE AWAY', [[12, 0, 1, 1, 's'], [13, 0, 2, 1, 's'], [14, 0, 3, 1, 's'], [15, 1, 0, 1, 's'], [16, 1, 1, 1, 's'], [17, 1, 2, 1, 's'], [18, 1, 3, 1, 's']]]]
  .map(([name, t]) => ({ name, tables: t.map(([n, r, c, sh, size]) => ({ n: String(n), r, c, shape: sh ? 'rd' : 'sq', size })) }));
window.SHIVOS_PLANO = SHIVOS_PLANO;
window.TEMPLATES.shivos = () => {
  const cats = [
    ['hamb', 'Hamburguesas'], ['gold', 'Línea Gold'], ['fuera', 'Fuera de menú'], ['ent', 'Entradas'],
    ['beb', 'Bebidas'], ['cerv', 'Cervezas y tragos'], ['ext', 'Extras'], ['ader', 'Aderezos'],
    ['alm', 'Promo almuerzo'], ['hoy', 'Promoción hoy'], ['pers', 'Comida personal'], ['otros', 'Otros']
  ];
  // [cat, nombre, precio, grupos de opciones, va a cocina (1/0), descripción]
  const B = 'extras,papas,notco';
  const P = [
    ['hamb', 'Beautiful doble', 20000, B, 1, 'Doble carne, cheddar x4'],
    ['hamb', 'Beautiful simple', 18000, B, 1, 'Carne, cheddar x2'],
    ['hamb', 'Mi Caramelo doble', 22000, B, 1, 'Doble carne, cheddar x4, panceta y cebolla caramelizada'],
    ['hamb', 'Mi Caramelo simple', 20000, B, 1, 'Carne, cheddar x2, panceta y cebolla caramelizada'],
    ['hamb', 'Ruleta doble', 21500, B, 1, 'Doble carne, cheddar x4, lechuga, tomate, cebolla, salsa Shivo\'s'],
    ['hamb', 'Ruleta simple', 19500, B, 1, 'Carne, cheddar x2, lechuga, tomate, cebolla, salsa Shivo\'s'],
    ['hamb', 'Signos doble', 24000, B, 1, 'Carne x2, provoleta x2, cebolla caramelizada'],
    ['hamb', 'Signos simple', 22000, B, 1, 'Carne, provoleta, cebolla caramelizada'],
    ['hamb', 'Magia Blanca doble', 22000, B, 1, 'Doble carne, dambo x2, rúcula, tomate, alioli, mermelada de queso azul y hongos'],
    ['hamb', 'Magia Blanca simple', 20000, B, 1, 'Carne, dambo, rúcula, tomate, alioli, mermelada de queso azul y hongos'],
    ['hamb', 'Chipi Chipi doble', 22500, B, 1, 'Doble carne, cheddar x4, panceta, cebolla crispy, salsa Shivo\'s'],
    ['hamb', 'Chipi Chipi simple', 20500, B, 1, 'Carne, cheddar x2, panceta, cebolla crispy, salsa Shivo\'s'],
    ['hamb', 'Par Mil doble', 21000, B, 1, 'Doble carne, doble cheddar, cebolla brunoise, ketchup y mostaza'],
    ['hamb', 'Par Mil simple', 19000, B, 1, 'Carne, cheddar, cebolla brunoise, ketchup y mostaza'],
    ['hamb', 'Vicio', 23000, B, 1, 'Triple carne, triple cheddar, salsa Shivo\'s'],
    ['hamb', 'Shivo\'s Box', 16000, '', 1, 'Pack para cocinar dos hamburguesas en casa'],
    ['gold', 'Say No More doble', 24000, 'extras,notco', 1, 'Doble carne, cheddar x4, lechuga, tomate, salsa SNM. Con boniatos'],
    ['gold', 'Say No More simple', 21000, 'extras,notco', 1, 'Carne, cheddar x2, lechuga, tomate, salsa SNM. Con boniatos'],
    ['gold', 'Crimen', 24000, 'extras', 1, 'Carne 200 g, cheddar x2, cebolla rehogada, maple. Con boniatos'],
    ['gold', 'Gualicho doble', 24000, 'extras,notco', 1, 'Doble carne, doble dambo, lechuga, tomate, cebolla crispy, salsa Gualicho. Con boniatos'],
    ['gold', 'Gualicho simple', 21000, 'extras,notco', 1, 'Con boniatos'],
    ['gold', 'Sanguche milanesa cheddar', 8500, 'mila,conpapas', 1, 'Cheddar y panceta'],
    ['gold', 'Sanguche milanesa completo', 7500, 'mila,conpapas', 1, 'Lechuga, tomate, queso y huevo'],
    ['gold', 'Ensalada Caesar', 12000, '', 1, ''],
    ['gold', 'Nuggets con papas', 12000, '', 1, ''],
    ['fuera', 'Mil Horas doble', 21000, B, 1, 'Doble carne, cheddar x4, panceta y pickles'],
    ['fuera', 'Mil Horas simple', 19000, B, 1, ''],
    ['fuera', 'El Colmo doble', 21000, 'extras,papas', 1, 'NotCo x2, cheddar x4, lechuga, tomate, mayo vegana'],
    ['fuera', 'El Colmo simple', 19000, 'extras,papas', 1, ''],
    ['fuera', 'Mi Semilla doble', 21000, B, 1, 'Doble carne, dambo x2, lechuga, cebolla, pickles'],
    ['fuera', 'Mi Semilla simple', 19000, B, 1, ''],
    ['fuera', 'Dulce Condena doble', 21000, B, 1, 'Doble carne, dambo x2, rúcula, tomate, panceta, picante habanero'],
    ['fuera', 'Dulce Condena simple', 19000, B, 1, ''],
    ['fuera', '\'78', 15000, B, 1, 'Carne, cheddar, ketchup, mostaza, cebolla cruda'],
    ['fuera', '\'86', 15000, B, 1, 'Carne, cheddar, cebolla a la plancha'],
    ['ent', 'Papas noisettes', 8000, '', 1, ''],
    ['ent', 'Papas con cheddar', 9500, '', 1, ''],
    ['ent', 'Papas con cheddar y panceta', 10000, '', 1, ''],
    ['ent', 'Papas Shivo\'s', 11500, '', 1, 'Salsa Shivo\'s y carne picada'],
    ['ent', 'Papas a caballo', 9000, '', 1, ''],
    ['ent', 'Papas Caesar', 11500, '', 1, ''],
    ['ent', 'Papas NotCo', 11500, '', 1, ''],
    ['ent', 'Papas SNM', 12000, '', 1, 'Salsa SNM y panceta'],
    ['ent', 'Boniatos', 10000, '', 1, ''],
    ['ent', 'Nuggets', 11000, '', 1, ''],
    ['ent', 'Aros de cebolla', 11000, '', 1, ''],
    ['ent', 'NotChicken sticks', 11000, '', 1, ''],
    ['ent', 'Ribs de choclo', 7000, '', 1, ''],
    ['ent', 'Pronta entrada', 19500, '', 1, '5 aros, 5 nuggets, 5 NotChicken y papas'],
    ['beb', 'Coca-Cola', 4000, '', 0, ''], ['beb', 'Coca-Cola sin azúcar', 4000, '', 0, ''],
    ['beb', 'Sprite', 4000, '', 0, ''], ['beb', 'Fanta', 4000, '', 0, ''],
    ['beb', 'Agua sin gas', 4000, '', 0, ''], ['beb', 'Agua con gas', 4000, '', 0, ''],
    ['beb', 'Aquarius manzana', 4000, '', 0, ''], ['beb', 'Aquarius pera', 4000, '', 0, ''],
    ['beb', 'Aquarius pomelo', 4000, '', 0, ''],
    ['cerv', 'Blonde', 6000, '', 0, ''], ['cerv', 'American IPA', 6000, '', 0, ''], ['cerv', 'AAA', 6000, '', 0, ''],
    ['cerv', 'Happy hour', 10000, '', 0, ''], ['cerv', 'Fernet con Coca', 6000, '', 0, ''],
    ['ext', 'Extra cheddar', 1500, '', 1, ''], ['ext', 'Extra medallón', 3000, '', 1, ''], ['ext', 'Extra NotCo', 3000, '', 1, ''],
    ['ext', 'Extra panceta', 1500, '', 1, ''], ['ext', 'Extra huevo', 1500, '', 1, ''], ['ext', 'Extra provoleta', 1500, '', 1, ''],
    ['ext', 'Extra dambo', 1500, '', 1, ''], ['ext', 'Extra palta', 1500, '', 1, ''], ['ext', 'Extra pollo', 3000, '', 1, ''],
    ['ext', 'Envío', 1800, '', 0, ''],
    ['ader', 'Salsa Shivo\'s', 500, '', 0, ''], ['ader', 'Salsa SNM', 500, '', 0, ''], ['ader', 'Alioli casero', 500, '', 0, ''],
    ['ader', 'Barbacoa casera', 500, '', 0, ''], ['ader', 'Picante habanero', 500, '', 0, ''], ['ader', 'Condimento de las papas', 500, '', 0, ''],
    ['ader', 'Los 3 aderezos', 500, '', 0, '2 mayonesa, 2 ketchup, 2 mostaza'],
    ['ader', 'Mayonesa', 100, '', 0, ''], ['ader', 'Ketchup', 100, '', 0, ''], ['ader', 'Mostaza', 100, '', 0, ''], ['ader', 'Sal', 100, '', 0, ''],
    ['alm', 'Nuggets + papas', 10000, '', 1, '5 nuggets y media porción de papas'],
    ['alm', 'Sándwich completo', 6000, 'mila', 1, ''], ['alm', 'Sándwich cheddar', 7000, 'mila', 1, ''],
    ['alm', 'S. x2 mila cheddar c/papas', 14000, 'mila', 1, ''], ['alm', 'Promo escolar', 12000, '', 1, ''],
    ['alm', 'Almuerzo promo', 16000, '', 1, ''], ['alm', 'Ensalada Caesar almuerzo', 10000, '', 1, ''],
    ['hoy', 'Mi Semilla doble + bebida', 19900, '', 1, ''], ['hoy', 'Magia Blanca doble + bebida', 19800, '', 1, ''],
    ['hoy', '4x3 hamburguesas', 70000, '', 1, '4 dobles a elección con papas'], ['hoy', 'Beautiful sin papas', 11000, '', 1, ''],
    ['pers', 'Tostado cheddar', 0, '', 1, ''], ['pers', 'Tostado provoleta', 0, '', 1, ''], ['pers', 'Tostado dambo', 0, '', 1, ''],
    ['pers', 'Sanguche mila personal', 0, 'mila', 1, ''], ['pers', 'Ensalada personal', 0, '', 1, ''],
    ['otros', 'Producto genérico', 0, '', 1, 'Escribí el nombre en la aclaración']
  ];
  const mods = [
    { id: 'extras', name: 'Extras', min: 0, max: 9, opts: [['Extra cheddar', 1500], ['Extra medallón', 3000], ['Extra panceta', 1500], ['Extra huevo', 1500], ['Extra provoleta', 1500], ['Extra dambo', 1500], ['Extra pickles', 1500], ['Extra cebolla caramelizada', 1500], ['Extra cebolla crispy', 1500], ['Extra palta', 1500], ['Extra lechuga', 1500], ['Extra tomate', 1500], ['Extra rúcula', 1500]] },
    { id: 'papas', name: 'Reemplazar papas por', min: 0, max: 1, opts: [['Papas Shivo\'s', 3000], ['Papas con cheddar', 3000], ['Papas cheddar y panceta', 3000], ['Papas NotCo', 3000], ['Papas Caesar', 3000], ['Boniatos', 3000], ['6 nuggets', 3000], ['6 aros de cebolla', 3000], ['6 NotChicken', 3000]] },
    { id: 'notco', name: 'Medallón', min: 0, max: 1, opts: [['Reemplazar por NotCo', 1000]] },
    { id: 'mila', name: 'Milanesa', min: 1, max: 1, opts: [['Carne', 0], ['Pollo', 0]] },
    { id: 'conpapas', name: 'Acompañamiento', min: 0, max: 1, opts: [['Con papas', 5000]] }
  ];
  return {
    cats: cats.map(([id, name], i) => ({ id, name, pos: i })),
    prods: P.map(([cat, name, price, g, k, desc], i) => ({ id: 'p' + (i + 1), cat, name, price, mods: g ? g.split(',') : [], station: k ? 'Cocina' : 'Barra', desc, active: true, online: !['pers', 'otros', 'ext'].includes(cat), fav: i < 6, libre: name === 'Producto genérico', pos: i })),
    mods: mods.map(m => ({ ...m, opts: m.opts.map(([n, p]) => ({ n, p })) })),
    users: [{ id: 'u1', name: 'Ivan', role: 'dueno', pin: '1234', active: true }],
    settings: {
      local: "Shivo's", dir: 'Tinogasta 3239, Villa del Parque', tel: '11 3045-5484', pie: 'No somos los mejores. Decidimos ser únicos.', color: '#f1bb00', estaciones: ['Cocina', 'Barra'],
      zonas: SHIVOS_PLANO,
      medios: ['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'QR Mercado Pago', 'Online PedidosYa', 'Online Rappi', 'Efectivo PedidosYa', 'Cuenta corriente'],
      canales: ['Mostrador', 'Teléfono/WhatsApp', 'PedidosYa', 'Rappi'], repartidores: ['Repartidor 1']
    }
  };
};
