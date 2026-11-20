// Issue 8: roles y administración de usuarios (RN18). Solo el ADMINISTRADOR puede usar /api/usuarios.
const { check, http, conectarDb, usuario, terminar } = require('./lib');

(async () => {
  const db = conectarDb();
  const ana = await usuario('Ana', 'ana@test.cl');
  const beto = await usuario('Beto', 'beto@test.cl');
  const carla = await usuario('Carla', 'carla@test.cl');
  await usuario('Eva', 'eva@test.cl');
  await db.q("UPDATE usuarios SET rol = 'ADMINISTRADOR' WHERE correo = 'eva@test.cl'");
  const eva = (await http('POST', '/auth/login', { correo: 'eva@test.cl', password: '123456' })).data;
  const fila = async (id) => (await db.q('SELECT rol, estado FROM usuarios WHERE id = ?', [id]))[0];

  // ---- Quién puede ver la lista
  let r = await http('GET', '/usuarios');
  check('GET /usuarios sin sesión -> 401', r.status === 401, JSON.stringify(r));
  r = await http('GET', '/usuarios', null, ana.token);
  check('RN18: un usuario normal no puede ver la lista -> 403', r.status === 403, JSON.stringify(r));
  r = await http('GET', '/usuarios', null, eva.token);
  check('el administrador ve la lista -> 200 con los 4 usuarios', r.status === 200 && r.data.length === 4, JSON.stringify(r));
  check('la lista NO incluye contraseñas ni hashes', r.data.every((u) => !('password' in u)), JSON.stringify(r.data[0]));
  check('cada usuario trae nombre, correo, rol, estado y cantidad de publicaciones', r.data.every((u) => u.nombre && u.correo && u.rol && u.estado && typeof u.publicaciones === 'number'), JSON.stringify(r.data[0]));
  r = await http('GET', '/usuarios?rol=ADMINISTRADOR', null, eva.token);
  check('filtro ?rol=ADMINISTRADOR -> solo Eva', r.status === 200 && r.data.length === 1 && r.data[0].correo === 'eva@test.cl', JSON.stringify(r.data));
  r = await http('GET', '/usuarios?rol=SUPERMAN', null, eva.token);
  check('filtro con rol inválido -> 400', r.status === 400, JSON.stringify(r));
  r = await http('GET', '/usuarios?estado=DORMIDO', null, eva.token);
  check('filtro con estado inválido -> 400', r.status === 400, JSON.stringify(r));

  // ---- Cambiar estado (activar/desactivar)
  r = await http('PATCH', `/usuarios/${beto.usuario.id}/estado`, { estado: 'INACTIVO' }, ana.token);
  check('RN18: un usuario normal no puede desactivar a otro -> 403', r.status === 403, JSON.stringify(r));
  check('nada cambió tras el intento no autorizado', (await fila(beto.usuario.id)).estado === 'ACTIVO');
  r = await http('PATCH', `/usuarios/${beto.usuario.id}/estado`, { estado: 'INACTIVO' });
  check('desactivar sin sesión -> 401', r.status === 401, JSON.stringify(r));
  r = await http('PATCH', '/usuarios/abc/estado', { estado: 'INACTIVO' }, eva.token);
  check('desactivar con id inválido -> 400', r.status === 400, JSON.stringify(r));
  r = await http('PATCH', '/usuarios/9999/estado', { estado: 'INACTIVO' }, eva.token);
  check('desactivar un usuario inexistente -> 404', r.status === 404, JSON.stringify(r));
  r = await http('PATCH', `/usuarios/${beto.usuario.id}/estado`, { estado: 'DORMIDO' }, eva.token);
  check('estado inválido -> 400', r.status === 400, JSON.stringify(r));
  r = await http('PATCH', `/usuarios/${beto.usuario.id}/estado`, null, eva.token);
  check('sin cuerpo -> 400 (no 500)', r.status === 400, JSON.stringify(r));
  r = await http('PATCH', `/usuarios/${eva.usuario.id}/estado`, { estado: 'INACTIVO' }, eva.token);
  check('el administrador no puede desactivarse a sí mismo -> 409', r.status === 409, JSON.stringify(r));
  check('Eva sigue ACTIVA', (await fila(eva.usuario.id)).estado === 'ACTIVO');

  r = await http('PATCH', `/usuarios/${beto.usuario.id}/estado`, { estado: 'INACTIVO' }, eva.token);
  check('el administrador desactiva a Beto -> 200', r.status === 200, JSON.stringify(r));
  check('RN17: Beto sigue existiendo, ahora INACTIVO (no se borró)', (await fila(beto.usuario.id)).estado === 'INACTIVO');
  r = await http('POST', '/auth/login', { correo: 'beto@test.cl', password: '123456' });
  check('Beto desactivado no puede iniciar sesión -> 403', r.status === 403, JSON.stringify(r));
  r = await http('GET', '/publicaciones', null, beto.token);
  check('su token ANTERIOR deja de funcionar de inmediato -> 403', r.status === 403, JSON.stringify(r));
  r = await http('GET', '/usuarios?estado=INACTIVO', null, eva.token);
  check('el filtro ?estado=INACTIVO muestra a Beto', r.status === 200 && r.data.length === 1 && r.data[0].correo === 'beto@test.cl', JSON.stringify(r.data));

  r = await http('PATCH', `/usuarios/${beto.usuario.id}/estado`, { estado: 'ACTIVO' }, eva.token);
  check('el administrador reactiva a Beto -> 200', r.status === 200, JSON.stringify(r));
  r = await http('GET', '/publicaciones', null, beto.token);
  check('con la cuenta reactivada, su mismo token vuelve a funcionar -> 200', r.status === 200, JSON.stringify(r));

  // ---- Cambiar rol
  r = await http('GET', '/usuarios', null, carla.token);
  check('antes de ser administradora, Carla no ve la lista -> 403', r.status === 403, JSON.stringify(r));
  r = await http('PATCH', `/usuarios/${carla.usuario.id}/rol`, { rol: 'ADMINISTRADOR' }, ana.token);
  check('RN18: un usuario normal no puede cambiar roles -> 403', r.status === 403, JSON.stringify(r));
  r = await http('PATCH', `/usuarios/${carla.usuario.id}/rol`, { rol: 'SUPERMAN' }, eva.token);
  check('rol inválido -> 400', r.status === 400, JSON.stringify(r));
  r = await http('PATCH', `/usuarios/${eva.usuario.id}/rol`, { rol: 'USUARIO' }, eva.token);
  check('el administrador no puede quitarse su propio rol -> 409', r.status === 409, JSON.stringify(r));
  r = await http('PATCH', `/usuarios/${carla.usuario.id}/rol`, { rol: 'ADMINISTRADOR' }, eva.token);
  check('el administrador promueve a Carla -> 200', r.status === 200, JSON.stringify(r));
  r = await http('GET', '/usuarios', null, carla.token);
  check('el cambio de rol se nota de inmediato con su MISMO token -> 200', r.status === 200, JSON.stringify(r));
  r = await http('PATCH', `/usuarios/${carla.usuario.id}/rol`, { rol: 'USUARIO' }, eva.token);
  check('el administrador la devuelve a USUARIO -> 200', r.status === 200, JSON.stringify(r));
  r = await http('GET', '/usuarios', null, carla.token);
  check('y con su mismo token vuelve a recibir 403', r.status === 403, JSON.stringify(r));

  // ---- Lo que un administrador puede hacer en publicaciones
  const pub = (await http('POST', '/publicaciones', { titulo: 'Cuaderno', descripcion: 'x', categoria: 'Papeleria', modalidad: 'DONACION' }, ana.token)).data.id;
  r = await http('PATCH', `/publicaciones/${pub}/cancelar`, null, carla.token);
  check('un usuario normal no puede cancelar la publicación de otro -> 403', r.status === 403, JSON.stringify(r));
  r = await http('PATCH', `/publicaciones/${pub}/cancelar`, null, eva.token);
  check('el administrador sí puede cancelar la publicación de otro (moderación) -> 200', r.status === 200, JSON.stringify(r));

  db.end();
  terminar();
})().catch((e) => { console.error('ERROR en la prueba:', e); process.exit(1); });
