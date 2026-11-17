const jwt = require('jsonwebtoken');

// Debe ser el mismo secreto que usa routes/auth.js al firmar el token
const JWT_SECRET = process.env.JWT_SECRET ?? 'secreto-solo-para-desarrollo';

// Exige que la petición venga con "Authorization: Bearer <token>".
// Si el token es válido, deja el usuario en req.usuario y sigue (next).
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

    req.usuario = { id: datos.id, rol: datos.rol };
    next();
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
