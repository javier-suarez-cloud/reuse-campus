const db = require('../db'); // se carga primero: así el archivo .env ya está leído al definir JWT_SECRET
const jwt = require('jsonwebtoken');

// Debe ser el mismo secreto que usa routes/auth.js al firmar el token
const JWT_SECRET = process.env.JWT_SECRET ?? 'secreto-solo-para-desarrollo';

// Exige que la petición venga con "Authorization: Bearer <token>".
// 1) Comprueba que el token sea válido (firma y expiración).
// 2) Consulta la base de datos para confirmar que el usuario existe y está ACTIVO, y toma
//    su rol ACTUAL: así, si un administrador desactiva una cuenta o cambia un rol, el cambio
//    se nota de inmediato (sin esperar a que venza el token).
// Si todo está bien, deja el usuario en req.usuario y sigue (next).
function verificarToken(req, res, next) {
  const cabecera = req.headers.authorization;

  if (!cabecera || !cabecera.startsWith('Bearer ')) {
    return res.status(401).json({ mensaje: 'Debes iniciar sesión' });
  }

  const token = cabecera.slice(7);

  jwt.verify(token, JWT_SECRET, (error, datos) => {
    if (error) {
      return res.status(401).json({ mensaje: 'Sesión inválida o expirada' });
    }

    db.query('SELECT id, rol, estado FROM usuarios WHERE id = ?', [datos.id], (errorDb, filas) => {
      if (errorDb) {
        console.error(errorDb);
        return res.status(500).json({ mensaje: 'Error al validar la sesión' });
      }

      if (filas.length === 0) {
        return res.status(401).json({ mensaje: 'Sesión inválida o expirada' });
      }

      if (filas[0].estado !== 'ACTIVO') {
        return res.status(403).json({ mensaje: 'Tu cuenta está inactiva' });
      }

      req.usuario = { id: filas[0].id, rol: filas[0].rol };
      next();
    });
  });
}

// Se usa después de verificarToken: solo deja pasar a los administradores
function soloAdmin(req, res, next) {
  if (req.usuario.rol !== 'ADMINISTRADOR') {
    return res.status(403).json({ mensaje: 'No tienes permiso para esta operación' });
  }
  next();
}

module.exports = { verificarToken, soloAdmin, JWT_SECRET };
