const express = require('express');
const cors = require('cors');
const db = require('./db'); // también carga el archivo .env
const authRoutes = require('./routes/auth');
const publicacionesRoutes = require('./routes/publicaciones');

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({ mensaje: 'API ReUse Campus funcionando' });
});

app.use('/api/auth', authRoutes);
app.use('/api/publicaciones', publicacionesRoutes);

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
