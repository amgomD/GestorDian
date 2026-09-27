const fs = require('fs');
const path = require('path');
const config = require('./index');

/**
 * Carga y valida el archivo de configuración de empresas.
 * Cada empresa del JSON original debe tener, como mínimo, "Tipo" y "URL".
 * No se asume ningún otro campo (regla anti-alucinación #10).
 */
function cargarEmpresas() {
  const rutaAbsoluta = path.resolve(process.cwd(), config.empresasConfigPath);

  if (!fs.existsSync(rutaAbsoluta)) {
    throw new Error(
      `No se encontró el archivo de configuración de empresas en: ${rutaAbsoluta}`
    );
  }

  let contenido;
  try {
    contenido = fs.readFileSync(rutaAbsoluta, 'utf-8');
  } catch (error) {
    throw new Error(`No se pudo leer el archivo de empresas: ${error.message}`);
  }

  let empresasCrudas;
  try {
    empresasCrudas = JSON.parse(contenido);
  } catch (error) {
    throw new Error(`El archivo de empresas no contiene un JSON válido: ${error.message}`);
  }

  if (!Array.isArray(empresasCrudas)) {
    throw new Error('El archivo de empresas debe contener un array en su raíz.');
  }

  if (empresasCrudas.length === 0) {
    throw new Error('El archivo de empresas está vacío. Debe existir al menos una empresa.');
  }

  const empresas = empresasCrudas.map((empresaCruda, indice) => {
    if (!empresaCruda.URL || typeof empresaCruda.URL !== 'string') {
      throw new Error(
        `La empresa en la posición ${indice} no tiene una "URL" válida.`
      );
    }
    if (!empresaCruda.Tipo || typeof empresaCruda.Tipo !== 'string') {
      throw new Error(
        `La empresa en la posición ${indice} no tiene un "Tipo" válido.`
      );
    }

    return {
      id: empresaCruda.ID,       // identificador interno único (ver justificación arriba)
      tipo: empresaCruda.Tipo,
      url: empresaCruda.URL,
    };
  });

  // Verificación de URLs duplicadas: si el JSON real llegara a tener
  // una URL repetida, es mejor detenerse ahora que descubrirlo procesando mal.
  const urlsVistas = new Set();
  for (const empresa of empresas) {
    if (urlsVistas.has(empresa.id)) {
      throw new Error(`URL de empresa duplicada en el JSON: ${empresa.id}`);
    }
    urlsVistas.add(empresa.id);
  }

  return empresas;
}

module.exports = { cargarEmpresas };