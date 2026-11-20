// Persistencia, parte B: se ejecuta DESPUÉS de reiniciar el servidor.
// Si los datos siguen ahí, están guardados en MySQL y no en la memoria del servidor.
const { check, http, terminar } = require('./lib');

(async () => {
  // Se vuelve a iniciar sesión con el usuario creado antes del reinicio (si no estuviera en MySQL, fallaría)
  const login = await http('POST', '/auth/login', { correo: 'persistente@test.cl', password: '123456' });
  check('después del reinicio: el usuario sigue existiendo y puede iniciar sesión', login.status === 200 && !!login.data.token, JSON.stringify(login));

  const r = await http('GET', '/publicaciones?propias=1', null, login.data.token);
  check('después del reinicio: la publicación sigue guardada', r.status === 200 && r.data.some((p) => p.titulo === 'Dato que debe sobrevivir al reinicio'), JSON.stringify(r.data));
  terminar();
})().catch((e) => { console.error('ERROR en la prueba:', e); process.exit(1); });
