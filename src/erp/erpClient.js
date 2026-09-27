const axios = require('axios');
const https = require('https');
const config = require('../config');
const logger = require('../logger/logger');

const TIMEOUT_MS = 15000;

const agenteHttpsSinValidacion = new https.Agent({ rejectUnauthorized: false });
const clienteAxios = axios.create({ httpsAgent: agenteHttpsSinValidacion, timeout: TIMEOUT_MS });

function esErrorTransitorio(error) {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true;
  if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') return true;
  if (error.response && error.response.status >= 500) return true;
  return false;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ejecutarConReintentos(fn, contexto) {
  let intento = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      intento += 1;
      const transitorio = esErrorTransitorio(error);
      if (!transitorio || intento > config.maxReintentosErp) throw error;
      const esperaMs = config.backoffInicialMs * Math.pow(2, intento - 1);
      logger.warn(
        `Error transitorio (intento ${intento}/${config.maxReintentosErp}), reintentando en ${esperaMs}ms: ${error.message}`,
        { empresa: contexto }
      );
      await esperar(esperaMs);
    }
  }
}

async function consultarFacturasPendientes(urlBase, parametrosConsulta = {}) {
  const url = `${urlBase}/rest/wsTraerInfoDocDian`;


 let body = {};
  if(parametrosConsulta.BuscarSinCorreo == "S"){
   body = {
    SDTParmInfoDocDian: {
      FechaDesde: parametrosConsulta.FechaDesde || '',
      FechaHasta: parametrosConsulta.FechaHasta || '',
      TipoDoc: parametrosConsulta.TipoDoc || '',
      Numero: parametrosConsulta.Numero || '',
      Cliente: parametrosConsulta.Cliente || '',
      NumDocRevisados: parametrosConsulta.NumDocRevisados || '',
      LlenarDetalle: parametrosConsulta.LlenarDetalle || '',
      BuscarSinCorreo: parametrosConsulta.BuscarSinCorreo || ''
    },
  };
  }else{
   body = {
    SDTParmInfoDocDian: {
      FechaDesde: parametrosConsulta.FechaDesde || '',
      FechaHasta: parametrosConsulta.FechaHasta || '',
      TipoDoc: parametrosConsulta.TipoDoc || '',
      Numero: parametrosConsulta.Numero || '',
      Cliente: parametrosConsulta.Cliente || '',
      NumDocRevisados: parametrosConsulta.NumDocRevisados || '',
      LlenarDetalle: parametrosConsulta.LlenarDetalle || ''
    },
  };
  }





  return ejecutarConReintentos(async () => {
    const respuesta = await clienteAxios.post(url, body);
    return respuesta.data.SDTInfoDocDian;
  }, urlBase);
}

async function enviarFactura(urlBase, numeroFactura) {
  const url = `${urlBase}/rest/wsEnvioFacturaDianV2`;
  const body = { nFacCliCorEle: '', NumeroFactura: numeroFactura };
  return ejecutarConReintentos(async () => {
    const respuesta = await clienteAxios.post(url, body);
    return respuesta.data.RespuestaEle;
  }, urlBase);
}

/**
 * Sincronización Radian. Confirmado por el usuario: sin body real definido;
 * se envía un objeto vacío ({}) porque este tipo de servicio (GeneXus)
 * normalmente requiere al menos un JSON válido. Si el ERP lo rechaza,
 * es una hipótesis a corregir con evidencia real, no un hecho confirmado.
 */
async function sincronizarRadian(urlBase) {
  const url = `${urlBase}/rest/wsSincronizarRadianCorreo`;
  return ejecutarConReintentos(async () => {
    const respuesta = await clienteAxios.post(url, {});
    return respuesta.data; // { Mensaje, cargadosLongVarchar }
  }, urlBase);
}

/**
 * Consulta de facturas SIN correo enviado.
 * Contrato confirmado: LlenarDetalle='N', BuscarSinCorreo='S'
 * devuelve el array SinCorreo lleno.
 */
async function consultarSinCorreo(urlBase) {


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

  const url = `${urlBase}/rest/wsTraerInfoDocDian`;
  const body = {
    SDTParmInfoDocDian: {
      FechaDesde:  formatearFecha(fechaDesde),
      FechaHasta: formatearFecha(fechaHasta),
      TipoDoc: '',
      Numero: '',
      Cliente: '',
      NumDocRevisados: '',
      LlenarDetalle: 'N',
      BuscarSinCorreo: 'S',
    },
  };
  return ejecutarConReintentos(async () => {
    const respuesta = await clienteAxios.post(url, body);
    return respuesta.data.SDTInfoDocDian;
  }, urlBase);
}

/**
 * Envío de correo para UNA factura.
 * Mapeo asumido (a confirmar con datos reales): SinCorreo[].Id -> NumeroFactura,
 * igual que Facturas[].Id ya confirmado para wsEnvioFacturaDianV2.
 */
async function enviarCorreo(urlBase, numeroFactura) {
  const url = `${urlBase}/rest/wsEnvioCorreoDian`;

  const body = {
    nFacCliCorEle: '',
    NumeroFactura: numeroFactura
  };

  return ejecutarConReintentos(async () => {
    const respuesta = await clienteAxios.post(url, body, {
      headers: {
        Envio: 'API'
      }
    });

    return respuesta.data.RespuestaEle;
  }, urlBase);
}

module.exports = {
  consultarFacturasPendientes,
  enviarFactura,
  sincronizarRadian,
  consultarSinCorreo,
  enviarCorreo,
};





