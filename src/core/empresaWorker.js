const pLimit = require('p-limit');
const config = require('../config');
const { consultarFacturasPendientes, enviarFactura } = require('../erp/erpClient');
const logger = require('../logger/logger');

const ESTADOS = {
  IDLE: 'idle',
  PROCESANDO: 'procesando',
  DETENIDO: 'detenido',
  ERROR: 'error',
};

function crearEmpresaWorker(empresa,intervaloMs) {
   const estado = {
    id: empresa.id,
    tipo: empresa.tipo,
    url: empresa.url,
    nombreEmpresa: null,
    nit: null,
    estadoActual: ESTADOS.IDLE,
    facturasPendientes: 0,
    facturasProcesadas: 0,
    facturasFallidas: 0,
    ultimaEjecucion: null,
    proximaEjecucion: null,   // NUEVO: timestamp ISO de la próxima ejecución estimada
    ultimoError: null,
    tiempoProcesamientoMs: null,
    erroresConsecutivos: 0,
    pausadaPorErrores: false,
  };

  async function ejecutarCiclo() {
    if (estado.pausadaPorErrores) {
      logger.warn(
        `Empresa pausada por ${estado.erroresConsecutivos} errores consecutivos. Ciclo omitido.`,
        { empresa: empresa.id }
      );
      return;
    }

    const inicio = Date.now();
    estado.estadoActual = ESTADOS.PROCESANDO;
    estado.ultimoError = null;
    // Reinicio de contadores AL INICIO del ciclo (antes se hacía al final).
    // Esto es lo que permite que el panel vea progreso real mientras avanza.
    estado.facturasProcesadas = 0;
    estado.facturasFallidas = 0;

    logger.info('Inicio de ciclo', { empresa: empresa.id });

    try {

          const hoy = new Date();

    // Primer día del mes actual
    const fechaDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    // Último día del mes actual
    const fechaHasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);

    // Formato YYYY-MM-DD
    const formatearFecha = (fecha) => {
        const año = fecha.getFullYear();
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const dia = String(fecha.getDate()).padStart(2, '0');

        return `${año}-${mes}-${dia}`;
    };


      const resultado = await consultarFacturasPendientes(empresa.url, {
        FechaDesde: formatearFecha(fechaDesde),
        FechaHasta: formatearFecha(fechaHasta),
        LlenarDetalle: 'S',
      });

      estado.nombreEmpresa = resultado.Empresa || null;
      estado.nit = resultado.Nit || null;

      const facturas = resultado.Facturas || [];
      estado.facturasPendientes = facturas.length;

      const limiteFacturas = pLimit(config.maxFacturasConcurrentesPorEmpresa);

      await Promise.allSettled(
        facturas.map((factura) =>
          limiteFacturas(async () => {
            try {
              if (!config.envioRealHabilitado) {
                logger.info(
                  `ENVIO_REAL_HABILITADO=false — se hubiera enviado la factura con FacSec=${factura.Id}`,
                  { empresa: estado.nit || empresa.id }
                );
              } else {
                const respuestaEnvio = await enviarFactura(empresa.url, factura.Id);
                const resultadoEnvio = respuestaEnvio && respuestaEnvio[0];

                if (!resultadoEnvio || resultadoEnvio.FacEleStatus !== 'S') {
                  const mensaje = resultadoEnvio
                    ? resultadoEnvio.FacMensaje || `Estado no exitoso: ${resultadoEnvio.FacEleStatus}`
                    : 'Respuesta vacía del ERP';
                  throw new Error(mensaje);
                }
              }
              // Actualización INCREMENTAL: se refleja apenas termina ESTA factura,
              // no cuando terminan todas.
              estado.facturasProcesadas += 1;
            } catch (errorFactura) {
              estado.facturasFallidas += 1;
              estado.ultimoError = errorFactura.message;
              logger.warn(`Fallo al procesar una factura: ${errorFactura.message}`, {
                empresa: estado.nit || empresa.id,
              });
            }
          })
        )
      );

      estado.estadoActual = ESTADOS.IDLE;
      estado.erroresConsecutivos = 0;

      logger.info(
        `Ciclo finalizado. Pendientes=${estado.facturasPendientes} Procesadas=${estado.facturasProcesadas} Fallidas=${estado.facturasFallidas}`,
        { empresa: estado.nit || empresa.id }
      );
    } catch (errorGeneral) {
      estado.estadoActual = ESTADOS.ERROR;
      estado.ultimoError = errorGeneral.message;
      estado.erroresConsecutivos += 1;

      logger.error(
        `Error general en el ciclo (${estado.erroresConsecutivos}/${config.maxErroresConsecutivosEmpresa} consecutivos): ${errorGeneral.message}`,
        { empresa: empresa.id }
      );

      if (estado.erroresConsecutivos >= config.maxErroresConsecutivosEmpresa) {
        estado.pausadaPorErrores = true;
        estado.estadoActual = ESTADOS.DETENIDO;
        logger.error(
          `Empresa pausada automáticamente tras ${estado.erroresConsecutivos} errores consecutivos.`,
          { empresa: empresa.id }
        );
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

module.exports = { crearEmpresaWorker, ESTADOS };