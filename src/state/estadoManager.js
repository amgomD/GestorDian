const fs = require('fs');
const path = require('path');
const logger = require('../logger/logger');

const RUTA_ESTADO = path.resolve(process.cwd(), 'data', 'estado.json');

function guardarEstado(estadoEmpresas) {
  const contenido = {
    guardadoEn: new Date().toISOString(),
    empresas: estadoEmpresas,
  };

  const rutaTemporal = `${RUTA_ESTADO}.tmp`;

  try {
    fs.writeFileSync(rutaTemporal, JSON.stringify(contenido, null, 2), 'utf-8');
    fs.renameSync(rutaTemporal, RUTA_ESTADO);
  } catch (error) {
    logger.error(`Error al guardar estado: ${error.message}`);
  }
}

function cargarEstadoPrevio() {
  if (!fs.existsSync(RUTA_ESTADO)) {
    return null;
  }

  try {
    const contenido = fs.readFileSync(RUTA_ESTADO, 'utf-8');
    return JSON.parse(contenido);
  } catch (error) {
    logger.error(`Estado previo corrupto o ilegible, se ignora: ${error.message}`);
    return null;
  }
}

module.exports = { guardarEstado, cargarEstadoPrevio };