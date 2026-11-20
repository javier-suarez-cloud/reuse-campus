// Ejecutor de las pruebas automáticas:  npm test
//
// Qué hace, paso a paso:
//   1. Crea una base de datos de PRUEBA (reuse_campus_test) con las mismas tablas que la real.
//      Nunca toca la base real (reuse_campus).
//   2. Para cada grupo de pruebas: deja la base de prueba vacía, enciende el servidor en el puerto 3077,
//      ejecuta los archivos del grupo y apaga el servidor.
//   3. Al final borra la base de prueba y muestra un resumen.
// Termina con código distinto de 0 si alguna comprobación falla.
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const mysql = require('mysql2');

const RAIZ = path.join(__dirname, '..');
const NOMBRE_DB = 'reuse_campus_test';
const PUERTO = '3077';

try {
  process.loadEnvFile(path.join(RAIZ, '.env'));
} catch (error) {
  // sin .env se usan los valores por defecto de abajo
}

// Cada grupo se ejecuta sobre una base vacía. "@reiniciar" apaga y vuelve a encender el servidor
// (se usa para comprobar que los datos persisten en MySQL).
const GRUPOS = [
  ['01-publicaciones.js'],
  ['02-solicitudes.js'],
  ['03-aceptar-rechazar.js'],
  ['04-entregas-flujo-completo.js'],
  ['05-usuarios-administrador.js'],
  ['06-errores-y-sesion.js'],
  ['07-persistencia-parte-a.js', '@reiniciar', '08-persistencia-parte-b.js'],
  ['09-seed-datos-de-ejemplo.js'],
];

const entorno = { ...process.env, DB_NAME: NOMBRE_DB, PORT: PUERTO, PUERTO_PRUEBA: PUERTO };

function conectar() {
  return mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    multipleStatements: true,
  });
}

function consultar(conexion, sql) {
  return new Promise((ok, no) => conexion.query(sql, (e) => (e ? no(e) : ok())));
}

// Crea la base de prueba vacía a partir del mismo script SQL del proyecto
async function prepararBase() {
  const script = fs
    .readFileSync(path.join(RAIZ, '..', 'database', 'reuse_campus.sql'), 'utf8')
    .replace(/reuse_campus\b/g, NOMBRE_DB);
  const conexion = conectar();
  await consultar(conexion, `DROP DATABASE IF EXISTS ${NOMBRE_DB};` + script);
  conexion.end();
}

async function borrarBase() {
  const conexion = conectar();
  await consultar(conexion, `DROP DATABASE IF EXISTS ${NOMBRE_DB};`);
  conexion.end();
}

async function esperarServidor() {
  for (let intento = 0; intento < 40; intento++) {
    try {
      const r = await fetch(`http://localhost:${PUERTO}/`);
      if (r.ok) return;
    } catch (error) {
      // todavía no está listo
    }
    await new Promise((ok) => setTimeout(ok, 250));
  }
  throw new Error('El servidor de prueba no arrancó');
}

async function encenderServidor() {
  const proceso = spawn(process.execPath, ['server.js'], { cwd: RAIZ, env: entorno, stdio: 'ignore' });
  await esperarServidor();
  return proceso;
}

function apagarServidor(proceso) {
  return new Promise((ok) => {
    proceso.once('exit', ok);
    proceso.kill();
  });
}

function correrArchivo(archivo) {
  console.log(`\n=== ${archivo} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, archivo)], { cwd: RAIZ, env: entorno, encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const total = /TODO OK \((\d+) comprobaciones\)/.exec(r.stdout) || /de (\d+)\s*$/m.exec(r.stdout);
  return { archivo, ok: r.status === 0, comprobaciones: total ? Number(total[1]) : 0 };
}

(async () => {
  const resultados = [];

  for (const grupo of GRUPOS) {
    await prepararBase();
    let servidor = await encenderServidor();

    for (const paso of grupo) {
      if (paso === '@reiniciar') {
        console.log('\n--- reiniciando el servidor (los datos deben seguir en MySQL) ---');
        await apagarServidor(servidor);
        servidor = await encenderServidor();
      } else {
        resultados.push(correrArchivo(paso));
      }
    }

    await apagarServidor(servidor);
  }

  await borrarBase();

  console.log('\n================ RESUMEN ================');
  for (const r of resultados) {
    console.log(`${r.ok ? 'OK    ' : 'FALLÓ '} ${r.archivo} (${r.comprobaciones} comprobaciones)`);
  }
  const total = resultados.reduce((suma, r) => suma + r.comprobaciones, 0);
  const fallidos = resultados.filter((r) => !r.ok).length;
  console.log(fallidos === 0 ? `\nTODAS LAS PRUEBAS PASARON: ${total} comprobaciones en ${resultados.length} archivos.` : `\n${fallidos} archivo(s) con fallos.`);
  process.exit(fallidos === 0 ? 0 : 1);
})().catch(async (error) => {
  console.error('Error en el ejecutor de pruebas:', error.message);
  try { await borrarBase(); } catch (e) { /* nada que borrar */ }
  process.exit(1);
});
