require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',
  empresasConfigPath: process.env.EMPRESAS_CONFIG_PATH || './src/config/empresas.json',
  maxEmpresasConcurrentes: parseInt(process.env.MAX_EMPRESAS_CONCURRENTES, 10) || 5,
  maxFacturasConcurrentesPorEmpresa: parseInt(process.env.MAX_FACTURAS_CONCURRENTES_POR_EMPRESA, 10) || 3,
  maxCorreosConcurrentesPorEmpresa: parseInt(process.env.MAX_CORREOS_CONCURRENTES_POR_EMPRESA, 10) || 3,
  envioRealHabilitado: process.env.ENVIO_REAL_HABILITADO === 'true',
  envioCorreoHabilitado: process.env.ENVIO_CORREO_HABILITADO === 'true',
  maxReintentosErp: parseInt(process.env.MAX_REINTENTOS_ERP, 10) || 3,
  backoffInicialMs: parseInt(process.env.BACKOFF_INICIAL_MS, 10) || 500,
  maxErroresConsecutivosEmpresa: parseInt(process.env.MAX_ERRORES_CONSECUTIVOS_EMPRESA, 10) || 3,
  intervaloCicloFacturasMs: parseInt(process.env.INTERVALO_CICLO_FACTURAS_MS, 10) || 60000,
  intervaloCicloRadianMs: parseInt(process.env.INTERVALO_CICLO_RADIAN_MS, 10) || 300000,
  intervaloCicloCorreoMs: parseInt(process.env.INTERVALO_CICLO_CORREO_MS, 10) || 120000,
};

module.exports = config;