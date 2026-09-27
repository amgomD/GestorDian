const pLimit = require('p-limit');
const config = require('../config');
const { crearEmpresaWorker } = require('./empresaWorker');
const { crearRadianWorker } = require('./radianWorker');
const { crearCorreoWorker } = require('./correoWorker');
const { guardarEstado } = require('../state/estadoManager');
const logger = require('../logger/logger');

function crearOrquestador(empresas) {
const unidades = empresas.map((empresa) => ({
  empresa,
  facturaWorker: crearEmpresaWorker(empresa, config.intervaloCicloFacturasMs),
  radianWorker: crearRadianWorker(empresa, config.intervaloCicloRadianMs),
  correoWorker: crearCorreoWorker(empresa, config.intervaloCicloCorreoMs),
}));

  // Límites GLOBALES compartidos por tipo de proceso: cuántas empresas
  // pueden estar EJECUTANDO ese proceso al mismo tiempo. Ya no controla
  // "rondas" — solo evita saturación si varias empresas coinciden en
  // el mismo instante por casualidad.
  const limiteFacturas = pLimit(config.maxEmpresasConcurrentes);
  const limiteRadian = pLimit(config.maxEmpresasConcurrentes);
  const limiteCorreo = pLimit(config.maxEmpresasConcurrentes);

  let detenido = false;

  /**
   * Scheduler INDEPENDIENTE por empresa y por proceso: ejecuta su ciclo,
   * espera su propio intervalo, y se reprograma — sin importar en qué
   * punto van las demás empresas.
   */
  function iniciarSchedulerIndividual(nombreProceso, ejecutarCicloFn, limite, intervaloMs, idEmpresa) {
    async function ciclo() {
      if (detenido) return;

      try {
        await limite(() => ejecutarCicloFn());
      } catch (error) {
        logger.error(`[${nombreProceso}] Error inesperado en ciclo de ${idEmpresa}: ${error.message}`);
      }

      // Estado persistido tras CADA ciclo individual, no solo al final
      // de una ronda global (que ya no existe como concepto).
      guardarEstado(getEstadoGeneral());

      if (!detenido) {
        setTimeout(ciclo, intervaloMs);
      }
    }

    ciclo();
  }

  function iniciar() {
    unidades.forEach(({ empresa, facturaWorker, radianWorker, correoWorker }) => {
      iniciarSchedulerIndividual(
        'facturas',
        () => facturaWorker.ejecutarCiclo(),
        limiteFacturas,
        config.intervaloCicloFacturasMs,
        empresa.id
      );
      iniciarSchedulerIndividual(
        'radian',
        () => radianWorker.ejecutarCiclo(),
        limiteRadian,
        config.intervaloCicloRadianMs,
        empresa.id
      );
      iniciarSchedulerIndividual(
        'correo',
        () => correoWorker.ejecutarCiclo(),
        limiteCorreo,
        config.intervaloCicloCorreoMs,
        empresa.id
      );
    });

    logger.info(
      `Schedulers independientes iniciados para ${unidades.length} empresas ` +
      `(facturas, radian, correo — cada una con su propio reloj).`
    );
  }

  function detener() {
    detenido = true;
  }

  function getEstadoGeneral() {
    return unidades.map(({ empresa, facturaWorker, radianWorker, correoWorker }) => {
      const facturas = facturaWorker.getEstado();
      const radian = radianWorker.getEstado();
      const correo = correoWorker.getEstado();

      return {
        id: empresa.id,
        tipo: empresa.tipo,
        url: empresa.url,
        nombreEmpresa: facturas.nombreEmpresa || null,
        nit: facturas.nit || null,
        facturas,
        radian,
        correo,
      };
    });
  }

  return { iniciar, detener, getEstadoGeneral };
}

module.exports = { crearOrquestador };