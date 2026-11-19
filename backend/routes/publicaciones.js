const express = require('express');
const db = require('../db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas de publicaciones exigen haber iniciado sesión
router.use(verificarToken);

// Consulta base: la publicación junto con el nombre de su propietario
const SELECT_BASE = `
  SELECT p.id, p.titulo, p.descripcion, p.categoria, p.modalidad, p.estado,
         p.fecha_publicacion, p.usuario_id, u.nombre AS propietario
  FROM publicaciones p
  JOIN usuarios u ON u.id = p.usuario_id`;

// Convierte el :id de la URL en un número entero positivo (o null si no sirve)
function leerId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/publicaciones  -> listado (filtros opcionales: ?estado=&modalidad=&categoria=)
// Si no se pide un estado, no se muestran las CANCELADAS.
router.get('/', (req, res) => {
  const { estado, modalidad, categoria } = req.query;
  const condiciones = [];
  const valores = [];

  if (estado) {
    condiciones.push('p.estado = ?');
    valores.push(estado);
  } else {
    condiciones.push("p.estado <> 'CANCELADA'");
  }
  if (modalidad) {
    condiciones.push('p.modalidad = ?');
    valores.push(modalidad);
  }
  if (categoria) {
    condiciones.push('p.categoria = ?');
    valores.push(categoria);
  }

  const sql = `${SELECT_BASE} WHERE ${condiciones.join(' AND ')} ORDER BY p.id DESC`;

  db.query(sql, valores, (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al consultar las publicaciones' });
    }
    res.status(200).json(resultados);
  });
});

// GET /api/publicaciones/mias  -> las publicaciones del usuario que inició sesión
// (va antes de "/:id" para que "mias" no se confunda con un id)
router.get('/mias', (req, res) => {
  const sql = `${SELECT_BASE} WHERE p.usuario_id = ? ORDER BY p.id DESC`;

  db.query(sql, [req.usuario.id], (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al consultar tus publicaciones' });
    }
    res.status(200).json(resultados);
  });
});

// GET /api/publicaciones/:id  -> el detalle de una publicación
router.get('/:id', (req, res) => {
  const id = leerId(req.params.id);

  if (!id) {
    return res.status(400).json({ mensaje: 'ID inválido' });
  }

  db.query(`${SELECT_BASE} WHERE p.id = ?`, [id], (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al consultar la publicación' });
    }

    if (resultados.length === 0) {
      return res.status(404).json({ mensaje: 'Publicación no encontrada' });
    }

    res.status(200).json(resultados[0]);
  });
});

module.exports = router;
