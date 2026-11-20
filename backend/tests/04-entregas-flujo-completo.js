// Issue 7: confirmar la entrega y cierre de la publicación (RN13, RN14, RN15, RN17) + flujo completo del enunciado
const { check, http, conectarDb, usuario, crearPublicacion, terminar } = require('./lib');

(async () => {
  const db = conectarDb();
  const ana = await usuario('Ana', 'ana@test.cl');
  const beto = await usuario('Beto', 'beto@test.cl');
  const carla = await usuario('Carla', 'carla@test.cl');
  await usuario('Eva', 'eva@test.cl');
  await db.q("UPDATE usuarios SET rol = 'ADMINISTRADOR' WHERE correo = 'eva@test.cl'");
  const eva = (await http('POST', '/auth/login', { correo: 'eva@test.cl', password: '123456' })).data;

  const estadoPub = async (id) => (await db.q('SELECT estado FROM publicaciones WHERE id = ?', [id]))[0].estado;
  const estadoSol = async (id) => (await db.q('SELECT estado FROM solicitudes WHERE id = ?', [id]))[0].estado;
  const entrega = async (id) => (await db.q('SELECT * FROM entregas WHERE id = ?', [id]))[0];

  // ===== FLUJO COMPLETO del enunciado (sección 7) =====
  const idPub = await crearPublicacion(ana.token, 'Calculadora');
  check('1. Ana publica un artículo: nace DISPONIBLE', (await estadoPub(idPub)) === 'DISPONIBLE');
  const sBeto = (await http('POST', '/solicitudes', { publicacion_id: idPub, mensaje: 'La necesito' }, beto.token)).data.id;
  const sCarla = (await http('POST', '/solicitudes', { publicacion_id: idPub }, carla.token)).data.id;
  check('2. dos usuarios distintos hacen solicitudes (ambas PENDIENTES)', (await estadoSol(sBeto)) === 'PENDIENTE' && (await estadoSol(sCarla)) === 'PENDIENTE');

  let r = await http('PATCH', `/solicitudes/${sBeto}/aceptar`, null, ana.token);
  check('3. el propietario acepta una de ellas', r.status === 200, JSON.stringify(r));
  const idEntrega = r.data.entrega_id;
  check('4. la publicación queda RESERVADA', (await estadoPub(idPub)) === 'RESERVADA');
  check('5. la otra solicitud pendiente queda RECHAZADA', (await estadoSol(sCarla)) === 'RECHAZADA');
  check('6. se genera una Entrega/Intercambio PENDIENTE', (await entrega(idEntrega)).estado === 'PENDIENTE');

  // ---- Listado de entregas
  r = await http('GET', '/entregas/mias', null, ana.token);
  check('GET /mias de Ana: 1 entrega como PROPIETARIO, con título y nombres', r.status === 200 && r.data.length === 1 && r.data[0].mi_rol === 'PROPIETARIO' && r.data[0].publicacion_titulo === 'Calculadora' && r.data[0].propietario === 'Ana' && r.data[0].receptor === 'Beto', JSON.stringify(r.data));
  r = await http('GET', '/entregas/mias', null, beto.token);
  check('GET /mias de Beto: 1 entrega como RECEPTOR', r.status === 200 && r.data.length === 1 && r.data[0].mi_rol === 'RECEPTOR', JSON.stringify(r.data));
  r = await http('GET', '/entregas/mias', null, carla.token);
  check('GET /mias de Carla (rechazada): ninguna', r.status === 200 && r.data.length === 0, JSON.stringify(r.data));
  r = await http('GET', '/entregas/mias');
  check('GET /mias sin sesión -> 401', r.status === 401, JSON.stringify(r));

  // ---- Permisos y validaciones al confirmar
  r = await http('PATCH', `/entregas/${idEntrega}/confirmar`);
  check('confirmar sin sesión -> 401', r.status === 401, JSON.stringify(r));
  r = await http('PATCH', '/entregas/abc/confirmar', null, ana.token);
  check('confirmar con id inválido -> 400', r.status === 400, JSON.stringify(r));
  r = await http('PATCH', '/entregas/9999/confirmar', null, ana.token);
  check('confirmar una entrega inexistente -> 404', r.status === 404, JSON.stringify(r));
  r = await http('PATCH', `/entregas/${idEntrega}/confirmar`, null, carla.token);
  check('RN18: quien no participa no puede confirmar -> 403', r.status === 403, JSON.stringify(r));
  r = await http('PATCH', `/entregas/${idEntrega}/confirmar`, null, eva.token);
  check('RN18: un administrador ajeno a la entrega tampoco -> 403', r.status === 403, JSON.stringify(r));
  check('tras los intentos no autorizados todo sigue igual (entrega PENDIENTE, publicación RESERVADA)', (await entrega(idEntrega)).estado === 'PENDIENTE' && (await estadoPub(idPub)) === 'RESERVADA');

  // ---- Confirmar (RN14) con el receptor
  r = await http('PATCH', `/entregas/${idEntrega}/confirmar`, null, beto.token);
  check('7. el receptor confirma la entrega -> 200', r.status === 200, JSON.stringify(r));
  const e = await entrega(idEntrega);
  check('7. la entrega queda COMPLETADA con fecha de entrega registrada', e.estado === 'COMPLETADA' && e.fecha_entrega !== null, JSON.stringify(e));
  check('RN14: la publicación pasa automáticamente a ENTREGADA', (await estadoPub(idPub)) === 'ENTREGADA');

  // ---- Después de entregada
  r = await http('PATCH', `/entregas/${idEntrega}/confirmar`, null, ana.token);
  check('confirmar de nuevo una ya COMPLETADA -> 409', r.status === 409, JSON.stringify(r));
  r = await http('POST', '/solicitudes', { publicacion_id: idPub }, carla.token);
  check('RN15: una publicación ENTREGADA no recibe solicitudes -> 409', r.status === 409, JSON.stringify(r));
  r = await http('PATCH', `/publicaciones/${idPub}/cancelar`, null, ana.token);
  check('una publicación ENTREGADA no se puede cancelar -> 409', r.status === 409, JSON.stringify(r));
  r = await http('PUT', `/publicaciones/${idPub}`, { titulo: 'x', descripcion: 'x', categoria: 'x', modalidad: 'DONACION' }, ana.token);
  check('una publicación ENTREGADA no se puede editar -> 409', r.status === 409, JSON.stringify(r));

  // ---- RN17: historial intacto
  r = await http('DELETE', `/solicitudes/${sBeto}`, null, ana.token);
  check('RN17: no existe DELETE de solicitudes -> 404', r.status === 404, JSON.stringify(r));
  r = await http('DELETE', `/entregas/${idEntrega}`, null, ana.token);
  check('RN17: no existe DELETE de entregas -> 404', r.status === 404, JSON.stringify(r));
  r = await http('DELETE', `/publicaciones/${idPub}`, null, ana.token);
  check('RN17: no existe DELETE de publicaciones -> 404', r.status === 404, JSON.stringify(r));
  const n = (await db.q('SELECT (SELECT COUNT(*) FROM solicitudes WHERE publicacion_id = ?) AS s, (SELECT COUNT(*) FROM entregas WHERE publicacion_id = ?) AS e', [idPub, idPub]))[0];
  check('RN17: el historial completo sigue en la base (2 solicitudes y 1 entrega)', n.s === 2 && n.e === 1, JSON.stringify(n));

  // ---- El propietario también puede confirmar
  const idP2 = await crearPublicacion(ana.token, 'Segunda');
  const s2 = (await http('POST', '/solicitudes', { publicacion_id: idP2 }, carla.token)).data.id;
  const ent2 = (await http('PATCH', `/solicitudes/${s2}/aceptar`, null, ana.token)).data.entrega_id;
  r = await http('PATCH', `/entregas/${ent2}/confirmar`, null, ana.token);
  check('el propietario también puede confirmar la entrega -> 200', r.status === 200 && (await estadoPub(idP2)) === 'ENTREGADA', JSON.stringify(r));

  // ---- RN13: DISPONIBLE nunca pasa directo a ENTREGADA
  const idP3 = await crearPublicacion(ana.token, 'Tercera');
  r = await http('PUT', `/publicaciones/${idP3}`, { titulo: 'Tercera', descripcion: 'x', categoria: 'x', modalidad: 'DONACION', estado: 'ENTREGADA' }, ana.token);
  check('RN13: enviar estado ENTREGADA al editar se ignora (sigue DISPONIBLE)', r.status === 200 && (await estadoPub(idP3)) === 'DISPONIBLE', JSON.stringify(r));
  // Entrega "huérfana" forzada en la base: su publicación está DISPONIBLE, no RESERVADA
  const s3 = (await http('POST', '/solicitudes', { publicacion_id: idP3 }, beto.token)).data.id;
  const huerfana = (await db.q('INSERT INTO entregas (publicacion_id, solicitud_id, propietario_id, receptor_id) VALUES (?, ?, ?, ?)', [idP3, s3, ana.usuario.id, beto.usuario.id])).insertId;
  r = await http('PATCH', `/entregas/${huerfana}/confirmar`, null, ana.token);
  check('RN13: confirmar una entrega cuya publicación sigue DISPONIBLE -> 409', r.status === 409, JSON.stringify(r));
  check('RN13: nada cambió (entrega PENDIENTE y publicación DISPONIBLE)', (await entrega(huerfana)).estado === 'PENDIENTE' && (await estadoPub(idP3)) === 'DISPONIBLE');

  // ---- Concurrencia: dos confirmaciones simultáneas
  const idP4 = await crearPublicacion(ana.token, 'Cuarta');
  const s4 = (await http('POST', '/solicitudes', { publicacion_id: idP4 }, beto.token)).data.id;
  const ent4 = (await http('PATCH', `/solicitudes/${s4}/aceptar`, null, ana.token)).data.entrega_id;
  const dobles = await Promise.all([
    http('PATCH', `/entregas/${ent4}/confirmar`, null, ana.token),
    http('PATCH', `/entregas/${ent4}/confirmar`, null, beto.token),
  ]);
  const codigos = dobles.map((x) => x.status).sort();
  check('2 confirmaciones simultáneas: una con 200 y otra con 409', JSON.stringify(codigos) === JSON.stringify([200, 409]), JSON.stringify(codigos));
  check('resultado consistente: entrega COMPLETADA y publicación ENTREGADA', (await entrega(ent4)).estado === 'COMPLETADA' && (await estadoPub(idP4)) === 'ENTREGADA');

  db.end();
  terminar();
})().catch((e) => { console.error('ERROR en la prueba:', e); process.exit(1); });
