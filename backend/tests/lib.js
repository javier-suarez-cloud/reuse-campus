// Utilidades compartidas por las pruebas automáticas.
// Las pruebas llaman a la API REAL (servidor encendido por tests/ejecutar.js) y revisan la base de PRUEBA.
const path = require('path');
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');

// Se leen las credenciales de MySQL del mismo .env del backend
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (error) {
  // sin .env se usan los valores por defecto de abajo
}

const PUERTO = process.env.PUERTO_PRUEBA ?? '3077';
const BASE = `http://localhost:${PUERTO}/api`;
const BASE_RAIZ = `http://localhost:${PUERTO}`;
const NOMBRE_DB = process.env.DB_NAME ?? '';

// Seguridad: las pruebas crean y borran datos, así que SOLO pueden correr contra una base cuyo nombre termine en "_test"
if (!NOMBRE_DB.endsWith('_test')) {
  console.error('Las pruebas solo se ejecutan con la base de prueba (reuse_campus_test). Usa: npm test');
  process.exit(1);
}

let fallos = 0;
let total = 0;

function check(nombre, cond, extra = '') {
  total++;
  console.log((cond ? 'PASS ' : 'FAIL ') + nombre + (cond ? '' : '  -> ' + extra));
  if (!cond) fallos++;
}

// Llama a la API con JSON. Devuelve { status, data }.
async function http(metodo, ruta, cuerpo, token) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (e) { /* sin cuerpo */ }
  return { status: r.status, data };
}

// Conexión directa a la base de prueba para preparar datos y revisar el resultado
function conectarDb() {
  const conn = mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: NOMBRE_DB,
  });
  const q = (sql, p) => new Promise((ok, no) => conn.query(sql, p, (e, r) => (e ? no(e) : ok(r))));
  return { q, end: () => conn.end() };
}

// Registra un usuario (si ya existe no pasa nada) e inicia sesión. Devuelve { token, usuario }.
async function usuario(nombre, correo) {
  await http('POST', '/auth/registro', { nombre, correo, password: '123456' });
  return (await http('POST', '/auth/login', { correo, password: '123456' })).data;
}

async function crearPublicacion(token, titulo = 'Libro de prueba') {
  const r = await http('POST', '/publicaciones', { titulo, descripcion: 'desc', categoria: 'Libros', modalidad: 'DONACION' }, token);
  return r.data.id;
}

// Firma un token con el mismo secreto del servidor (para probar tokens vencidos o de usuarios inexistentes)
function firmarToken(payload, opciones = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET ?? 'secreto-solo-para-desarrollo', opciones);
}

function terminar() {
  console.log(fallos === 0 ? `\nTODO OK (${total} comprobaciones)` : `\n${fallos} FALLO(S) de ${total}`);
  // Se espera un instante antes de salir para que fetch cierre sus conexiones
  // (en Windows, salir de golpe puede cortar el proceso con un error de Node).
  setTimeout(() => process.exit(fallos === 0 ? 0 : 1), 300);
}

module.exports = { check, http, conectarDb, usuario, crearPublicacion, firmarToken, terminar, BASE_RAIZ };
