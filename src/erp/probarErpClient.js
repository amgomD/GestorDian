/**
 * Script de prueba MANUAL para erpClient.js.
 * Se ejecuta explícitamente con: node src/erp/probarErpClient.js
 * NO forma parte del arranque normal del sistema (no lo llama index.js).
 *
 * Por seguridad, solo prueba la consulta (solo lectura).
 * El envío real (enviarFactura) se prueba por separado, solo cuando
 * el usuario lo indique explícitamente.
 */

const { consultarFacturasPendientes } = require('./erpClient');
const { cargarEmpresas } = require('../config/empresasLoader');

async function main() {
  const empresas = cargarEmpresas();

  // Cambia este índice para probar con una empresa específica.
  const empresaDePrueba = empresas[7];

  console.log(`[prueba-erp] Consultando empresa: ${empresaDePrueba.url}`);

  try {
    const resultado = await consultarFacturasPendientes(empresaDePrueba.url);
    console.log('[prueba-erp] Respuesta recibida:');
    console.log(JSON.stringify(resultado, null, 2));
  } catch (error) {
    console.error('[prueba-erp] Error al consultar:', error.message);
    if (error.response) {
      console.error('[prueba-erp] Status HTTP:', error.response.status);
      console.error('[prueba-erp] Data:', error.response.data);
    }
  }
}

main();