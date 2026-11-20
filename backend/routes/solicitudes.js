const express = require('express');
const db = require('../db');
const { verificarToken } = require('../middleware/auth');
const { ErrorNegocio, leerId, enTransaccion, responderError } = require('../utils/negocio');

const router = express.Router();

// Todas las rutas de solicitudes exigen haber iniciado sesión
router.use(verificarToken);

const ESTADOS = ['PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'CANCELADA'];

// POST /api/solicitudes  -> pedir una publicación
// Cuerpo: { publicacion_id, mensaje (opcional) }
// Reglas: RN03, RN04, RN05, RN06, RN12 y RN15.
router.post('/', async (req, res) => {
  const { publicacion_id, mensaje } = req.body ?? {};
  const publicacionId = leerId(publicacion_id);

  if (!publicacionId) {
    return res.status(400).json({ mensaje: 'Debes indicar la publicación que quieres solicitar' });
  }

  const texto = mensaje == null ? '' : String(mensaje).trim();

  if (texto.length > 255) {
    return res.status(400).json({ mensaje: 'El mensaje no puede superar los 255 caracteres' });
  }

  try {
    const id = await enTransaccion(async (conexion) => {
      // FOR UPDATE bloquea la fila de la publicación hasta terminar la transacción:
      // si dos personas piden a la vez, la segunda espera y ve el estado ya actualizado.
      const [publicaciones] = await conexion.query(
        'SELECT id, usuario_id, estado FROM publicaciones WHERE id = ? FOR UPDATE',
        [publicacionId]
      );

      if (publicaciones.length === 0) {
        throw new ErrorNegocio(404, 'Publicación no encontrada');
      }

      const publicacion = publicaciones[0];

      // RN03: el propietario no puede solicitar su propia publicación
      if (publicacion.usuario_id === req.usuario.id) {
        throw new ErrorNegocio(403, 'No puedes solicitar tu propia publicación');
      }

      // RN04, RN12 y RN15: solo se solicita una publicación DISPONIBLE
      // (una RESERVADA, ENTREGADA o CANCELADA no recibe solicitudes)
      if (publicacion.estado !== 'DISPONIBLE') {
        throw new ErrorNegocio(
          409,
          `Solo se pueden solicitar publicaciones DISPONIBLES (esta está ${publicacion.estado})`
        );
      }

      // RN05: no puede haber dos solicitudes PENDIENTES del mismo usuario sobre la misma publicación
      const [pendientes] = await conexion.query(
        "SELECT id FROM solicitudes WHERE publicacion_id = ? AND solicitante_id = ? AND estado = 'PENDIENTE'",
        [publicacionId, req.usuario.id]
      );

      if (pendientes.length > 0) {
        throw new ErrorNegocio(409, 'Ya tienes una solicitud pendiente sobre esta publicación');
      }

      // RN06: una publicación DISPONIBLE puede recibir varias solicitudes (de distintas personas).
      // El estado no se envía: MySQL aplica el DEFAULT 'PENDIENTE'.
      const [resultado] = await conexion.query(
        'INSERT INTO solicitudes (publicacion_id, solicitante_id, mensaje) VALUES (?, ?, ?)',
        [publicacionId, req.usuario.id, texto || null]
      );

      return resultado.insertId;
    });

    res.status(201).json({ mensaje: 'Solicitud enviada correctamente', id });
  } catch (error) {
    responderError(res, error, 'Error al crear la solicitud');
  }
});

// GET /api/solicitudes/mias  -> las solicitudes que yo hice
router.get('/mias', (req, res) => {
  const sql = `
    SELECT s.id, s.publicacion_id, s.mensaje, s.fecha_solicitud, s.estado,
           p.titulo AS publicacion_titulo, p.estado AS publicacion_estado,
           u.nombre AS propietario
    FROM solicitudes s
    JOIN publicaciones p ON p.id = s.publicacion_id
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE s.solicitante_id = ?
    ORDER BY s.id DESC`;

  db.query(sql, [req.usuario.id], (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al consultar tus solicitudes' });
    }
    res.status(200).json(resultados);
  });
});

// GET /api/solicitudes/recibidas  -> las solicitudes que llegaron a MIS publicaciones
// Filtros opcionales: ?estado=PENDIENTE  y  ?publicacion_id=3
router.get('/recibidas', (req, res) => {
  const { estado, publicacion_id } = req.query;
  const condiciones = ['p.usuario_id = ?'];
  const valores = [req.usuario.id];

  if (estado) {
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ mensaje: 'El estado indicado no es válido' });
    }
    condiciones.push('s.estado = ?');
    valores.push(estado);
  }

  if (publicacion_id) {
    const publicacionId = leerId(publicacion_id);

    if (!publicacionId) {
      return res.status(400).json({ mensaje: 'La publicación indicada no es válida' });
    }
    condiciones.push('s.publicacion_id = ?');
    valores.push(publicacionId);
  }

  const sql = `
    SELECT s.id, s.publicacion_id, s.mensaje, s.fecha_solicitud, s.estado, s.solicitante_id,
           p.titulo AS publicacion_titulo, p.estado AS publicacion_estado,
           u.nombre AS solicitante
    FROM solicitudes s
    JOIN publicaciones p ON p.id = s.publicacion_id
    JOIN usuarios u ON u.id = s.solicitante_id
    WHERE ${condiciones.join(' AND ')}
    ORDER BY s.id DESC`;

  db.query(sql, valores, (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al consultar las solicitudes recibidas' });
    }
    res.status(200).json(resultados);
  });
});

// PATCH /api/solicitudes/:id/cancelar  -> el solicitante cancela su solicitud (RN16)
router.patch('/:id/cancelar', async (req, res) => {
  const id = leerId(req.params.id);

  if (!id) {
    return res.status(400).json({ mensaje: 'ID inválido' });
  }

  try {
    const [solicitudes] = await db.promise().query('SELECT * FROM solicitudes WHERE id = ?', [id]);

    if (solicitudes.length === 0) {
      return res.status(404).json({ mensaje: 'Solicitud no encontrada' });
    }

    const solicitud = solicitudes[0];

    // RN18: solo quien hizo la solicitud puede cancelarla (se decide en el servidor)
    if (solicitud.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ mensaje: 'Solo quien hizo la solicitud puede cancelarla' });
    }

    // RN16: solo se puede cancelar mientras esté PENDIENTE
    if (solicitud.estado !== 'PENDIENTE') {
      return res.status(409).json({
        mensaje: `Solo se puede cancelar una solicitud PENDIENTE (esta está ${solicitud.estado})`,
      });
    }

    // El AND estado = 'PENDIENTE' protege si el propietario la aceptó justo ahora
    const [resultado] = await db.promise().query(
      "UPDATE solicitudes SET estado = 'CANCELADA' WHERE id = ? AND estado = 'PENDIENTE'",
      [id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(409).json({ mensaje: 'La solicitud cambió de estado y ya no se puede cancelar' });
    }

    res.status(200).json({ mensaje: 'Solicitud cancelada correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al cancelar la solicitud');
  }
});

module.exports = router;
