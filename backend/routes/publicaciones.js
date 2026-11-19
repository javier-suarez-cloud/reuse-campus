const express = require('express');
const db = require('../db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

const MODALIDADES = ['DONACION', 'INTERCAMBIO'];
const ESTADOS = ['DISPONIBLE', 'RESERVADA', 'ENTREGADA', 'CANCELADA'];

// RN01: todas las rutas exigen sesión iniciada
router.use(verificarToken);

// Consulta base: incluye el nombre del propietario para mostrarlo en pantalla
const SQL_BASE = `
  SELECT p.id, p.titulo, p.descripcion, p.categoria, p.modalidad, p.estado,
         p.fecha_publicacion, p.usuario_id, u.nombre AS propietario
  FROM publicaciones p
  JOIN usuarios u ON u.id = p.usuario_id`;

// Valida el cuerpo de POST y PUT. Devuelve un mensaje de error o null si todo está bien.
function validarDatos(cuerpo) {
  const { titulo, descripcion, categoria, modalidad } = cuerpo;

  if (!titulo || !descripcion || !categoria || !modalidad) {
    return 'Título, descripción, categoría y modalidad son obligatorios';
  }
  if (typeof titulo !== 'string' || titulo.trim().length === 0 || titulo.length > 150) {
    return 'El título es obligatorio y puede tener hasta 150 caracteres';
  }
  if (typeof categoria !== 'string' || categoria.trim().length === 0 || categoria.length > 50) {
    return 'La categoría es obligatoria y puede tener hasta 50 caracteres';
  }
  if (typeof descripcion !== 'string' || descripcion.trim().length === 0) {
    return 'La descripción es obligatoria';
  }
  if (!MODALIDADES.includes(modalidad)) {
    return 'La modalidad debe ser DONACION o INTERCAMBIO';
  }
  return null;
}

// Valida que el :id de la URL sea un número entero positivo
function idValido(texto) {
  return /^\d+$/.test(texto) && Number(texto) > 0;
}

// GET /api/publicaciones  -> lista (filtros opcionales: ?estado=, ?modalidad=, ?categoria=, ?propias=1)
router.get('/', (req, res) => {
  const { estado, modalidad, categoria, propias } = req.query;
  const condiciones = [];
  const valores = [];

  if (estado) {
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ mensaje: 'El estado indicado no es válido' });
    }
    condiciones.push('p.estado = ?');
    valores.push(estado);
  } else {
    // Por defecto no se muestran las canceladas (RN17: se conservan, pero no se listan)
    condiciones.push("p.estado <> 'CANCELADA'");
  }

  if (modalidad) {
    if (!MODALIDADES.includes(modalidad)) {
      return res.status(400).json({ mensaje: 'La modalidad indicada no es válida' });
    }
    condiciones.push('p.modalidad = ?');
    valores.push(modalidad);
  }

  if (categoria) {
    condiciones.push('p.categoria = ?');
    valores.push(categoria);
  }

  if (propias === '1') {
    condiciones.push('p.usuario_id = ?');
    valores.push(req.usuario.id);
  }

  const sql = `${SQL_BASE} WHERE ${condiciones.join(' AND ')} ORDER BY p.fecha_publicacion DESC`;

  db.query(sql, valores, (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al obtener las publicaciones' });
    }
    res.status(200).json(resultados);
  });
});

// GET /api/publicaciones/:id  -> detalle de una publicación
router.get('/:id', (req, res) => {
  if (!idValido(req.params.id)) {
    return res.status(400).json({ mensaje: 'El id de la publicación no es válido' });
  }

  db.query(`${SQL_BASE} WHERE p.id = ?`, [req.params.id], (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al obtener la publicación' });
    }
    if (resultados.length === 0) {
      return res.status(404).json({ mensaje: 'La publicación no existe' });
    }
    res.status(200).json(resultados[0]);
  });
});

// POST /api/publicaciones  -> crea una publicación (RN02: el propietario es quien tiene la sesión)
router.post('/', (req, res) => {
  const mensajeError = validarDatos(req.body);
  if (mensajeError) {
    return res.status(400).json({ mensaje: mensajeError });
  }

  const { titulo, descripcion, categoria, modalidad } = req.body;
  // El propietario sale del token, nunca del cuerpo de la petición
  const sql = `INSERT INTO publicaciones (titulo, descripcion, categoria, modalidad, usuario_id)
               VALUES (?, ?, ?, ?, ?)`;

  db.query(
    sql,
    [titulo.trim(), descripcion.trim(), categoria.trim(), modalidad, req.usuario.id],
    (error, resultado) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ mensaje: 'Error al crear la publicación' });
      }
      res.status(201).json({ mensaje: 'Publicación creada correctamente', id: resultado.insertId });
    }
  );
});

// Busca la publicación y comprueba que existe y que el usuario es su propietario.
// Si todo está bien llama a continuar(publicacion); si no, responde el error.
function conPropietario(req, res, continuar) {
  if (!idValido(req.params.id)) {
    return res.status(400).json({ mensaje: 'El id de la publicación no es válido' });
  }

  db.query('SELECT * FROM publicaciones WHERE id = ?', [req.params.id], (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al buscar la publicación' });
    }
    if (resultados.length === 0) {
      return res.status(404).json({ mensaje: 'La publicación no existe' });
    }

    const publicacion = resultados[0];
    if (publicacion.usuario_id !== req.usuario.id) {
      return res.status(403).json({ mensaje: 'Solo el propietario puede modificar esta publicación' });
    }
    continuar(publicacion);
  });
}

// PUT /api/publicaciones/:id  -> edita una publicación propia que siga DISPONIBLE
router.put('/:id', (req, res) => {
  const mensajeError = validarDatos(req.body);
  if (mensajeError) {
    return res.status(400).json({ mensaje: mensajeError });
  }

  conPropietario(req, res, (publicacion) => {
    if (publicacion.estado !== 'DISPONIBLE') {
      return res.status(409).json({ mensaje: 'Solo se pueden editar publicaciones DISPONIBLES' });
    }

    const { titulo, descripcion, categoria, modalidad } = req.body;
    const sql = `UPDATE publicaciones
                 SET titulo = ?, descripcion = ?, categoria = ?, modalidad = ?
                 WHERE id = ?`;

    db.query(
      sql,
      [titulo.trim(), descripcion.trim(), categoria.trim(), modalidad, publicacion.id],
      (error) => {
        if (error) {
          console.error(error);
          return res.status(500).json({ mensaje: 'Error al actualizar la publicación' });
        }
        res.status(200).json({ mensaje: 'Publicación actualizada correctamente' });
      }
    );
  });
});

// PATCH /api/publicaciones/:id/cancelar  -> RN17: se cancela, no se borra
router.patch('/:id/cancelar', (req, res) => {
  conPropietario(req, res, (publicacion) => {
    if (publicacion.estado !== 'DISPONIBLE') {
      return res.status(409).json({ mensaje: 'Solo se pueden cancelar publicaciones DISPONIBLES' });
    }

    db.query("UPDATE publicaciones SET estado = 'CANCELADA' WHERE id = ?", [publicacion.id], (error) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ mensaje: 'Error al cancelar la publicación' });
      }
      res.status(200).json({ mensaje: 'Publicación cancelada correctamente' });
    });
  });
});

module.exports = router;
