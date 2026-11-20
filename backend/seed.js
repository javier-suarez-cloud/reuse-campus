// Carga datos de EJEMPLO para probar la aplicación sin tener que crear todo a mano.
// Uso:  npm run seed
// No borra nada: si el administrador de ejemplo ya existe, no hace nada.
const bcrypt = require('bcryptjs');
const db = require('./db');
const { enTransaccion } = require('./utils/negocio');

const CLAVE_ADMIN = 'Admin123';
const CLAVE_USUARIOS = 'Usuario123';

async function cargar() {
  const [existentes] = await db.promise().query("SELECT id FROM usuarios WHERE correo = 'admin@reuse.cl'");

  if (existentes.length > 0) {
    console.log('Los datos de ejemplo ya existen: no se cambió nada.');
    return;
  }

  const hashAdmin = await bcrypt.hash(CLAVE_ADMIN, 10);
  const hashUsuarios = await bcrypt.hash(CLAVE_USUARIOS, 10);

  await enTransaccion(async (c) => {
    // ---- Usuarios (uno es administrador y otro está INACTIVO)
    const nuevoUsuario = async (nombre, correo, hash, rol = 'USUARIO', estado = 'ACTIVO') => {
      const [r] = await c.query(
        'INSERT INTO usuarios (nombre, correo, password, rol, estado) VALUES (?, ?, ?, ?, ?)',
        [nombre, correo, hash, rol, estado]
      );
      return r.insertId;
    };
    await nuevoUsuario('Admin ReUse', 'admin@reuse.cl', hashAdmin, 'ADMINISTRADOR');
    const ana = await nuevoUsuario('Ana Torres', 'ana@reuse.cl', hashUsuarios);
    const beto = await nuevoUsuario('Beto Rojas', 'beto@reuse.cl', hashUsuarios);
    const carla = await nuevoUsuario('Carla Soto', 'carla@reuse.cl', hashUsuarios);
    await nuevoUsuario('Diego Pino', 'diego@reuse.cl', hashUsuarios, 'USUARIO', 'INACTIVO');

    // ---- Publicaciones en distintos estados
    const nuevaPublicacion = async (usuarioId, titulo, descripcion, categoria, modalidad, estado) => {
      const [r] = await c.query(
        'INSERT INTO publicaciones (titulo, descripcion, categoria, modalidad, estado, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
        [titulo, descripcion, categoria, modalidad, estado, usuarioId]
      );
      return r.insertId;
    };
    const nuevaSolicitud = async (publicacionId, solicitanteId, mensaje, estado) => {
      const [r] = await c.query(
        'INSERT INTO solicitudes (publicacion_id, solicitante_id, mensaje, estado) VALUES (?, ?, ?, ?)',
        [publicacionId, solicitanteId, mensaje, estado]
      );
      return r.insertId;
    };
    const nuevaEntrega = async (publicacionId, solicitudId, propietarioId, receptorId, estado) => {
      await c.query(
        `INSERT INTO entregas (publicacion_id, solicitud_id, propietario_id, receptor_id, estado, fecha_entrega)
         VALUES (?, ?, ?, ?, ?, ${estado === 'COMPLETADA' ? 'NOW()' : 'NULL'})`,
        [publicacionId, solicitudId, propietarioId, receptorId, estado]
      );
    };

    // 1) DISPONIBLE con dos solicitudes PENDIENTES (sirve para probar aceptar y rechazar)
    const calculadora = await nuevaPublicacion(ana, 'Calculadora científica Casio', 'Funciona perfecto, con tapa.', 'Tecnología', 'DONACION', 'DISPONIBLE');
    await nuevaSolicitud(calculadora, beto, 'La necesito para Cálculo II.', 'PENDIENTE');
    await nuevaSolicitud(calculadora, carla, 'Me serviría para el semestre.', 'PENDIENTE');

    // 2) RESERVADA: una solicitud ACEPTADA, otra RECHAZADA y una entrega PENDIENTE (sirve para confirmar la entrega)
    const libro = await nuevaPublicacion(ana, 'Libro Cálculo de una variable', 'Edición reciente, sin rayas.', 'Libros', 'INTERCAMBIO', 'RESERVADA');
    const aceptada = await nuevaSolicitud(libro, beto, 'Te lo cambio por mi libro de Física.', 'ACEPTADA');
    await nuevaSolicitud(libro, carla, 'Lo busco hace tiempo.', 'RECHAZADA');
    await nuevaEntrega(libro, aceptada, ana, beto, 'PENDIENTE');

    // 3) ENTREGADA: flujo terminado, con entrega COMPLETADA
    const arduino = await nuevaPublicacion(beto, 'Arduino UNO con cables', 'Incluye cables y protoboard.', 'Electrónica', 'DONACION', 'ENTREGADA');
    const aceptadaArduino = await nuevaSolicitud(arduino, ana, 'Es para mi proyecto de electrónica.', 'ACEPTADA');
    await nuevaEntrega(arduino, aceptadaArduino, beto, ana, 'COMPLETADA');

    // 4) DISPONIBLE sin solicitudes
    await nuevaPublicacion(carla, 'Mochila escolar', 'Poco uso, color azul.', 'Accesorios', 'DONACION', 'DISPONIBLE');

    // 5) CANCELADA (no aparece en el listado normal)
    await nuevaPublicacion(carla, 'Apuntes de Programación Web', 'Apuntes del semestre pasado.', 'Libros', 'INTERCAMBIO', 'CANCELADA');

    // 6) DISPONIBLE con una solicitud CANCELADA por quien la hizo
    const herramientas = await nuevaPublicacion(beto, 'Kit de herramientas básico', 'Martillo, alicate y destornilladores.', 'Herramientas', 'DONACION', 'DISPONIBLE');
    await nuevaSolicitud(herramientas, carla, 'Ya no me hace falta, cancelo.', 'CANCELADA');
  });

  console.log('Datos de ejemplo cargados: 5 usuarios, 6 publicaciones, 6 solicitudes y 2 entregas.');
  console.log(`Administrador: admin@reuse.cl / ${CLAVE_ADMIN}`);
  console.log(`Usuarios:      ana@reuse.cl, beto@reuse.cl, carla@reuse.cl / ${CLAVE_USUARIOS}`);
  console.log(`Cuenta inactiva (para probar el bloqueo): diego@reuse.cl / ${CLAVE_USUARIOS}`);
}

cargar()
  .catch((error) => {
    console.error('Error al cargar los datos de ejemplo:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
