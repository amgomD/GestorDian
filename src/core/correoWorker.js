const pLimit = require('p-limit');
const config = require('../config');
const { consultarSinCorreo, enviarCorreo } = require('../erp/erpClient');
const { ESTADOS } = require('./empresaWorker');
const logger = require('../logger/logger');

function crearCorreoWorker(empresa,intervaloMs) {
  const estado = {
    id: empresa.id,
    estadoActual: ESTADOS.IDLE,
    correosPendientes: 0,
    correosEnviados: 0,
    correosFallidos: 0,
    ultimaEjecucion: null,
    ultimoError: null,
    erroresConsecutivos: 0,
    pausadaPorErrores: false,
    tiempoProcesamientoMs: null,
    proximaEjecucion: null,
  };

  async function ejecutarCiclo() {
    if (estado.pausadaPorErrores) {
      logger.warn(`Correo pausado por ${estado.erroresConsecutivos} errores consecutivos.`, {
        empresa: empresa.id,
      });
      return;
    }

    estado.estadoActual = ESTADOS.PROCESANDO;
    estado.correosEnviados = 0;
    estado.correosFallidos = 0;

    logger.info('Inicio de ciclo de correo', { empresa: empresa.id });

    try {
      const resultado = await consultarSinCorreo(empresa.url);
      const sinCorreo = resultado.SinCorreo || [];
      estado.correosPendientes = sinCorreo.length;

      const limite = pLimit(config.maxCorreosConcurrentesPorEmpresa);

      await Promise.allSettled(
        sinCorreo.map((item) =>
          limite(async () => {
            try {
              if (!config.envioCorreoHabilitado) {
                logger.info(
                  `ENVIO_CORREO_HABILITADO=false — se hubiera enviado correo para FacSec=${item.Id}`,
                  { empresa: empresa.id }
                );
              } else {
                const respuesta = await enviarCorreo(empresa.url, item.Id);
                const resultadoEnvio = respuesta && respuesta[0];
                if (!resultadoEnvio || resultadoEnvio.FacEleStatus !== 'S') {
                  const mensaje = resultadoEnvio
                    ? resultadoEnvio.FacMensaje || `Estado no exitoso: ${resultadoEnvio.FacEleStatus}`
                    : 'Respuesta vacía del ERP';
                  throw new Error(mensaje);
                }
              }
              estado.correosEnviados += 1;
            } catch (errorItem) {
              estado.correosFallidos += 1;
              estado.ultimoError = errorItem.message;
              logger.warn(`Fallo al enviar correo: ${errorItem.message}`, { empresa: empresa.id });
            }
          })
        )
      );

      estado.estadoActual = ESTADOS.IDLE;
      estado.erroresConsecutivos = 0;

      logger.info(
        `Ciclo de correo finalizado. Pendientes=${estado.correosPendientes} Enviados=${estado.correosEnviados} Fallidos=${estado.correosFallidos}`,
        { empresa: empresa.id }
      );
    } catch (errorGeneral) {
      estado.estadoActual = ESTADOS.ERROR;
      estado.ultimoError = errorGeneral.message;
      estado.erroresConsecutivos += 1;

      logger.error(
        `Error general en ciclo de correo (${estado.erroresConsecutivos}/${config.maxErroresConsecutivosEmpresa}): ${errorGeneral.message}`,
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

module.exports = { crearCorreoWorker };