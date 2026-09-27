const { iniciarServidor } = require('./api/server');
const { cargarEmpresas } = require('./config/empresasLoader');
const { crearOrquestador } = require('./core/orquestador');
const { cargarEstadoPrevio } = require('./state/estadoManager');
const logger = require('./logger/logger');

logger.info('Iniciando procesador de facturación DIAN...');

let empresas;
try {
  empresas = cargarEmpresas();
  logger.info(`Empresas cargadas correctamente: ${empresas.length}`);
} catch (error) {
  logger.error(`Error crítico al cargar empresas: ${error.message}`);
  process.exit(1);
}

const estadoPrevio = cargarEstadoPrevio();
if (estadoPrevio) {
  logger.info(`Estado previo encontrado (guardado en: ${estadoPrevio.guardadoEn}).`);
} else {
  logger.info('No hay estado previo (primera ejecución o archivo no encontrado).');
}

const orquestador = crearOrquestador(empresas);

iniciarServidor(orquestador);
orquestador.iniciar();

process.on('SIGINT', () => {
  logger.info('Señal SIGINT recibida. Deteniendo schedulers...');
  orquestador.detener();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Señal SIGTERM recibida. Deteniendo schedulers...');
  orquestador.detener();
  process.exit(0);
});

process.on('unhandledRejection', (razon) => {
  logger.error(`Promesa rechazada sin manejar: ${razon}`);
});

process.on('uncaughtException', (error) => {
  logger.error(`Excepción no capturada. Terminando proceso: ${error.message}`);
  orquestador.detener();
  process.exit(1);
});