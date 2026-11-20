// Issue 5: crear y cancelar solicitudes (RN03, RN04, RN05, RN06, RN12, RN15, RN16)
const { check, http, conectarDb, usuario, crearPublicacion, terminar } = require('./lib');

(async () => {
  const db = conectarDb();
  const ana = await usuario('Ana', 'ana@test.cl');
  const beto = await usuario('Beto', 'beto@test.cl');
  const carla = await usuario('Carla', 'carla@test.cl');
  const idPub = await crearPublicacion(ana.token, 'Calculadora');

  // ---- Validaciones básicas
  let r = await http('POST', '/solicitudes', { publicacion_id: idPub });
  check('POST sin sesión -> 401', r.status === 401, JSON.stringify(r));

  r = await http('POST', '/solicitudes', {}, beto.token);
  check('POST sin publicacion_id -> 400', r.status === 400, JSON.stringify(r));

  r = await http('POST', '/solicitudes', null, beto.token);
  check('POST sin cuerpo -> 400 (no 500)', r.status === 400, JSON.stringify(r));

  r = await http('POST', '/solicitudes', { publicacion_id: 'abc' }, beto.token);
  check('POST con publicacion_id inválido -> 400', r.status === 400, JSON.stringify(r));

  r = await http('POST', '/solicitudes', { publicacion_id: idPub, mensaje: 'x'.repeat(256) }, beto.token);
  check('POST con mensaje de 256 caracteres -> 400', r.status === 400, JSON.stringify(r));

  r = await http('POST', '/solicitudes', { publicacion_id: 9999 }, beto.token);
  check('POST sobre publicación inexistente -> 404', r.status === 404, JSON.stringify(r));

  // ---- RN03
  r = await http('POST', '/solicitudes', { publicacion_id: idPub }, ana.token);
  check('RN03: el propietario no puede solicitar su publicación -> 403', r.status === 403, JSON.stringify(r));

  // ---- Caso correcto + RN06
  r = await http('POST', '/solicitudes', { publicacion_id: idPub, mensaje: '  Me sirve mucho  ' }, beto.token);
  check('Beto solicita -> 201 con id', r.status === 201 && Number.isInteger(r.data.id), JSON.stringify(r));
  const idBeto = r.data.id;
  let fila = (await db.q('SELECT * FROM solicitudes WHERE id = ?', [idBeto]))[0];
  check('la solicitud nace PENDIENTE y a nombre de Beto', fila.estado === 'PENDIENTE' && fila.solicitante_id === beto.usuario.id, JSON.stringify(fila));
  check('el mensaje se guarda sin espacios sobrantes', fila.mensaje === 'Me sirve mucho', JSON.stringify(fila.mensaje));

  r = await http('POST', '/solicitudes', { publicacion_id: idPub }, carla.token);
  check('RN06: Carla también puede solicitar la misma publicación -> 201', r.status === 201, JSON.stringify(r));
  const idCarla = r.data.id;
  fila = (await db.q('SELECT mensaje FROM solicitudes WHERE id = ?', [idCarla]))[0];
  check('un mensaje vacío se guarda como NULL', fila.mensaje === null, JSON.stringify(fila));

  // ---- RN05
  r = await http('POST', '/solicitudes', { publicacion_id: idPub }, beto.token);
  check('RN05: Beto no puede tener dos PENDIENTES sobre la misma publicación -> 409', r.status === 409, JSON.stringify(r));

  // ---- Estados de la publicación (RN04, RN12, RN15)
  for (const [estado, regla] of [['RESERVADA', 'RN12'], ['ENTREGADA', 'RN15'], ['CANCELADA', 'RN04']]) {
    const otra = await crearPublicacion(ana.token, 'Otra ' + estado);
    await db.q('UPDATE publicaciones SET estado = ? WHERE id = ?', [estado, otra]);
    r = await http('POST', '/solicitudes', { publicacion_id: otra }, beto.token);
    check(`${regla}: solicitar una publicación ${estado} -> 409`, r.status === 409, JSON.stringify(r));
  }

  // ---- Concurrencia: 6 peticiones simultáneas del mismo usuario -> solo una entra (RN05)
  const idCarrera = await crearPublicacion(ana.token, 'Carrera');
  const resultados = await Promise.all(
    Array.from({ length: 6 }, () => http('POST', '/solicitudes', { publicacion_id: idCarrera }, beto.token))
  );
  const creadas = resultados.filter((x) => x.status === 201).length;
  const rechazadas = resultados.filter((x) => x.status === 409).length;
  const enBase = (await db.q("SELECT COUNT(*) AS n FROM solicitudes WHERE publicacion_id = ? AND solicitante_id = ? AND estado = 'PENDIENTE'", [idCarrera, beto.usuario.id]))[0].n;
  check('6 peticiones simultáneas: exactamente 1 creada y 5 con 409', creadas === 1 && rechazadas === 5, JSON.stringify(resultados.map((x) => x.status)));
  check('en la base solo queda 1 solicitud PENDIENTE (sin duplicados)', enBase === 1, 'en base: ' + enBase);

  // ---- Listados
  r = await http('GET', '/solicitudes/mias', null, beto.token);
  check('GET /mias de Beto: solo las suyas, con título y propietario', r.status === 200 && r.data.length >= 2 && r.data.every((s) => typeof s.publicacion_titulo === 'string' && s.propietario === 'Ana'), JSON.stringify(r.data));

  r = await http('GET', '/solicitudes/mias', null, ana.token);
  check('GET /mias de Ana (no ha solicitado nada) -> []', r.status === 200 && r.data.length === 0, JSON.stringify(r.data));

  r = await http('GET', '/solicitudes/recibidas', null, ana.token);
  check('GET /recibidas de Ana: llegan las solicitudes con nombre del solicitante', r.status === 200 && r.data.length >= 3 && r.data.every((s) => typeof s.solicitante === 'string'), JSON.stringify(r.data));

  r = await http('GET', '/solicitudes/recibidas', null, beto.token);
  check('GET /recibidas de Beto (no tiene publicaciones) -> []', r.status === 200 && r.data.length === 0, JSON.stringify(r.data));

  r = await http('GET', `/solicitudes/recibidas?publicacion_id=${idPub}&estado=PENDIENTE`, null, ana.token);
  check('GET /recibidas con filtros -> las 2 de la publicación', r.status === 200 && r.data.length === 2, JSON.stringify(r.data));

  r = await http('GET', '/solicitudes/recibidas?estado=INVENTADO', null, ana.token);
  check('GET /recibidas con estado inválido -> 400', r.status === 400, JSON.stringify(r));

  r = await http('GET', '/solicitudes/mias');
  check('GET /mias sin sesión -> 401', r.status === 401, JSON.stringify(r));

  // ---- RN16: cancelar
  r = await http('PATCH', `/solicitudes/${idBeto}/cancelar`);
  check('cancelar sin sesión -> 401', r.status === 401, JSON.stringify(r));

  r = await http('PATCH', `/solicitudes/${idBeto}/cancelar`, null, carla.token);
  check('RN18: cancelar la solicitud de otro usuario -> 403', r.status === 403, JSON.stringify(r));

  r = await http('PATCH', `/solicitudes/${idBeto}/cancelar`, null, ana.token);
  check('el propietario de la publicación tampoco puede cancelar la solicitud de otro -> 403', r.status === 403, JSON.stringify(r));

  r = await http('PATCH', '/solicitudes/9999/cancelar', null, beto.token);
  check('cancelar inexistente -> 404', r.status === 404, JSON.stringify(r));

  r = await http('PATCH', '/solicitudes/abc/cancelar', null, beto.token);
  check('cancelar con id inválido -> 400', r.status === 400, JSON.stringify(r));

  r = await http('PATCH', `/solicitudes/${idBeto}/cancelar`, null, beto.token);
  check('RN16: Beto cancela su solicitud PENDIENTE -> 200', r.status === 200, JSON.stringify(r));
  fila = (await db.q('SELECT estado FROM solicitudes WHERE id = ?', [idBeto]))[0];
  check('RN17: la solicitud sigue existiendo con estado CANCELADA (no se borró)', fila && fila.estado === 'CANCELADA', JSON.stringify(fila));

  r = await http('PATCH', `/solicitudes/${idBeto}/cancelar`, null, beto.token);
  check('RN16: cancelar una ya CANCELADA -> 409', r.status === 409, JSON.stringify(r));

  for (const estado of ['ACEPTADA', 'RECHAZADA']) {
    const otra = await crearPublicacion(ana.token, 'Para ' + estado);
    const s = await http('POST', '/solicitudes', { publicacion_id: otra }, beto.token);
    await db.q('UPDATE solicitudes SET estado = ? WHERE id = ?', [estado, s.data.id]);
    r = await http('PATCH', `/solicitudes/${s.data.id}/cancelar`, null, beto.token);
    check(`RN16: cancelar una solicitud ${estado} -> 409`, r.status === 409, JSON.stringify(r));
  }

  r = await http('POST', '/solicitudes', { publicacion_id: idPub }, beto.token);
  check('después de cancelar, Beto puede volver a solicitar (RN05 solo cuenta las PENDIENTES) -> 201', r.status === 201, JSON.stringify(r));

  db.end();
  terminar();
})().catch((e) => { console.error('ERROR en la prueba:', e); process.exit(1); });
