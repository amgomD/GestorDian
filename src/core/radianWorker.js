const config = require('../config');
const { sincronizarRadian } = require('../erp/erpClient');
const { ESTADOS } = require('./empresaWorker');
const logger = require('../logger/logger');

function crearRadianWorker(empresa,intervaloMs) {
  const estado = {
    id: empresa.id,
    estadoActual: ESTADOS.IDLE,
    ultimaEjecucion: null,
    ultimoResultado: null,   // texto completo del "Mensaje" del ERP
    ultimoCargados: null,    // número extraído del mensaje, si se pudo parsear
    ultimoError: null,
     tiempoProcesamientoMs: null,
       ultimaEjecucion: null,
    proximaEjecucion: null,
    erroresConsecutivos: 0,
    pausadaPorErrores: false,
  };

  function parsearCargados(mensaje) {
    if (!mensaje) return null;
    const match = mensaje.match(/se cargaron:\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  async function ejecutarCiclo() {
    if (estado.pausadaPorErrores) {
      logger.warn(`Radian pausado por ${estado.erroresConsecutivos} errores consecutivos.`, {
        empresa: empresa.id,
      });
      return;
    }

    estado.estadoActual = ESTADOS.PROCESANDO;
    logger.info('Inicio sincronización Radian', { empresa: empresa.id });

    try {
      const resultado = await sincronizarRadian(empresa.url);
      estado.ultimoResultado = resultado.Mensaje || null;
      estado.ultimoCargados = parsearCargados(resultado.Mensaje);
      estado.estadoActual = ESTADOS.IDLE;
      estado.erroresConsecutivos = 0;
      estado.ultimoError = null;

      logger.info(`Radian sincronizado: ${resultado.Mensaje}`, { empresa: empresa.id });
    } catch (error) {
      estado.estadoActual = ESTADOS.ERROR;
      estado.ultimoError = error.message;
      estado.erroresConsecutivos += 1;

      logger.error(
        `Error en sincronización Radian (${estado.erroresConsecutivos}/${config.maxErroresConsecutivosEmpresa}): ${error.message}`,
        { empresa: empresa.id }
      );

      if (estado.erroresConsecutivos >= config.maxErroresConsecutivosEmpresa) {
        estado.pausadaPorErrores = true;
        estado.estadoActual = ESTADOS.DETENIDO;
      }
    } finally {
  estado.ultimaEjecucion = new Date().toISOString();
  estado.proximaEjecucion = estado.pausadaPorErrores
    ? null // si quedó pausada, no hay próxima ejecución programada
    : new Date(Date.now() + intervaloMs).toISOString();
  estado.tiempoProcesamientoMs = Date.now() - inicio; // (solo en empresaWorker)
}
  }

  function getEstado() {
    return { ...estado };
  }

  return { ejecutarCiclo, getEstado };
}

module.exports = { crearRadianWorker };