const express = require('express');
const db = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { ErrorNegocio, leerId, responderError } = require('../utils/negocio');

const router = express.Router();

// Todas las rutas de este archivo son SOLO para administradores:
// primero se exige sesión (401) y después el rol ADMINISTRADOR (403).
router.use(verificarToken, soloAdmin);

const ROLES = ['USUARIO', 'ADMINISTRADOR'];
const ESTADOS = ['ACTIVO', 'INACTIVO'];

// GET /api/usuarios  -> lista de usuarios (filtros opcionales: ?rol= y ?estado=)
// Nunca se devuelve la contraseña (ni siquiera el hash).
router.get('/', (req, res) => {
  const { rol, estado } = req.query;
  const condiciones = [];
  const valores = [];

  if (rol) {
    if (!ROLES.includes(rol)) {
      return res.status(400).json({ mensaje: 'El rol indicado no es válido' });
    }
    condiciones.push('u.rol = ?');
    valores.push(rol);
  }

  if (estado) {
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ mensaje: 'El estado indicado no es válido' });
    }
    condiciones.push('u.estado = ?');
    valores.push(estado);
  }

  const donde = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  const sql = `
    SELECT u.id, u.nombre, u.correo, u.rol, u.estado,
           (SELECT COUNT(*) FROM publicaciones p WHERE p.usuario_id = u.id) AS publicaciones
    FROM usuarios u
    ${donde}
    ORDER BY u.id`;

  db.query(sql, valores, (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al consultar los usuarios' });
    }
    res.status(200).json(resultados);
  });
});

// Busca al usuario de la URL y comprueba que no sea el propio administrador que hace la petición
// (así nadie se quita el acceso a sí mismo sin querer).
async function buscarOtroUsuario(req) {
  const id = leerId(req.params.id);

  if (!id) {
    throw new ErrorNegocio(400, 'ID inválido');
  }

  const [usuarios] = await db.promise().query('SELECT id, rol, estado FROM usuarios WHERE id = ?', [id]);

  if (usuarios.length === 0) {
    throw new ErrorNegocio(404, 'Usuario no encontrado');
  }

  if (usuarios[0].id === req.usuario.id) {
    throw new ErrorNegocio(409, 'No puedes modificar tu propia cuenta');
  }

  return usuarios[0];
}

// PATCH /api/usuarios/:id/estado  -> activa o desactiva una cuenta. Cuerpo: { estado }
// RN17: no se borra al usuario; se desactiva (su historial se conserva).
router.patch('/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body ?? {};

    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ mensaje: 'El estado debe ser ACTIVO o INACTIVO' });
    }

    const usuario = await buscarOtroUsuario(req);
    await db.promise().query('UPDATE usuarios SET estado = ? WHERE id = ?', [estado, usuario.id]);

    res.status(200).json({ mensaje: `Cuenta ${estado === 'ACTIVO' ? 'activada' : 'desactivada'} correctamente` });
  } catch (error) {
    responderError(res, error, 'Error al cambiar el estado del usuario');
  }
});

// PATCH /api/usuarios/:id/rol  -> cambia el rol de un usuario. Cuerpo: { rol }
router.patch('/:id/rol', async (req, res) => {
  try {
    const { rol } = req.body ?? {};

    if (!ROLES.includes(rol)) {
      return res.status(400).json({ mensaje: 'El rol debe ser USUARIO o ADMINISTRADOR' });
    }

    const usuario = await buscarOtroUsuario(req);
    await db.promise().query('UPDATE usuarios SET rol = ? WHERE id = ?', [rol, usuario.id]);

    res.status(200).json({ mensaje: 'Rol actualizado correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al cambiar el rol del usuario');
  }
});

module.exports = router;
