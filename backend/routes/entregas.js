const express = require('express');
const db = require('../db');
const { verificarToken } = require('../middleware/auth');
const { ErrorNegocio, leerId, enTransaccion, responderError } = require('../utils/negocio');

const router = express.Router();

// Todas las rutas de entregas exigen haber iniciado sesión
router.use(verificarToken);

// GET /api/entregas/mias  -> las entregas en las que participo (como propietario o como receptor)
router.get('/mias', (req, res) => {
  const sql = `
    SELECT e.id, e.publicacion_id, e.solicitud_id, e.propietario_id, e.receptor_id,
           e.fecha_acuerdo, e.fecha_entrega, e.estado,
           p.titulo AS publicacion_titulo, p.estado AS publicacion_estado,
           po.nombre AS propietario, re.nombre AS receptor,
           CASE WHEN e.propietario_id = ? THEN 'PROPIETARIO' ELSE 'RECEPTOR' END AS mi_rol
    FROM entregas e
    JOIN publicaciones p ON p.id = e.publicacion_id
    JOIN usuarios po ON po.id = e.propietario_id
    JOIN usuarios re ON re.id = e.receptor_id
    WHERE e.propietario_id = ? OR e.receptor_id = ?
    ORDER BY e.id DESC`;

  db.query(sql, [req.usuario.id, req.usuario.id, req.usuario.id], (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al consultar tus entregas' });
    }
    res.status(200).json(resultados);
  });
});

// PATCH /api/entregas/:id/confirmar  -> confirma que la entrega se realizó
// Reglas: RN13 y RN14. Es una transacción: la entrega pasa a COMPLETADA y la publicación a ENTREGADA
// juntas, o no cambia ninguna de las dos.
router.patch('/:id/confirmar', async (req, res) => {
  const id = leerId(req.params.id);

  if (!id) {
    return res.status(400).json({ mensaje: 'ID inválido' });
  }

  try {
    await enTransaccion(async (conexion) => {
      const [existentes] = await conexion.query('SELECT publicacion_id FROM entregas WHERE id = ?', [id]);

      if (existentes.length === 0) {
        throw new ErrorNegocio(404, 'Entrega no encontrada');
      }

      // Se bloquea primero la publicación y luego la entrega (mismo orden que al aceptar una solicitud)
      const [publicaciones] = await conexion.query(
        'SELECT * FROM publicaciones WHERE id = ? FOR UPDATE',
        [existentes[0].publicacion_id]
      );
      const [entregas] = await conexion.query('SELECT * FROM entregas WHERE id = ? FOR UPDATE', [id]);
      const publicacion = publicaciones[0];
      const entrega = entregas[0];

      // RN18: solo participan de la entrega su propietario y su receptor
      if (entrega.propietario_id !== req.usuario.id && entrega.receptor_id !== req.usuario.id) {
        throw new ErrorNegocio(403, 'Solo el propietario o el receptor pueden confirmar esta entrega');
      }

      if (entrega.estado !== 'PENDIENTE') {
        throw new ErrorNegocio(
          409,
          `Solo se puede confirmar una entrega PENDIENTE (esta está ${entrega.estado})`
        );
      }

      // RN13: una publicación solo puede llegar a ENTREGADA desde RESERVADA
      // (nunca directamente desde DISPONIBLE)
      if (publicacion.estado !== 'RESERVADA') {
        throw new ErrorNegocio(
          409,
          `La publicación debe estar RESERVADA para entregarse (esta está ${publicacion.estado})`
        );
      }

      // La entrega pasa a COMPLETADA y queda registrada la fecha en que se concretó
      await conexion.query(
        "UPDATE entregas SET estado = 'COMPLETADA', fecha_entrega = NOW() WHERE id = ?",
        [entrega.id]
      );

      // RN14: al completarse la entrega, la publicación pasa automáticamente a ENTREGADA
      await conexion.query("UPDATE publicaciones SET estado = 'ENTREGADA' WHERE id = ?", [publicacion.id]);
    });

    res.status(200).json({ mensaje: 'Entrega confirmada correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al confirmar la entrega');
  }
});

module.exports = router;
