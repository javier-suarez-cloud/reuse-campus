const express = require('express');
const cors = require('cors');
const db = require('./db'); // también carga el archivo .env
const authRoutes = require('./routes/auth');
const publicacionesRoutes = require('./routes/publicaciones');
const solicitudesRoutes = require('./routes/solicitudes');
const entregasRoutes = require('./routes/entregas');
const usuariosRoutes = require('./routes/usuarios');

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({ mensaje: 'API ReUse Campus funcionando' });
});

app.use('/api/auth', authRoutes);
app.use('/api/publicaciones', publicacionesRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/entregas', entregasRoutes);
app.use('/api/usuarios', usuariosRoutes);

// Ruta que no existe: responde 404 en JSON (en vez de la página HTML por defecto)
app.use((req, res) => {
  res.status(404).json({ mensaje: 'Ruta no encontrada' });
});

// Errores que no se controlaron en las rutas (por ejemplo, un JSON mal escrito en el cuerpo).
// Va siempre al final y tiene 4 parámetros: así Express sabe que es el manejador de errores.
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ mensaje: 'El cuerpo de la petición no es un JSON válido' });
  }

  if (error.status && error.status < 500) {
    return res.status(error.status).json({ mensaje: 'La petición no es válida' });
  }

  console.error(error);
  res.status(500).json({ mensaje: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
