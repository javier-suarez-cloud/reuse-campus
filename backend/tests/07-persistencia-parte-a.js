// Persistencia, parte A: crea datos y hace una publicación. Después el ejecutor REINICIA el servidor
// y la parte B comprueba que todo sigue en MySQL.
const { check, http, usuario, crearPublicacion, terminar } = require('./lib');

(async () => {
  const ana = await usuario('Ana Persistente', 'persistente@test.cl');
  const idPub = await crearPublicacion(ana.token, 'Dato que debe sobrevivir al reinicio');
  check('antes del reinicio: la publicación existe', Number.isInteger(idPub));
  const r = await http('GET', '/publicaciones/' + idPub, null, ana.token);
  check('antes del reinicio: se puede consultar (200)', r.status === 200, JSON.stringify(r));
  terminar();
})().catch((e) => { console.error('ERROR en la prueba:', e); process.exit(1); });
