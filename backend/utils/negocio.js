const db = require('../db');

// Error "esperado" de una regla de negocio: lleva el código HTTP y el mensaje para el usuario.
// Ejemplo: throw new ErrorNegocio(409, 'La publicación ya está reservada');
class ErrorNegocio extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

// Convierte un valor en un número entero positivo (o null si no sirve)
function leerId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Ejecuta varias consultas como UNA sola operación (transacción):
// o se guardan todos los cambios, o no se guarda ninguno.
//   - trabajo(conexion): función async que usa la conexión recibida para consultar.
//   - Si trabajo termina bien -> commit (se guarda todo).
//   - Si trabajo lanza un error -> rollback (se deshace todo) y el error sigue hacia arriba.
async function enTransaccion(trabajo) {
  const conexion = await db.promise().getConnection();

  try {
    await conexion.beginTransaction();
    const resultado = await trabajo(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    try {
      await conexion.rollback();
    } catch (errorRollback) {
      console.error(errorRollback);
    }
    throw error;
  } finally {
    // Devuelve la conexión al pool pase lo que pase
    conexion.release();
  }
}

// Responde al cliente según el tipo de error:
//   - ErrorNegocio -> el código y el mensaje de la regla (400, 403, 404, 409...)
//   - cualquier otro -> 500 con un mensaje genérico (el detalle queda en la consola)
function responderError(res, error, mensajeGenerico) {
  if (error instanceof ErrorNegocio) {
    return res.status(error.status).json({ mensaje: error.message });
  }

  console.error(error);
  res.status(500).json({ mensaje: mensajeGenerico });
}

module.exports = { ErrorNegocio, leerId, enTransaccion, responderError };
