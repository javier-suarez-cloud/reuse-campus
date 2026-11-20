// Issue 6: aceptar y rechazar solicitudes con transacción (RN07 a RN11, RN12)
const { check, http, conectarDb, usuario, crearPublicacion, terminar } = require('./lib');

(async () => {
  const db = conectarDb();
  const ana = await usuario('Ana', 'ana@test.cl');
  const beto = await usuario('Beto', 'beto@test.cl');
  const carla = await usuario('Carla', 'carla@test.cl');
  const diego = await usuario('Diego', 'diego@test.cl');
  await usuario('Eva', 'eva@test.cl');
  await db.q("UPDATE usuarios SET rol = 'ADMINISTRADOR' WHERE correo = 'eva@test.cl'");
  const eva = (await http('POST', '/auth/login', { correo: 'eva@test.cl', password: '123456' })).data;

  const pedir = async (token, idPub) => (await http('POST', '/solicitudes', { publicacion_id: idPub }, token)).data.id;
  const estadoSol = async (id) => (await db.q('SELECT estado FROM solicitudes WHERE id = ?', [id]))[0].estado;
  const estadoPub = async (id) => (await db.q('SELECT estado FROM publicaciones WHERE id = ?', [id]))[0].estado;

  const idPub = await crearPublicacion(ana.token, 'Calculadora');
  const sBeto = await pedir(beto.token, idPub);
  const sCarla = await pedir(carla.token, idPub);
  const sDiego = await pedir(diego.token, idPub);

  // ---- Validaciones y permisos (RN07, RN18)
  let r = await http('PATCH', `/solicitudes/${sBeto}/aceptar`);
  check('aceptar sin sesión -> 401', r.status === 401, JSON.stringify(r));
  r = await http('PATCH', '/solicitudes/abc/aceptar', null, ana.token);
  check('aceptar con id inválido -> 400', r.status === 400, JSON.stringify(r));
  r = await http('PATCH', '/solicitudes/9999/aceptar', null, ana.token);
  check('aceptar inexistente -> 404', r.status === 404, JSON.stringify(r));

  r = await http('PATCH', `/solicitudes/${sBeto}/aceptar`, null, beto.token);
  check('RN07: el propio solicitante no puede aceptar su solicitud -> 403', r.status === 403, JSON.stringify(r));
  r = await http('PATCH', `/solicitudes/${sDiego}/aceptar`, null, carla.token);
  check('RN07: otro usuario no puede aceptar -> 403', r.status === 403, JSON.stringify(r));
  r = await http('PATCH', `/solicitudes/${sBeto}/aceptar`, null, eva.token);
  check('RN07: ni un administrador puede aceptar solicitudes ajenas -> 403', r.status === 403, JSON.stringify(r));
  r = await http('PATCH', `/solicitudes/${sBeto}/rechazar`, null, beto.token);
  check('RN07: el solicitante no puede rechazar -> 403', r.status === 403, JSON.stringify(r));
  r = await http('PATCH', `/solicitudes/${sBeto}/rechazar`, null, eva.token);
  check('RN07: un administrador no puede rechazar solicitudes ajenas -> 403', r.status === 403, JSON.stringify(r));
  check('tras los intentos no autorizados nada cambió (PENDIENTE y DISPONIBLE)', (await estadoSol(sBeto)) === 'PENDIENTE' && (await estadoPub(idPub)) === 'DISPONIBLE');

  // ---- Rechazar
  r = await http('PATCH', `/solicitudes/${sDiego}/rechazar`, null, ana.token);
  check('el propietario rechaza una PENDIENTE -> 200', r.status === 200, JSON.stringify(r));
  check('la solicitud queda RECHAZADA (y no se borra)', (await estadoSol(sDiego)) === 'RECHAZADA');
  r = await http('PATCH', `/solicitudes/${sDiego}/rechazar`, null, ana.token);
  check('rechazar una ya RECHAZADA -> 409', r.status === 409, JSON.stringify(r));
  r = await http('PATCH', `/solicitudes/${sDiego}/aceptar`, null, ana.token);
  check('aceptar una RECHAZADA -> 409', r.status === 409, JSON.stringify(r));
  check('rechazar no cambia la publicación (sigue DISPONIBLE)', (await estadoPub(idPub)) === 'DISPONIBLE');

  // ---- Aceptar: RN08, RN09, RN10, RN11
  r = await http('PATCH', `/solicitudes/${sBeto}/aceptar`, null, ana.token);
  check('el propietario acepta la solicitud de Beto -> 200 con entrega_id', r.status === 200 && Number.isInteger(r.data.entrega_id), JSON.stringify(r));
  const idEntrega = r.data.entrega_id;
  check('la solicitud de Beto queda ACEPTADA', (await estadoSol(sBeto)) === 'ACEPTADA');
  check('RN09: la publicación pasa de DISPONIBLE a RESERVADA', (await estadoPub(idPub)) === 'RESERVADA');
  check('RN10: la otra PENDIENTE (Carla) pasa a RECHAZADA', (await estadoSol(sCarla)) === 'RECHAZADA');
  check('la ya RECHAZADA (Diego) sigue RECHAZADA', (await estadoSol(sDiego)) === 'RECHAZADA');
  const aceptadas = (await db.q("SELECT COUNT(*) AS n FROM solicitudes WHERE publicacion_id = ? AND estado = 'ACEPTADA'", [idPub]))[0].n;
  check('RN08: hay exactamente 1 solicitud ACEPTADA en la publicación', aceptadas === 1, 'aceptadas: ' + aceptadas);
  const entregas = await db.q('SELECT * FROM entregas WHERE publicacion_id = ?', [idPub]);
  check('RN11: se creó exactamente 1 entrega', entregas.length === 1, JSON.stringify(entregas));
  const e = entregas[0] || {};
  check('RN11: la entrega nace PENDIENTE, sin fecha de entrega', e.estado === 'PENDIENTE' && e.fecha_entrega === null, JSON.stringify(e));
  check('la entrega une a Ana (propietaria) con Beto (receptor) y la solicitud aceptada',
    e.propietario_id === ana.usuario.id && e.receptor_id === beto.usuario.id && e.solicitud_id === sBeto && e.id === idEntrega, JSON.stringify(e));

  // ---- Después de aceptar
  r = await http('PATCH', `/solicitudes/${sBeto}/aceptar`, null, ana.token);
  check('aceptar de nuevo la misma -> 409', r.status === 409, JSON.stringify(r));
  r = await http('PATCH', `/solicitudes/${sCarla}/aceptar`, null, ana.token);
  check('aceptar otra solicitud de la misma publicación -> 409', r.status === 409, JSON.stringify(r));
  r = await http('PATCH', `/solicitudes/${sBeto}/rechazar`, null, ana.token);
  check('rechazar una ACEPTADA -> 409', r.status === 409, JSON.stringify(r));
  r = await http('PATCH', `/solicitudes/${sBeto}/cancelar`, null, beto.token);
  check('RN16: Beto no puede cancelar su solicitud ya ACEPTADA -> 409', r.status === 409, JSON.stringify(r));
  r = await http('POST', '/solicitudes', { publicacion_id: idPub }, diego.token);
  check('RN12: una publicación RESERVADA no recibe nuevas solicitudes -> 409', r.status === 409, JSON.stringify(r));

  // ---- Concurrencia: 3 solicitudes de la misma publicación aceptadas a la vez (RN08)
  const idQ = await crearPublicacion(ana.token, 'Concurrencia');
  const q1 = await pedir(beto.token, idQ);
  const q2 = await pedir(carla.token, idQ);
  const q3 = await pedir(diego.token, idQ);
  const res = await Promise.all([q1, q2, q3].map((s) => http('PATCH', `/solicitudes/${s}/aceptar`, null, ana.token)));
  const ok = res.filter((x) => x.status === 200).length;
  const conflicto = res.filter((x) => x.status === 409).length;
  check('3 aceptaciones simultáneas: exactamente 1 con 200 y 2 con 409', ok === 1 && conflicto === 2, JSON.stringify(res.map((x) => x.status)));
  const estados = (await db.q('SELECT estado FROM solicitudes WHERE publicacion_id = ?', [idQ])).map((x) => x.estado).sort();
  check('RN08: en la base queda 1 ACEPTADA y 2 RECHAZADAS', JSON.stringify(estados) === JSON.stringify(['ACEPTADA', 'RECHAZADA', 'RECHAZADA']), JSON.stringify(estados));
  const entregasQ = (await db.q('SELECT COUNT(*) AS n FROM entregas WHERE publicacion_id = ?', [idQ]))[0].n;
  check('solo se creó 1 entrega para esa publicación', entregasQ === 1, 'entregas: ' + entregasQ);
  check('la publicación quedó RESERVADA', (await estadoPub(idQ)) === 'RESERVADA');

  // ---- La transacción: si el último paso falla, se deshace todo (rollback)
  const idR = await crearPublicacion(ana.token, 'Rollback');
  const rBeto = await pedir(beto.token, idR);
  const rCarla = await pedir(carla.token, idR);
  // Se fuerza el fallo: ya existe una entrega con esa solicitud (solicitud_id es UNIQUE)
  await db.q('INSERT INTO entregas (publicacion_id, solicitud_id, propietario_id, receptor_id) VALUES (?, ?, ?, ?)', [idR, rBeto, ana.usuario.id, beto.usuario.id]);
  r = await http('PATCH', `/solicitudes/${rBeto}/aceptar`, null, ana.token);
  check('si falla el INSERT de la entrega -> 500', r.status === 500, JSON.stringify(r));
  check('ROLLBACK: la solicitud de Beto sigue PENDIENTE', (await estadoSol(rBeto)) === 'PENDIENTE');
  check('ROLLBACK: la publicación sigue DISPONIBLE', (await estadoPub(idR)) === 'DISPONIBLE');
  check('ROLLBACK: la solicitud de Carla sigue PENDIENTE (no se rechazó)', (await estadoSol(rCarla)) === 'PENDIENTE');
  await db.q('DELETE FROM entregas WHERE solicitud_id = ?', [rBeto]);
  r = await http('PATCH', `/solicitudes/${rBeto}/aceptar`, null, ana.token);
  check('quitado el obstáculo, aceptar funciona -> 200 (el fallo no dejó datos a medias)', r.status === 200, JSON.stringify(r));
  check('y ahora sí: publicación RESERVADA y Carla RECHAZADA', (await estadoPub(idR)) === 'RESERVADA' && (await estadoSol(rCarla)) === 'RECHAZADA');

  // ---- Publicaciones que no están DISPONIBLES
  const idC = await crearPublicacion(ana.token, 'Cancelada despues');
  const cBeto = await pedir(beto.token, idC);
  await db.q("UPDATE publicaciones SET estado = 'CANCELADA' WHERE id = ?", [idC]);
  r = await http('PATCH', `/solicitudes/${cBeto}/aceptar`, null, ana.token);
  check('aceptar una solicitud de una publicación CANCELADA -> 409', r.status === 409, JSON.stringify(r));
  check('la publicación sigue CANCELADA (no se reservó)', (await estadoPub(idC)) === 'CANCELADA');
  r = await http('PATCH', `/solicitudes/${cBeto}/rechazar`, null, ana.token);
  check('en cambio, rechazarla sí se puede (limpieza) -> 200', r.status === 200, JSON.stringify(r));

  db.end();
  terminar();
})().catch((e) => { console.error('ERROR en la prueba:', e); process.exit(1); });
