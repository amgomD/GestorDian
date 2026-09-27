const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const config = require('../config');

const RUTA_LOGS = path.resolve(process.cwd(), 'logs');

const formatoConsola = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, empresa, ...resto }) => {
    const contexto = empresa ? `[${empresa}] ` : '';
    const extra = Object.keys(resto).length ? JSON.stringify(resto) : '';
    return `${timestamp} [${level.toUpperCase()}] ${contexto}${message} ${extra}`.trim();
  })
);

const formatoArchivo = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const transporteRotadoArchivo = new winston.transports.DailyRotateFile({
  dirname: RUTA_LOGS,
  filename: 'procesador-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxFiles: '30d', // conserva 30 días de historial; ajustable si hace falta más/menos
  format: formatoArchivo,
});

const logger = winston.createLogger({
  level: config.logLevel,
  transports: [
    new winston.transports.Console({ format: formatoConsola }),
    transporteRotadoArchivo,
  ],
});

module.exports = logger;