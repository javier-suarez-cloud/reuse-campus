// Issue 4: publicaciones. Listado y filtros, detalle, crear, editar y cancelar (RN01, RN02, RN17, RN18)
const { check, http, conectarDb, usuario, crearPublicacion, terminar } = require('./lib');

(async () => {
  const db = conectarDb();
  const ana = await usuario('Ana', 'ana@test.cl');
  const beto = await usuario('Beto', 'beto@test.cl');
  const ingresar = async (correo) => (await http('POST', '/auth/login', { correo, password: '123456' })).data;

  // =============== LISTADO, DETALLE Y FILTROS ===============
  let r = await http('GET', '/publicaciones');
  check('GET sin token -> 401', r.status === 401, JSON.stringify(r));
  r = await http('GET', '/publicaciones', null, ana.token);
  check('GET listado vacío -> 200 y []', r.status === 200 && Array.isArray(r.data) && r.data.length === 0, JSON.stringify(r));

  await db.q("INSERT INTO publicaciones (titulo,descripcion,categoria,modalidad,usuario_id) VALUES ('Libro A','desc','Libros','DONACION',?)", [ana.usuario.id]);
  await db.q("INSERT INTO publicaciones (titulo,descripcion,categoria,modalidad,usuario_id) VALUES ('Calculadora','desc','Tecnologia','INTERCAMBIO',?)", [beto.usuario.id]);
  await db.q("INSERT INTO publicaciones (titulo,descripcion,categoria,modalidad,estado,usuario_id) VALUES ('Vieja','desc','Libros','DONACION','CANCELADA',?)", [ana.usuario.id]);

  r = await http('GET', '/publicaciones', null, ana.token);
  check('el listado oculta las CANCELADAS (2 de 3)', r.status === 200 && r.data.length === 2, JSON.stringify(r.data));
  check('el listado trae el nombre del propietario (JOIN)', r.data.every((p) => typeof p.propietario === 'string'), JSON.stringify(r.data[0]));
  r = await http('GET', '/publicaciones?estado=CANCELADA', null, ana.token);
  check('?estado=CANCELADA muestra solo la cancelada', r.status === 200 && r.data.length === 1 && r.data[0].titulo === 'Vieja', JSON.stringify(r.data));
  r = await http('GET', '/publicaciones?modalidad=INTERCAMBIO', null, ana.token);
  check('?modalidad=INTERCAMBIO filtra (1)', r.status === 200 && r.data.length === 1 && r.data[0].titulo === 'Calculadora', JSON.stringify(r.data));
  r = await http('GET', '/publicaciones?categoria=Libros&modalidad=DONACION', null, ana.token);
  check('filtros combinados (1)', r.status === 200 && r.data.length === 1 && r.data[0].titulo === 'Libro A', JSON.stringify(r.data));
  r = await http('GET', '/publicaciones/mias', null, ana.token);
  check('GET /mias devuelve solo las de Ana (2, incluye la cancelada)', r.status === 200 && r.data.length === 2 && r.data.every((p) => p.usuario_id === ana.usuario.id), JSON.stringify(r.data));
  r = await http('GET', '/publicaciones?propias=1', null, beto.token);
  check('?propias=1 de Beto devuelve solo las de Beto', r.status === 200 && r.data.length === 1 && r.data.every((p) => p.usuario_id === beto.usuario.id), JSON.stringify(r.data));
  r = await http('GET', '/publicaciones?estado=INVENTADO', null, ana.token);
  check('?estado inválido -> 400', r.status === 400, JSON.stringify(r));
  r = await http('GET', '/publicaciones?modalidad=VENTA', null, ana.token);
  check('?modalidad inválida -> 400', r.status === 400, JSON.stringify(r));

  const idCalc = (await db.q("SELECT id FROM publicaciones WHERE titulo='Calculadora'"))[0].id;
  r = await http('GET', '/publicaciones/' + idCalc, null, ana.token);
  check('GET /:id existente -> 200 con propietario Beto', r.status === 200 && r.data.propietario === 'Beto', JSON.stringify(r));
  r = await http('GET', '/publicaciones/9999', null, ana.token);
  check('GET /:id inexistente -> 404', r.status === 404, JSON.stringify(r));
  r = await http('GET', '/publicaciones/abc', null, ana.token);
  check('GET /:id inválido -> 400', r.status === 400, JSON.stringify(r));

  // =============== CREAR (RN01, RN02) ===============
  const valida = { titulo: 'Cuaderno', descripcion: 'Casi nuevo', categoria: 'Papeleria', modalidad: 'DONACION' };
  r = await http('POST', '/publicaciones', valida);
  check('RN01: POST sin sesión -> 401', r.status === 401, JSON.stringify(r));
  r = await http('POST', '/publicaciones', {}, ana.token);
  check('POST sin datos -> 400', r.status === 400, JSON.stringify(r));
  r = await http('POST', '/publicaciones', { ...valida, modalidad: 'VENTA' }, ana.token);
  check('POST con modalidad inválida -> 400', r.status === 400, JSON.stringify(r));
  r = await http('POST', '/publicaciones', { ...valida, titulo: 'x'.repeat(151) }, ana.token);
  check('POST con título de 151 caracteres -> 400', r.status === 400, JSON.stringify(r));
  r = await http('POST', '/publicaciones', { ...valida, titulo: '   ' }, ana.token);
  check('POST con título solo espacios -> 400', r.status === 400, JSON.stringify(r));
  r = await http('POST', '/publicaciones', { ...valida, usuario_id: beto.usuario.id, estado: 'ENTREGADA' }, ana.token);
  check('POST válido -> 201 con id', r.status === 201 && Number.isInteger(r.data.id), JSON.stringify(r));
  const id = r.data.id;
  const fila = (await db.q('SELECT * FROM publicaciones WHERE id = ?', [id]))[0];
  check('RN02: el propietario es Ana (aunque se envió usuario_id de Beto)', fila.usuario_id === ana.usuario.id, JSON.stringify(fila));
  check('la publicación nace DISPONIBLE (se ignoró estado ENTREGADA)', fila.estado === 'DISPONIBLE', JSON.stringify(fila));
  check('el título se guarda sin espacios sobrantes', fila.titulo === 'Cuaderno');

  // =============== EDITAR ===============
  const nueva = { titulo: 'Cuaderno A4', descripcion: 'Usado', categoria: 'Papeleria', modalidad: 'INTERCAMBIO' };
  r = await http('PUT', '/publicaciones/' + id, nueva);
  check('PUT sin sesión -> 401', r.status === 401, JSON.stringify(r));
  r = await http('PUT', '/publicaciones/' + id, nueva, beto.token);
  check('RN18: PUT de otro usuario -> 403', r.status === 403, JSON.stringify(r));
  r = await http('PUT', '/publicaciones/9999', nueva, ana.token);
  check('PUT inexistente -> 404', r.status === 404, JSON.stringify(r));
  r = await http('PUT', '/publicaciones/abc', nueva, ana.token);
  check('PUT con id inválido -> 400', r.status === 400, JSON.stringify(r));
  r = await http('PUT', '/publicaciones/' + id, { ...nueva, modalidad: '' }, ana.token);
  check('PUT con datos incompletos -> 400', r.status === 400, JSON.stringify(r));
  r = await http('PUT', '/publicaciones/' + id, nueva, ana.token);
  check('PUT del propietario -> 200', r.status === 200, JSON.stringify(r));
  const editada = (await db.q('SELECT * FROM publicaciones WHERE id = ?', [id]))[0];
  check('PUT cambió los datos en MySQL', editada.titulo === 'Cuaderno A4' && editada.modalidad === 'INTERCAMBIO', JSON.stringify(editada));

  // =============== ESTADOS QUE NO PERMITEN EDITAR NI CANCELAR ===============
  const idReservada = await crearPublicacion(ana.token, 'Reservada');
  await db.q("UPDATE publicaciones SET estado = 'RESERVADA' WHERE id = ?", [idReservada]);
  r = await http('PUT', '/publicaciones/' + idReservada, nueva, ana.token);
  check('PUT de una RESERVADA -> 409', r.status === 409, JSON.stringify(r));
  r = await http('PATCH', '/publicaciones/' + idReservada + '/cancelar', null, ana.token);
  check('cancelar una RESERVADA -> 409', r.status === 409, JSON.stringify(r));
  const idEntregada = await crearPublicacion(ana.token, 'Entregada');
  await db.q("UPDATE publicaciones SET estado = 'ENTREGADA' WHERE id = ?", [idEntregada]);
  r = await http('PATCH', '/publicaciones/' + idEntregada + '/cancelar', null, ana.token);
  check('cancelar una ENTREGADA -> 409', r.status === 409, JSON.stringify(r));

  // =============== CANCELAR (RN17) ===============
  r = await http('PATCH', '/publicaciones/' + id + '/cancelar');
  check('cancelar sin sesión -> 401', r.status === 401, JSON.stringify(r));
  r = await http('PATCH', '/publicaciones/' + id + '/cancelar', null, beto.token);
  check('RN18: cancelar la de otro usuario -> 403', r.status === 403, JSON.stringify(r));
  r = await http('PATCH', '/publicaciones/9999/cancelar', null, ana.token);
  check('cancelar inexistente -> 404', r.status === 404, JSON.stringify(r));
  r = await http('PATCH', '/publicaciones/' + id + '/cancelar', null, ana.token);
  check('cancelar la propia DISPONIBLE -> 200', r.status === 200, JSON.stringify(r));
  const cancelada = (await db.q('SELECT estado FROM publicaciones WHERE id = ?', [id]))[0];
  check('RN17: sigue existiendo y su estado es CANCELADA (no se borró)', cancelada && cancelada.estado === 'CANCELADA', JSON.stringify(cancelada));
  r = await http('PATCH', '/publicaciones/' + id + '/cancelar', null, ana.token);
  check('cancelar de nuevo una CANCELADA -> 409', r.status === 409, JSON.stringify(r));
  r = await http('PUT', '/publicaciones/' + id, nueva, ana.token);
  check('editar una CANCELADA -> 409', r.status === 409, JSON.stringify(r));
  r = await http('GET', '/publicaciones', null, ana.token);
  check('la cancelada ya no aparece en el listado', r.status === 200 && !r.data.some((p) => p.id === id), JSON.stringify(r.data.map((p) => p.id)));

  // =============== ADMINISTRADOR ===============
  await db.q("UPDATE usuarios SET rol = 'ADMINISTRADOR' WHERE correo = 'beto@test.cl'");
  const betoAdmin = await ingresar('beto@test.cl');
  const otra = await crearPublicacion(ana.token, 'Para moderar');
  r = await http('PATCH', '/publicaciones/' + otra + '/cancelar', null, betoAdmin.token);
  check('un ADMINISTRADOR puede cancelar la publicación de otro -> 200', r.status === 200, JSON.stringify(r));

  db.end();
  terminar();
})().catch((e) => { console.error('ERROR en la prueba:', e); process.exit(1); });
