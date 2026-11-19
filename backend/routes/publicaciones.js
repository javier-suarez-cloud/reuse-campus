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

const MODALIDADES = ['DONACION', 'INTERCAMBIO'];

// Revisa y limpia los datos del cuerpo (sirve para crear y para editar).
// Devuelve { datos } si está todo bien, o { error } con el mensaje para el usuario.
function validarPublicacion(cuerpo = {}) {
  const titulo = String(cuerpo.titulo ?? '').trim();
  const descripcion = String(cuerpo.descripcion ?? '').trim();
  const categoria = String(cuerpo.categoria ?? '').trim();
  const modalidad = String(cuerpo.modalidad ?? '').trim();

  if (!titulo || !descripcion || !categoria || !modalidad) {
    return { error: 'Título, descripción, categoría y modalidad son obligatorios' };
  }
  if (titulo.length > 150) {
    return { error: 'El título no puede superar los 150 caracteres' };
  }
  if (categoria.length > 50) {
    return { error: 'La categoría no puede superar los 50 caracteres' };
  }
  if (!MODALIDADES.includes(modalidad)) {
    return { error: 'La modalidad debe ser DONACION o INTERCAMBIO' };
  }

  return { datos: { titulo, descripcion, categoria, modalidad } };
}

// Busca la publicación de la URL y comprueba que quien la pide sea su propietario
// (o un administrador). Si todo está bien, llama a continuar(publicacion).
function buscarPropia(req, res, continuar) {
  const id = leerId(req.params.id);

  if (!id) {
    return res.status(400).json({ mensaje: 'ID inválido' });
  }

  db.query('SELECT * FROM publicaciones WHERE id = ?', [id], (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al consultar la publicación' });
    }

    if (resultados.length === 0) {
      return res.status(404).json({ mensaje: 'Publicación no encontrada' });
    }

    const publicacion = resultados[0];
    const esPropietario = publicacion.usuario_id === req.usuario.id;
    const esAdmin = req.usuario.rol === 'ADMINISTRADOR';

    // RN18: el permiso se revisa en el servidor, no en Angular
    if (!esPropietario && !esAdmin) {
      return res.status(403).json({ mensaje: 'Solo el propietario puede modificar esta publicación' });
    }

    continuar(publicacion);
  });
}

// POST /api/publicaciones  -> crear una publicación (RN01: exige sesión, ver router.use arriba)
router.post('/', (req, res) => {
  const { datos, error } = validarPublicacion(req.body);

  if (error) {
    return res.status(400).json({ mensaje: error });
  }

  // RN02: el propietario es el usuario del token; nunca viene del cuerpo de la petición.
  // El estado no se envía: MySQL aplica el DEFAULT 'DISPONIBLE'.
  const sql = `INSERT INTO publicaciones (titulo, descripcion, categoria, modalidad, usuario_id)
               VALUES (?, ?, ?, ?, ?)`;
  const valores = [datos.titulo, datos.descripcion, datos.categoria, datos.modalidad, req.usuario.id];

  db.query(sql, valores, (errorInsert, resultado) => {
    if (errorInsert) {
      console.error(errorInsert);
      return res.status(500).json({ mensaje: 'Error al crear la publicación' });
    }

    res.status(201).json({ mensaje: 'Publicación creada correctamente', id: resultado.insertId });
  });
});

// PUT /api/publicaciones/:id  -> editar (solo el propietario y solo si está DISPONIBLE)
router.put('/:id', (req, res) => {
  buscarPropia(req, res, (publicacion) => {
    if (publicacion.estado !== 'DISPONIBLE') {
      return res.status(409).json({ mensaje: 'Solo se puede editar una publicación DISPONIBLE' });
    }

    const { datos, error } = validarPublicacion(req.body);

    if (error) {
      return res.status(400).json({ mensaje: error });
    }

    const sql = `UPDATE publicaciones
                 SET titulo = ?, descripcion = ?, categoria = ?, modalidad = ?
                 WHERE id = ? AND estado = 'DISPONIBLE'`;
    const valores = [datos.titulo, datos.descripcion, datos.categoria, datos.modalidad, publicacion.id];

    db.query(sql, valores, (errorUpdate, resultado) => {
      if (errorUpdate) {
        console.error(errorUpdate);
        return res.status(500).json({ mensaje: 'Error al editar la publicación' });
      }

      // Si nadie coincidió, el estado cambió justo ahora (por ejemplo, la reservaron)
      if (resultado.affectedRows === 0) {
        return res.status(409).json({ mensaje: 'La publicación cambió de estado y ya no se puede editar' });
      }

      res.status(200).json({ mensaje: 'Publicación actualizada correctamente' });
    });
  });
});

// PATCH /api/publicaciones/:id/cancelar  -> cancelar (RN17: no se borra, cambia de estado)
router.patch('/:id/cancelar', (req, res) => {
  buscarPropia(req, res, (publicacion) => {
    if (publicacion.estado === 'CANCELADA') {
      return res.status(409).json({ mensaje: 'La publicación ya está cancelada' });
    }

    if (publicacion.estado !== 'DISPONIBLE') {
      return res.status(409).json({ mensaje: `No se puede cancelar una publicación ${publicacion.estado}` });
    }

    const sql = "UPDATE publicaciones SET estado = 'CANCELADA' WHERE id = ? AND estado = 'DISPONIBLE'";

    db.query(sql, [publicacion.id], (error, resultado) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ mensaje: 'Error al cancelar la publicación' });
      }

      if (resultado.affectedRows === 0) {
        return res.status(409).json({ mensaje: 'La publicación cambió de estado y ya no se puede cancelar' });
      }

      res.status(200).json({ mensaje: 'Publicación cancelada correctamente' });
    });
  });
});

module.exports = router;
