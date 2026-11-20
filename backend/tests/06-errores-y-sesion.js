// Issue 8: manejo de errores y situaciones inválidas (sesión, datos, rutas y JSON)
const { check, http, conectarDb, usuario, firmarToken, terminar, BASE_RAIZ } = require('./lib');

(async () => {
  const db = conectarDb();
  const ana = await usuario('Ana', 'ana@test.cl');
  const BASE = BASE_RAIZ;

  // fetch "crudo" para poder enviar cosas que http() no envía (JSON roto, otras cabeceras)
  const crudo = async (metodo, ruta, cuerpoTexto, cabeceras = {}) => {
    const r = await fetch(BASE + ruta, { method: metodo, headers: cabeceras, body: cuerpoTexto });
    let data = null;
    const texto = await r.text();
    try { data = JSON.parse(texto); } catch (e) { /* no era JSON */ }
    return { status: r.status, data, esJson: data !== null };
  };

  // ---- Sesión
  let r = await http('GET', '/publicaciones');
  check('sin sesión -> 401 con mensaje', r.status === 401 && r.data.mensaje === 'Debes iniciar sesión', JSON.stringify(r));
  r = await crudo('GET', '/api/publicaciones', undefined, { Authorization: 'Token abc' });
  check('cabecera sin el formato "Bearer" -> 401', r.status === 401, JSON.stringify(r));
  r = await http('GET', '/publicaciones', null, 'esto.no.es.un.token');
  check('token inventado -> 401', r.status === 401 && r.data.mensaje === 'Sesión inválida o expirada', JSON.stringify(r));
  const vencido = firmarToken({ id: ana.usuario.id, rol: 'USUARIO' }, { expiresIn: -10 });
  r = await http('GET', '/publicaciones', null, vencido);
  check('token vencido -> 401', r.status === 401 && r.data.mensaje === 'Sesión inválida o expirada', JSON.stringify(r));
  const falso = firmarToken({ id: ana.usuario.id, rol: 'USUARIO' }).slice(0, -3) + 'abc';
  r = await http('GET', '/publicaciones', null, falso);
  check('token con la firma alterada -> 401', r.status === 401, JSON.stringify(r));
  const fantasma = firmarToken({ id: 99999, rol: 'ADMINISTRADOR' });
  r = await http('GET', '/usuarios', null, fantasma);
  check('token válido de un usuario que no existe (aunque diga ADMINISTRADOR) -> 401', r.status === 401, JSON.stringify(r));
  const disfrazado = firmarToken({ id: ana.usuario.id, rol: 'ADMINISTRADOR' });
  r = await http('GET', '/usuarios', null, disfrazado);
  check('RN18: el rol que dice el token no cuenta; manda el de la base (Ana es USUARIO) -> 403', r.status === 403, JSON.stringify(r));

  // ---- JSON y rutas
  r = await crudo('POST', '/api/auth/login', '{"correo": "a@b.cl", ', { 'Content-Type': 'application/json' });
  check('JSON mal escrito -> 400 en JSON (no HTML)', r.status === 400 && r.esJson && r.data.mensaje.includes('JSON'), JSON.stringify(r));
  r = await crudo('GET', '/api/ruta-que-no-existe');
  check('ruta inexistente -> 404 en JSON', r.status === 404 && r.esJson && r.data.mensaje === 'Ruta no encontrada', JSON.stringify(r));
  r = await crudo('GET', '/otra/cosa');
  check('ruta inexistente fuera de /api -> 404 en JSON', r.status === 404 && r.esJson, JSON.stringify(r));
  r = await http('DELETE', '/publicaciones/1', null, ana.token);
  check('método que no existe (DELETE) -> 404', r.status === 404, JSON.stringify(r));

  // ---- Datos incompletos o inválidos
  r = await http('POST', '/auth/registro', {});
  check('registro vacío -> 400', r.status === 400, JSON.stringify(r));
  r = await http('POST', '/auth/registro', { nombre: 'X', correo: 'sin-arroba', password: '123456' });
  check('registro con correo mal formado -> 400', r.status === 400, JSON.stringify(r));
  r = await http('POST', '/auth/registro', { nombre: 'X', correo: 'x@test.cl', password: '123' });
  check('registro con contraseña corta -> 400', r.status === 400, JSON.stringify(r));
  r = await http('POST', '/auth/registro', { nombre: 'Ana', correo: 'ana@test.cl', password: '123456' });
  check('registro con correo repetido -> 409', r.status === 409, JSON.stringify(r));
  r = await http('POST', '/auth/registro', { nombre: 'Intruso', correo: 'intruso@test.cl', password: '123456', rol: 'ADMINISTRADOR' });
  const intruso = (await db.q("SELECT rol FROM usuarios WHERE correo = 'intruso@test.cl'"))[0];
  check('registro enviando rol ADMINISTRADOR: el rol se ignora y queda USUARIO', r.status === 201 && intruso.rol === 'USUARIO', JSON.stringify(intruso));
  r = await http('POST', '/auth/login', { correo: 'ana@test.cl', password: 'incorrecta' });
  check('login con contraseña incorrecta -> 401', r.status === 401, JSON.stringify(r));
  r = await http('POST', '/auth/login', { correo: 'nadie@test.cl', password: '123456' });
  check('login con correo inexistente -> 401 con el MISMO mensaje', r.status === 401 && r.data.mensaje === 'Correo o contraseña incorrectos', JSON.stringify(r));
  r = await http('POST', '/auth/login', {});
  check('login vacío -> 400', r.status === 400, JSON.stringify(r));
  r = await http('POST', '/publicaciones', { titulo: 'x' }, ana.token);
  check('publicación incompleta -> 400', r.status === 400, JSON.stringify(r));
  r = await http('POST', '/publicaciones', { titulo: 'x', descripcion: 'x', categoria: 'x', modalidad: 'VENTA' }, ana.token);
  check('publicación con modalidad inválida -> 400', r.status === 400, JSON.stringify(r));

  // ---- Recursos inexistentes
  r = await http('GET', '/publicaciones/9999', null, ana.token);
  check('publicación inexistente -> 404', r.status === 404, JSON.stringify(r));
  r = await http('PATCH', '/solicitudes/9999/cancelar', null, ana.token);
  check('solicitud inexistente -> 404', r.status === 404, JSON.stringify(r));
  r = await http('PATCH', '/entregas/9999/confirmar', null, ana.token);
  check('entrega inexistente -> 404', r.status === 404, JSON.stringify(r));
  r = await http('GET', '/publicaciones/abc', null, ana.token);
  check('id que no es número -> 400', r.status === 400, JSON.stringify(r));

  // ---- Las respuestas de error siempre traen { mensaje } legible
  const errores = await Promise.all([
    http('GET', '/publicaciones'), http('GET', '/publicaciones/9999', null, ana.token),
    http('POST', '/solicitudes', {}, ana.token), http('GET', '/usuarios', null, ana.token),
  ]);
  check('todos los errores probados traen un { mensaje } de texto', errores.every((e) => e.data && typeof e.data.mensaje === 'string' && e.data.mensaje.length > 0), JSON.stringify(errores.map((e) => e.data)));

  db.end();
  terminar();
})().catch((e) => { console.error('ERROR en la prueba:', e); process.exit(1); });
