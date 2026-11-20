// Comprueba que `npm run seed` carga los datos de ejemplo, que se pueden usar y que no se duplican al repetirlo.
const path = require('path');
const { spawnSync } = require('child_process');
const { check, http, terminar } = require('./lib');

function correrSeed() {
  return spawnSync(process.execPath, [path.join(__dirname, '..', 'seed.js')], { env: process.env, encoding: 'utf8' });
}

(async () => {
  const primera = correrSeed();
  check('el seed termina sin errores', primera.status === 0, primera.stderr);
  check('el seed informa que cargó los datos', primera.stdout.includes('Datos de ejemplo cargados'), primera.stdout);

  const admin = await http('POST', '/auth/login', { correo: 'admin@reuse.cl', password: 'Admin123' });
  check('el administrador de ejemplo puede iniciar sesión con su rol', admin.status === 200 && admin.data.usuario.rol === 'ADMINISTRADOR', JSON.stringify(admin));
  const ana = await http('POST', '/auth/login', { correo: 'ana@reuse.cl', password: 'Usuario123' });
  check('Ana (usuario de ejemplo) puede iniciar sesión', ana.status === 200 && ana.data.usuario.rol === 'USUARIO', JSON.stringify(ana));
  const diego = await http('POST', '/auth/login', { correo: 'diego@reuse.cl', password: 'Usuario123' });
  check('la cuenta INACTIVA de ejemplo no puede iniciar sesión -> 403', diego.status === 403, JSON.stringify(diego));

  let r = await http('GET', '/usuarios', null, admin.data.token);
  check('el administrador ve los 5 usuarios de ejemplo, sin contraseñas', r.status === 200 && r.data.length === 5 && r.data.every((u) => !('password' in u)), JSON.stringify(r.data));
  r = await http('GET', '/publicaciones', null, ana.data.token);
  check('el listado muestra 5 publicaciones (la CANCELADA no se ve)', r.status === 200 && r.data.length === 5, JSON.stringify(r.data.map((p) => p.titulo)));
  const estados = [...new Set(r.data.map((p) => p.estado))].sort();
  check('hay publicaciones DISPONIBLE, RESERVADA y ENTREGADA', JSON.stringify(estados) === JSON.stringify(['DISPONIBLE', 'ENTREGADA', 'RESERVADA']), JSON.stringify(estados));
  r = await http('GET', '/solicitudes/recibidas?estado=PENDIENTE', null, ana.data.token);
  check('Ana tiene 2 solicitudes PENDIENTES para aceptar o rechazar', r.status === 200 && r.data.length === 2, JSON.stringify(r.data));
  r = await http('GET', '/entregas/mias', null, ana.data.token);
  check('Ana participa en 2 entregas (una como propietaria y otra como receptora)', r.status === 200 && r.data.length === 2 && r.data.some((e) => e.mi_rol === 'PROPIETARIO') && r.data.some((e) => e.mi_rol === 'RECEPTOR'), JSON.stringify(r.data));

  const segunda = correrSeed();
  check('al repetir el seed no se duplica nada', segunda.status === 0 && segunda.stdout.includes('ya existen'), segunda.stdout);
  r = await http('GET', '/usuarios', null, admin.data.token);
  check('después de repetirlo siguen siendo 5 usuarios', r.status === 200 && r.data.length === 5, JSON.stringify(r.data.length));

  terminar();
})().catch((e) => { console.error('ERROR en la prueba:', e); process.exit(1); });
