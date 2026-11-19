const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/registro  -> crea un usuario con la contraseña encriptada
router.post('/registro', (req, res) => {
  // "?? {}" evita un error 500 si la petición llega sin cuerpo JSON
  const { nombre, correo, password } = req.body ?? {};

  if (!nombre || !correo || !password) {
    return res.status(400).json({ mensaje: 'Nombre, correo y contraseña son obligatorios' });
  }

  if (!/^\S+@\S+\.\S+$/.test(correo)) {
    return res.status(400).json({ mensaje: 'El correo no tiene un formato válido' });
  }

  if (password.length < 6) {
    return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 6 caracteres' });
  }

  db.query('SELECT id FROM usuarios WHERE correo = ?', [correo], (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al registrar el usuario' });
    }

    if (resultados.length > 0) {
      return res.status(409).json({ mensaje: 'Ya existe un usuario con ese correo' });
    }

    // El 10 es el costo del hash: cuántas veces se repite el cifrado
    bcrypt.hash(password, 10, (errorHash, passwordHash) => {
      if (errorHash) {
        console.error(errorHash);
        return res.status(500).json({ mensaje: 'Error al registrar el usuario' });
      }

      // El rol NO viene del cliente: todo registro nace como USUARIO
      const sql = 'INSERT INTO usuarios (nombre, correo, password) VALUES (?, ?, ?)';

      db.query(sql, [nombre, correo, passwordHash], (errorInsert, resultado) => {
        if (errorInsert) {
          console.error(errorInsert);
          return res.status(500).json({ mensaje: 'Error al registrar el usuario' });
        }

        res.status(201).json({
          mensaje: 'Usuario registrado correctamente',
          id: resultado.insertId
        });
      });
    });
  });
});

// POST /api/auth/login  -> valida correo y contraseña y entrega un token
router.post('/login', (req, res) => {
  const { correo, password } = req.body ?? {};

  if (!correo || !password) {
    return res.status(400).json({ mensaje: 'Correo y contraseña son obligatorios' });
  }

  db.query('SELECT * FROM usuarios WHERE correo = ?', [correo], (error, resultados) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ mensaje: 'Error al iniciar sesión' });
    }

    // Mismo mensaje si el correo no existe o la clave es incorrecta (no da pistas)
    if (resultados.length === 0) {
      return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos' });
    }

    const usuario = resultados[0];

    if (usuario.estado !== 'ACTIVO') {
      return res.status(403).json({ mensaje: 'Tu cuenta está inactiva' });
    }

    bcrypt.compare(password, usuario.password, (errorCompare, coincide) => {
      if (errorCompare) {
        console.error(errorCompare);
        return res.status(500).json({ mensaje: 'Error al iniciar sesión' });
      }

      if (!coincide) {
        return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos' });
      }

      // El token guarda id y rol; el backend lo revisa en cada petición protegida
      const token = jwt.sign(
        { id: usuario.id, rol: usuario.rol },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.status(200).json({
        token,
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          correo: usuario.correo,
          rol: usuario.rol
        }
      });
    });
  });
});

module.exports = router;
