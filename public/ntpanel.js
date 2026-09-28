const INTERVALO_ACTUALIZACION_MS = 5000;

let empresaSeleccionada = null;
let ultimaBusquedaFacturas = []; // guarda lo último buscado, para "enviar todas"

// ---------- SIDEBAR ----------

async function cargarSidebar() {
  try {
    const respuesta = await fetch('/api/empresas');
    const datos = await respuesta.json();
    renderizarSidebar(datos.empresas);
  } catch (error) {
    document.getElementById('lista-empresas').textContent = 'Error al cargar empresas.';
  }
}

function renderizarSidebar(empresas) {
  const contenedor = document.getElementById('lista-empresas');
  contenedor.innerHTML = '';

  empresas.forEach((empresa) => {
    const f = empresa.facturas;
    const r = empresa.radian;
    const c = empresa.correo;

    const totalF = f.facturasPendientes || 0;
    const avanzadasF = f.facturasProcesadas + f.facturasFallidas;
    const pctF = totalF > 0 ? Math.min(100, Math.round((avanzadasF / totalF) * 100)) : 100;

    const totalC = c.correosPendientes || 0;
    const avanzadasC = c.correosEnviados + c.correosFallidos;
    const pctC = totalC > 0 ? Math.min(100, Math.round((avanzadasC / totalC) * 100)) : 100;

    let claseRadian = 'ok';
    if (r.estadoActual === 'procesando') claseRadian = 'animando';
    else if (r.estadoActual === 'error' || r.estadoActual === 'detenido') claseRadian = 'mal';

    const tarjeta = document.createElement('div');
    tarjeta.className = `tarjeta-empresa estado-${f.estadoActual}` +
      (empresaSeleccionada === empresa.id ? ' activa' : '');
    tarjeta.dataset.id = empresa.id;

tarjeta.innerHTML = `
  <div class="nombre">${empresa.nombreEmpresa || '(sin datos aún)'}</div>
  <div class="nit">${empresa.nit || '-'}</div>

  <div class="mini-progreso-label">
    Facturas: ${avanzadasF}/${totalF} (${pctF}%)
    <span class="contador" data-proxima="${f.proximaEjecucion || ''}"></span>
  </div>
  <div class="barra-progreso-fondo mini">
    <div class="barra-progreso-relleno" style="width: ${pctF}%"></div>
  </div>

  <div class="mini-progreso-label">
    Radian: ${r.ultimoCargados !== null ? `cargados ${r.ultimoCargados}` : (r.estadoActual === 'procesando' ? 'ejecutando...' : 'sin datos')}
    <span class="contador" data-proxima="${r.proximaEjecucion || ''}"></span>
  </div>
  <div class="barra-indeterminada ${claseRadian}"></div>

  <div class="mini-progreso-label">
    Correo: ${avanzadasC}/${totalC} (${pctC}%)
    <span class="contador" data-proxima="${c.proximaEjecucion || ''}"></span>
  </div>
  <div class="barra-progreso-fondo mini">
    <div class="barra-progreso-relleno" style="width: ${pctC}%"></div>
  </div>
`;

    tarjeta.addEventListener('click', () => seleccionarEmpresa(empresa));
    contenedor.appendChild(tarjeta);
  });
}

function seleccionarEmpresa(empresa) {
  empresaSeleccionada = empresa.id;
  document.getElementById('sin-seleccion').classList.add('oculto');
  document.getElementById('contenido-empresa').classList.remove('oculto');
  document.getElementById('titulo-empresa').textContent =
    `${empresa.nombreEmpresa || '(sin datos aún)'} — NIT ${empresa.nit || '-'}`;

  // Limpiar resultados anteriores al cambiar de empresa.
  document.getElementById('cuerpo-facturas').innerHTML = '';
  document.getElementById('resultado-info').textContent = '';
  ultimaBusquedaFacturas = [];
  actualizarBotonesLote();

  cargarSidebar(); // refresca para marcar la tarjeta como activa
}

// ---------- BÚSQUEDA DE FACTURAS ----------

document.getElementById('form-filtros').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!empresaSeleccionada) return;

  const params = new URLSearchParams({
    FechaDesde: document.getElementById('filtro-desde').value || '',
    FechaHasta: document.getElementById('filtro-hasta').value || '',
    Numero: document.getElementById('filtro-numero').value || '',
    Cliente: document.getElementById('filtro-cliente').value || '',
  });

  const idCodificado = encodeURIComponent(empresaSeleccionada);
  const info = document.getElementById('resultado-info');
  info.textContent = 'Buscando...';

  try {
    const respuesta = await fetch(`/api/empresas/${idCodificado}/facturas/buscar?${params}`);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      info.textContent = `Error: ${datos.error || 'desconocido'}`;
      return;
    }

    ultimaBusquedaFacturas = datos.facturas || [];
    info.textContent = `${ultimaBusquedaFacturas.length} facturas encontradas (pendientes reportadas por el ERP: ${datos.pendientes ?? '-'})`;
    renderizarTablaFacturas(ultimaBusquedaFacturas);
    actualizarBotonesLote();
  } catch (error) {
    info.textContent = `Error de red: ${error.message}`;
  }
});

function renderizarTablaFacturas(facturas) {
  const cuerpo = document.getElementById('cuerpo-facturas');
  cuerpo.innerHTML = '';

  facturas.forEach((factura) => {
    const fila = document.createElement('tr');
    fila.dataset.facturaId = factura.Id;

    fila.innerHTML = `
      <td><input type="checkbox" class="check-factura" /></td>
      <td>${factura.Documento}</td>
      <td>${factura.Fecha}</td>
      <td>${factura.Total}</td>
      <td><span class="badge-envio badge-pendiente estado-envio">pendiente</span></td>
      <td><button class="btn-enviar-individual">Enviar</button></td>
    `;

    cuerpo.appendChild(fila);
  });

  document.querySelectorAll('.check-factura').forEach((chk) =>
    chk.addEventListener('change', actualizarBotonesLote)
  );
  document.querySelectorAll('.btn-enviar-individual').forEach((btn) =>
    btn.addEventListener('click', (e) => enviarIndividual(e.target.closest('tr')))
  );
}

function actualizarBotonesLote() {
  const seleccionadas = document.querySelectorAll('.check-factura:checked').length;
  document.getElementById('btn-enviar-seleccion').disabled = seleccionadas === 0;
  document.getElementById('btn-enviar-todas').disabled = ultimaBusquedaFacturas.length === 0;
}

document.getElementById('check-todas').addEventListener('change', (e) => {
  document.querySelectorAll('.check-factura').forEach((chk) => (chk.checked = e.target.checked));
  actualizarBotonesLote();
});

// ---------- ENVÍO INDIVIDUAL ----------

async function enviarIndividual(fila) {
  const facturaId = fila.dataset.facturaId;
  const idCodificado = encodeURIComponent(empresaSeleccionada);
  const badge = fila.querySelector('.estado-envio');

  badge.textContent = 'enviando...';
  badge.className = 'badge-envio badge-pendiente estado-envio';

  try {
    const respuesta = await fetch(`/api/empresas/${idCodificado}/facturas/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facturaId }),
    });
    const resultado = await respuesta.json();

    if (resultado.exito) {
      badge.textContent = resultado.simulado ? 'simulado ✓' : 'enviado ✓';
      badge.className = 'badge-envio badge-exito estado-envio';
    } else {
      badge.textContent = 'error';
      badge.className = 'badge-envio badge-fallo estado-envio';
      badge.title = resultado.mensaje || resultado.error || '';
    }
  } catch (error) {
    badge.textContent = 'error de red';
    badge.className = 'badge-envio badge-fallo estado-envio';
  }
}

// ---------- ENVÍO EN LOTE (seleccionadas / todas) ----------

async function enviarLote(facturaIds) {
  const idCodificado = encodeURIComponent(empresaSeleccionada);
  const info = document.getElementById('resultado-info');
  info.textContent = `Enviando ${facturaIds.length} facturas...`;

  try {
    const respuesta = await fetch(`/api/empresas/${idCodificado}/facturas/enviar-lote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facturaIds }),
    });
    const resultado = await respuesta.json();

    info.textContent = `Lote finalizado: ${resultado.exitosas}/${resultado.total} exitosas.`;

    // Actualiza los badges de las filas correspondientes según el detalle recibido.
    resultado.detalle.forEach((item) => {
      const fila = document.querySelector(`tr[data-factura-id="${item.facturaId}"]`);
      if (!fila) return;
      const badge = fila.querySelector('.estado-envio');
      if (item.exito) {
        badge.textContent = item.simulado ? 'simulado ✓' : 'enviado ✓';
        badge.className = 'badge-envio badge-exito estado-envio';
      } else {
        badge.textContent = 'error';
        badge.className = 'badge-envio badge-fallo estado-envio';
        badge.title = item.error || '';
      }
    });
  } catch (error) {
    info.textContent = `Error de red al enviar el lote: ${error.message}`;
  }
}

document.getElementById('btn-enviar-seleccion').addEventListener('click', () => {
  const ids = Array.from(document.querySelectorAll('.check-factura:checked'))
    .map((chk) => chk.closest('tr').dataset.facturaId);
  if (ids.length === 0) return;
  enviarLote(ids);
});

document.getElementById('btn-enviar-todas').addEventListener('click', () => {
  const ids = ultimaBusquedaFacturas.map((f) => f.Id);
  if (ids.length === 0) return;

  // Confirmación explícita, tal como se acordó para esta acción.
  const confirmado = confirm(
    `¿Confirmas el envío de las ${ids.length} facturas encontradas en esta búsqueda para esta empresa?`
  );
  if (!confirmado) return;

  enviarLote(ids);
});

// ---------- INICIO ----------

cargarSidebar();
setInterval(cargarSidebar, INTERVALO_ACTUALIZACION_MS);

// ---------- TABS ----------

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('activa'));
    document.querySelectorAll('.tab-contenido').forEach((s) => s.classList.remove('activa'));
    btn.classList.add('activa');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('activa');
  });
});

// ---------- CORREO: cargar lista ----------

let ultimaBusquedaCorreos = [];

document.getElementById('btn-cargar-correos').addEventListener('click', async () => {
  if (!empresaSeleccionada) return;

  const idCodificado = encodeURIComponent(empresaSeleccionada);
  const info = document.getElementById('resultado-info-correo');
  info.textContent = 'Cargando...';

  try {
    const respuesta = await fetch(`/api/empresas/${idCodificado}/correos/buscar`);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      info.textContent = `Error: ${datos.error || 'desconocido'}`;
      return;
    }

    ultimaBusquedaCorreos = datos.sinCorreo || [];
    info.textContent = `${ultimaBusquedaCorreos.length} facturas sin correo encontradas.`;
    renderizarTablaCorreos(ultimaBusquedaCorreos);
    actualizarBotonesLoteCorreo();
  } catch (error) {
    info.textContent = `Error de red: ${error.message}`;
  }
});

function renderizarTablaCorreos(items) {
  const cuerpo = document.getElementById('cuerpo-correos');
  cuerpo.innerHTML = '';

  items.forEach((item) => {
    const fila = document.createElement('tr');
    fila.dataset.facturaId = item.Id;

    fila.innerHTML = `
      <td><input type="checkbox" class="check-correo" /></td>
      <td>${item.Documento}</td>
      <td>${item.Correo || '-'}</td>
      <td>${item.Fecha}</td>
      <td>${item.Intentos}</td>
      <td><span class="badge-envio badge-pendiente estado-envio-correo">pendiente</span></td>
      <td><button class="btn-enviar-correo-individual">Enviar</button></td>
    `;

    cuerpo.appendChild(fila);
  });

  document.querySelectorAll('.check-correo').forEach((chk) =>
    chk.addEventListener('change', actualizarBotonesLoteCorreo)
  );
  document.querySelectorAll('.btn-enviar-correo-individual').forEach((btn) =>
    btn.addEventListener('click', (e) => enviarCorreoIndividual(e.target.closest('tr')))
  );
}

function actualizarBotonesLoteCorreo() {
  const seleccionados = document.querySelectorAll('.check-correo:checked').length;
  document.getElementById('btn-enviar-correo-seleccion').disabled = seleccionados === 0;
  document.getElementById('btn-enviar-correo-todos').disabled = ultimaBusquedaCorreos.length === 0;
}

document.getElementById('check-todas-correo').addEventListener('change', (e) => {
  document.querySelectorAll('.check-correo').forEach((chk) => (chk.checked = e.target.checked));
  actualizarBotonesLoteCorreo();
});

async function enviarCorreoIndividual(fila) {
  const facturaId = fila.dataset.facturaId;
  const idCodificado = encodeURIComponent(empresaSeleccionada);
  const badge = fila.querySelector('.estado-envio-correo');

  badge.textContent = 'enviando...';
  badge.className = 'badge-envio badge-pendiente estado-envio-correo';

  try {
    const respuesta = await fetch(`/api/empresas/${idCodificado}/correos/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facturaId }),
    });
    const resultado = await respuesta.json();

    if (resultado.exito) {
      badge.textContent = resultado.simulado ? 'simulado ✓' : 'enviado ✓';
      badge.className = 'badge-envio badge-exito estado-envio-correo';
    } else {
      badge.textContent = 'error';
      badge.className = 'badge-envio badge-fallo estado-envio-correo';
      badge.title = resultado.mensaje || resultado.error || '';
    }
  } catch (error) {
    badge.textContent = 'error de red';
    badge.className = 'badge-envio badge-fallo estado-envio-correo';
  }
}


function formatearCuentaRegresiva(isoProximaEjecucion) {
  if (!isoProximaEjecucion) return null;
  const restanteMs = new Date(isoProximaEjecucion).getTime() - Date.now();
  if (restanteMs <= 0) return 'iniciando...';
  const segundos = Math.floor(restanteMs / 1000);
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return min > 0 ? `${min}m ${seg}s` : `${seg}s`;
}


async function enviarLoteCorreo(facturaIds) {
  const idCodificado = encodeURIComponent(empresaSeleccionada);
  const info = document.getElementById('resultado-info-correo');
  info.textContent = `Enviando ${facturaIds.length} correos...`;

  try {
    const respuesta = await fetch(`/api/empresas/${idCodificado}/correos/enviar-lote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facturaIds }),
    });
    const resultado = await respuesta.json();

    info.textContent = `Lote finalizado: ${resultado.exitosas}/${resultado.total} exitosas.`;

    resultado.detalle.forEach((item) => {
      const fila = document.querySelector(`#cuerpo-correos tr[data-factura-id="${item.facturaId}"]`);
      if (!fila) return;
      const badge = fila.querySelector('.estado-envio-correo');
      if (item.exito) {
        badge.textContent = item.simulado ? 'simulado ✓' : 'enviado ✓';
        badge.className = 'badge-envio badge-exito estado-envio-correo';
      } else {
        badge.textContent = 'error';
        badge.className = 'badge-envio badge-fallo estado-envio-correo';
      }
    });
  } catch (error) {
    info.textContent = `Error de red al enviar el lote: ${error.message}`;
  }
}

document.getElementById('btn-enviar-correo-seleccion').addEventListener('click', () => {
  const ids = Array.from(document.querySelectorAll('.check-correo:checked'))
    .map((chk) => chk.closest('tr').dataset.facturaId);
  if (ids.length === 0) return;
  enviarLoteCorreo(ids);
});

document.getElementById('btn-enviar-correo-todos').addEventListener('click', () => {
  const ids = ultimaBusquedaCorreos.map((item) => item.Id);
  if (ids.length === 0) return;
  const confirmado = confirm(`¿Confirmas el envío de ${ids.length} correos pendientes para esta empresa?`);
  if (!confirmado) return;
  enviarLoteCorreo(ids);
});

// ---------- RADIAN: consulta manual con popup ----------

document.getElementById('btn-consultar-radian').addEventListener('click', async () => {
  if (!empresaSeleccionada) return;

  const idCodificado = encodeURIComponent(empresaSeleccionada);
  const boton = document.getElementById('btn-consultar-radian');
  boton.disabled = true;
  boton.textContent = 'Consultando...';

  try {
    const respuesta = await fetch(`/api/empresas/${idCodificado}/radian/consultar`, { method: 'POST' });
    const datos = await respuesta.json();

    mostrarModalRadian(
      datos.exito
        ? JSON.stringify(datos.respuesta, null, 2)
        : `Error: ${datos.error}`
    );
  } catch (error) {
    mostrarModalRadian(`Error de red: ${error.message}`);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Consultar Radian';
  }
});

function mostrarModalRadian(texto) {
  document.getElementById('modal-radian-contenido').textContent = texto;
  document.getElementById('modal-radian').classList.remove('oculto');
}

document.getElementById('cerrar-modal-radian').addEventListener('click', () => {
  document.getElementById('modal-radian').classList.add('oculto');
});

// Actualiza los contadores en pantalla cada segundo, SIN pedir nada
// al servidor — solo recalcula contra los timestamps ya recibidos.
setInterval(() => {
  document.querySelectorAll('.contador').forEach((span) => {
    const proxima = span.dataset.proxima;
    const texto = formatearCuentaRegresiva(proxima);
    span.textContent = texto ? ` (próx: ${texto})` : '';
  });
}, 1000);