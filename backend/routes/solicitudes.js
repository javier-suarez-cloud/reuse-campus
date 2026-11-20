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

// Busca la solicitud y su publicación y las BLOQUEA (FOR UPDATE) hasta que termine la transacción.
// Se bloquea siempre en el mismo orden (primero la publicación y luego la solicitud) para que dos
// peticiones simultáneas no se queden esperando una a la otra.
async function bloquearSolicitudYPublicacion(conexion, id) {
  const [existentes] = await conexion.query('SELECT publicacion_id FROM solicitudes WHERE id = ?', [id]);

  if (existentes.length === 0) {
    throw new ErrorNegocio(404, 'Solicitud no encontrada');
  }

  const [publicaciones] = await conexion.query(
    'SELECT * FROM publicaciones WHERE id = ? FOR UPDATE',
    [existentes[0].publicacion_id]
  );
  // Se vuelve a leer la solicitud ya bloqueada: así se ve su estado más reciente
  const [solicitudes] = await conexion.query('SELECT * FROM solicitudes WHERE id = ? FOR UPDATE', [id]);

  return { publicacion: publicaciones[0], solicitud: solicitudes[0] };
}

// PATCH /api/solicitudes/:id/aceptar  -> el propietario acepta una solicitud
// Reglas: RN07, RN08, RN09, RN10 y RN11. Todo ocurre en UNA transacción:
// si cualquier paso falla, no se guarda ninguno de los cambios.
router.patch('/:id/aceptar', async (req, res) => {
  const id = leerId(req.params.id);

  if (!id) {
    return res.status(400).json({ mensaje: 'ID inválido' });
  }

  try {
    const entregaId = await enTransaccion(async (conexion) => {
      const { publicacion, solicitud } = await bloquearSolicitudYPublicacion(conexion, id);

      // RN07: solo el propietario de la publicación acepta (ni el solicitante ni un administrador)
      if (publicacion.usuario_id !== req.usuario.id) {
        throw new ErrorNegocio(403, 'Solo el propietario de la publicación puede aceptar solicitudes');
      }

      if (solicitud.estado !== 'PENDIENTE') {
        throw new ErrorNegocio(
          409,
          `Solo se puede aceptar una solicitud PENDIENTE (esta está ${solicitud.estado})`
        );
      }

      // RN08 y RN12: la publicación debe estar DISPONIBLE. Si ya hay una solicitud aceptada,
      // la publicación está RESERVADA y no se puede aceptar otra (solo una ACEPTADA por publicación).
      if (publicacion.estado !== 'DISPONIBLE') {
        throw new ErrorNegocio(
          409,
          `Solo se pueden aceptar solicitudes de una publicación DISPONIBLE (esta está ${publicacion.estado})`
        );
      }

      // La solicitud elegida pasa a ACEPTADA
      await conexion.query("UPDATE solicitudes SET estado = 'ACEPTADA' WHERE id = ?", [solicitud.id]);

      // RN09: la publicación pasa de DISPONIBLE a RESERVADA
      await conexion.query("UPDATE publicaciones SET estado = 'RESERVADA' WHERE id = ?", [publicacion.id]);

      // RN10: las demás solicitudes PENDIENTES de esa publicación pasan a RECHAZADA
      await conexion.query(
        "UPDATE solicitudes SET estado = 'RECHAZADA' WHERE publicacion_id = ? AND id <> ? AND estado = 'PENDIENTE'",
        [publicacion.id, solicitud.id]
      );

      // RN11: se genera la Entrega/Intercambio en estado PENDIENTE (el estado lo pone el DEFAULT)
      const [entrega] = await conexion.query(
        'INSERT INTO entregas (publicacion_id, solicitud_id, propietario_id, receptor_id) VALUES (?, ?, ?, ?)',
        [publicacion.id, solicitud.id, publicacion.usuario_id, solicitud.solicitante_id]
      );

      return entrega.insertId;
    });

    res.status(200).json({ mensaje: 'Solicitud aceptada correctamente', entrega_id: entregaId });
  } catch (error) {
    responderError(res, error, 'Error al aceptar la solicitud');
  }
});

// PATCH /api/solicitudes/:id/rechazar  -> el propietario rechaza una solicitud (RN07)
router.patch('/:id/rechazar', async (req, res) => {
  const id = leerId(req.params.id);

  if (!id) {
    return res.status(400).json({ mensaje: 'ID inválido' });
  }

  try {
    await enTransaccion(async (conexion) => {
      const { publicacion, solicitud } = await bloquearSolicitudYPublicacion(conexion, id);

      // RN07: solo el propietario de la publicación rechaza
      if (publicacion.usuario_id !== req.usuario.id) {
        throw new ErrorNegocio(403, 'Solo el propietario de la publicación puede rechazar solicitudes');
      }

      if (solicitud.estado !== 'PENDIENTE') {
        throw new ErrorNegocio(
          409,
          `Solo se puede rechazar una solicitud PENDIENTE (esta está ${solicitud.estado})`
        );
      }

      await conexion.query("UPDATE solicitudes SET estado = 'RECHAZADA' WHERE id = ?", [solicitud.id]);
    });

    res.status(200).json({ mensaje: 'Solicitud rechazada correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al rechazar la solicitud');
  }
});

module.exports = router;
