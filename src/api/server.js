const express = require('express');
const path = require('path');
const pLimit = require('p-limit');
const config = require('../config');
const logger = require('../logger/logger');
const {
  consultarFacturasPendientes,
  enviarFactura,
  consultarSinCorreo,
  enviarCorreo,
  sincronizarRadian,
} = require('../erp/erpClient');

function crearServidor(orquestador) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.get('/health', (req, res) => {
    const empresas = orquestador.getEstadoGeneral();
    const empresasConError = empresas.filter((e) => e.estadoActual === 'error').length;
    const empresasPausadas = empresas.filter((e) => e.pausadaPorErrores).length;

    res.json({
      status: 'ok',
      entorno: config.env,
      timestamp: new Date().toISOString(),
      totalEmpresas: empresas.length,
      empresasConError,
      empresasPausadas,
      envioRealHabilitado: config.envioRealHabilitado,
    });
  });

  app.get('/api/empresas', (req, res) => {
    const empresas = orquestador.getEstadoGeneral();
    res.json({ total: empresas.length, empresas });
  });

  app.get('/api/empresas/:id', (req, res) => {
    const idBuscado = decodeURIComponent(req.params.id);
    const empresas = orquestador.getEstadoGeneral();
    const empresa = empresas.find((e) => e.id === idBuscado);

    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada', id: idBuscado });
    }

    res.json(empresa);
  });

  /**
   * Búsqueda manual de facturas con filtros reales.
   * NO toca el estado del worker automático (ver justificación:
   * "ciclos aparte" — acciones manuales independientes del ciclo).
   */
  app.get('/api/empresas/:id/facturas/buscar', async (req, res) => {
    const idBuscado = decodeURIComponent(req.params.id);
    const empresas = orquestador.getEstadoGeneral();
    const empresa = empresas.find((e) => e.id === idBuscado);

    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada', id: idBuscado });
    }

    try {
      const resultado = await consultarFacturasPendientes(empresa.url, {
        FechaDesde: req.query.FechaDesde || '',
        FechaHasta: req.query.FechaHasta || '',
        Numero: req.query.Numero || '',
        Cliente: req.query.Cliente || '',
        LlenarDetalle: 'S',
      });

      res.json({
        empresa: resultado.Empresa || null,
        nit: resultado.Nit || null,
        totalDocumentos: resultado.TotalDocumentos,
        pendientes: resultado.Pendientes,
        facturas: resultado.Facturas || [],
      });
    } catch (error) {
      logger.error(`Error en búsqueda manual de facturas: ${error.message}`, { empresa: idBuscado });
      res.status(502).json({ error: 'Error al consultar el ERP', detalle: error.message });
    }
  });

  /**
   * Envío MANUAL de UNA factura. Tiene efecto real si
   * ENVIO_REAL_HABILITADO=true (mismo interruptor que el ciclo automático).
   */
  app.post('/api/empresas/:id/facturas/enviar', async (req, res) => {
    const idBuscado = decodeURIComponent(req.params.id);
    const empresas = orquestador.getEstadoGeneral();
    const empresa = empresas.find((e) => e.id === idBuscado);
    const { facturaId } = req.body;

    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada', id: idBuscado });
    }
    if (!facturaId) {
      return res.status(400).json({ error: 'Falta "facturaId" en el body' });
    }

    if (!config.envioRealHabilitado) {
      logger.info(`[MANUAL] ENVIO_REAL_HABILITADO=false — se hubiera enviado FacSec=${facturaId}`, {
        empresa: idBuscado,
      });
      return res.json({ facturaId, simulado: true, exito: true });
    }

    try {
      const respuesta = await enviarFactura(empresa.url, facturaId);
      const resultadoEnvio = respuesta && respuesta[0];
      const exito = resultadoEnvio && resultadoEnvio.FacEleStatus === 'S';

      logger.info(`[MANUAL] Envío de factura FacSec=${facturaId}: ${exito ? 'éxito' : 'fallo'}`, {
        empresa: idBuscado,
      });

      res.json({
        facturaId,
        exito,
        mensaje: resultadoEnvio ? resultadoEnvio.FacMensaje : null,
        cufe: resultadoEnvio ? resultadoEnvio.FacCufe : null,
      });
    } catch (error) {
      logger.error(`[MANUAL] Error al enviar factura FacSec=${facturaId}: ${error.message}`, {
        empresa: idBuscado,
      });
      res.status(502).json({ facturaId, exito: false, error: error.message });
    }
  });

  /**
   * Envío MANUAL de VARIAS facturas (selección o "todas" desde el frontend).
   * Recibe un array de IDs ya obtenidos previamente vía /facturas/buscar —
   * no vuelve a consultar el ERP aquí, para no desalinear lo que el usuario
   * vio en pantalla con lo que realmente se envía.
   */
  app.post('/api/empresas/:id/facturas/enviar-lote', async (req, res) => {
    const idBuscado = decodeURIComponent(req.params.id);
    const empresas = orquestador.getEstadoGeneral();
    const empresa = empresas.find((e) => e.id === idBuscado);
    const { facturaIds } = req.body;

    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada', id: idBuscado });
    }
    if (!Array.isArray(facturaIds) || facturaIds.length === 0) {
      return res.status(400).json({ error: 'Falta "facturaIds" (array) en el body' });
    }

    const limite = pLimit(config.maxFacturasConcurrentesPorEmpresa);

    const resultados = await Promise.allSettled(
      facturaIds.map((facturaId) =>
        limite(async () => {
          if (!config.envioRealHabilitado) {
            logger.info(
              `[MANUAL-LOTE] ENVIO_REAL_HABILITADO=false — se hubiera enviado FacSec=${facturaId}`,
              { empresa: idBuscado }
            );
            return { facturaId, simulado: true, exito: true };
          }

          const respuesta = await enviarFactura(empresa.url, facturaId);
          const resultadoEnvio = respuesta && respuesta[0];
          const exito = resultadoEnvio && resultadoEnvio.FacEleStatus === 'S';

          if (!exito) {
            throw new Error(resultadoEnvio ? resultadoEnvio.FacMensaje : 'Respuesta vacía del ERP');
          }
          return { facturaId, exito: true, cufe: resultadoEnvio.FacCufe };
        })
      )
    );

    const detalle = resultados.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { facturaId: facturaIds[i], exito: false, error: r.reason.message }
    );

    const exitosas = detalle.filter((d) => d.exito).length;

    logger.info(
      `[MANUAL-LOTE] Envío en lote: ${exitosas}/${facturaIds.length} exitosas`,
      { empresa: idBuscado }
    );

    res.json({ total: facturaIds.length, exitosas, fallidas: facturaIds.length - exitosas, detalle });
  });







app.get('/api/empresas/:id/correos/buscar', async (req, res) => {
  const idBuscado = decodeURIComponent(req.params.id);
  const empresas = orquestador.getEstadoGeneral();
  const empresa = empresas.find((e) => e.id === idBuscado);

  if (!empresa) {
    return res.status(404).json({ error: 'Empresa no encontrada', id: idBuscado });
  }

  try {
    const resultado = await consultarSinCorreo(empresa.url);
    res.json({
      empresa: resultado.Empresa || null,
      nit: resultado.Nit || null,
      sinCorreo: resultado.SinCorreo || [],
    });
  } catch (error) {
    logger.error(`Error al buscar correos pendientes: ${error.message}`, { empresa: idBuscado });
    res.status(502).json({ error: 'Error al consultar el ERP', detalle: error.message });
  }
});

/**
 * Envío MANUAL de UN correo. Respeta ENVIO_CORREO_HABILITADO
 * (interruptor independiente, confirmado por el usuario).
 */
app.post('/api/empresas/:id/correos/enviar', async (req, res) => {
  const idBuscado = decodeURIComponent(req.params.id);
  const empresas = orquestador.getEstadoGeneral();
  const empresa = empresas.find((e) => e.id === idBuscado);
  const { facturaId } = req.body;

  if (!empresa) {
    return res.status(404).json({ error: 'Empresa no encontrada', id: idBuscado });
  }
  if (!facturaId) {
    return res.status(400).json({ error: 'Falta "facturaId" en el body' });
  }

  if (!config.envioCorreoHabilitado) {
    logger.info(`[MANUAL-CORREO] ENVIO_CORREO_HABILITADO=false — se hubiera enviado correo FacSec=${facturaId}`, {
      empresa: idBuscado,
    });
    return res.json({ facturaId, simulado: true, exito: true });
  }

  try {
    const respuesta = await enviarCorreo(empresa.url, facturaId);
    const resultadoEnvio = respuesta && respuesta[0];
    const exito = resultadoEnvio && resultadoEnvio.FacEleStatus === 'S';

    res.json({
      facturaId,
      exito,
      mensaje: resultadoEnvio ? resultadoEnvio.FacMensaje : null,
    });
  } catch (error) {
    logger.error(`[MANUAL-CORREO] Error al enviar correo FacSec=${facturaId}: ${error.message}`, {
      empresa: idBuscado,
    });
    res.status(502).json({ facturaId, exito: false, error: error.message });
  }
});

/**
 * Envío MANUAL en lote de correos (seleccionados o todos).
 */
app.post('/api/empresas/:id/correos/enviar-lote', async (req, res) => {
  const idBuscado = decodeURIComponent(req.params.id);
  const empresas = orquestador.getEstadoGeneral();
  const empresa = empresas.find((e) => e.id === idBuscado);
  const { facturaIds } = req.body;

  if (!empresa) {
    return res.status(404).json({ error: 'Empresa no encontrada', id: idBuscado });
  }
  if (!Array.isArray(facturaIds) || facturaIds.length === 0) {
    return res.status(400).json({ error: 'Falta "facturaIds" (array) en el body' });
  }

  const limite = pLimit(config.maxCorreosConcurrentesPorEmpresa);

  const resultados = await Promise.allSettled(
    facturaIds.map((facturaId) =>
      limite(async () => {
        if (!config.envioCorreoHabilitado) {
          return { facturaId, simulado: true, exito: true };
        }
        const respuesta = await enviarCorreo(empresa.url, facturaId);
        const resultadoEnvio = respuesta && respuesta[0];
        const exito = resultadoEnvio && resultadoEnvio.FacEleStatus === 'S';
        if (!exito) {
          throw new Error(resultadoEnvio ? resultadoEnvio.FacMensaje : 'Respuesta vacía del ERP');
        }
        return { facturaId, exito: true };
      })
    )
  );

  const detalle = resultados.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { facturaId: facturaIds[i], exito: false, error: r.reason.message }
  );
  const exitosas = detalle.filter((d) => d.exito).length;

  logger.info(`[MANUAL-CORREO-LOTE] ${exitosas}/${facturaIds.length} exitosas`, { empresa: idBuscado });

  res.json({ total: facturaIds.length, exitosas, fallidas: facturaIds.length - exitosas, detalle });
});

/**
 * Consulta MANUAL de Radian. Ejecuta la misma sincronización que el
 * scheduler automático, pero on-demand, devolviendo la respuesta cruda
 * del ERP para mostrarla en el panel (no se guarda en el estado del
 * radianWorker — es una acción "aparte", igual que el resto de acciones
 * manuales de esta conversación).
 */
app.post('/api/empresas/:id/radian/consultar', async (req, res) => {
  const idBuscado = decodeURIComponent(req.params.id);
  const empresas = orquestador.getEstadoGeneral();
  const empresa = empresas.find((e) => e.id === idBuscado);

  if (!empresa) {
    return res.status(404).json({ error: 'Empresa no encontrada', id: idBuscado });
  }

  try {
    const resultado = await sincronizarRadian(empresa.url);
    res.json({ exito: true, respuesta: resultado });
  } catch (error) {
    logger.error(`[MANUAL-RADIAN] Error: ${error.message}`, { empresa: idBuscado });
    res.status(502).json({ exito: false, error: error.message });
  }
});




  return app;
}

function iniciarServidor(orquestador) {
  const app = crearServidor(orquestador);

  const servidor = app.listen(config.port, () => {
    console.log(`[api] Servidor escuchando en el puerto ${config.port} (entorno: ${config.env})`);
  });

  return servidor;
}









module.exports = { crearServidor, iniciarServidor };