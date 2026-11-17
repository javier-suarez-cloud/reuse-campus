const mysql = require('mysql2');
const path = require('path');

// Las credenciales de MySQL se leen del archivo .env (no se sube a GitHub)
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (error) {
  // si no existe .env se usan los valores por defecto de abajo
}

const db = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'reuse_campus',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = db;
