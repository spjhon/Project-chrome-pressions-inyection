
const CLAVE_REGISTRO = "registroPresionesDiario";

let actualizacionEnCurso = false;
let actualizacionPendiente = false;
let observadorTabla = null;




// ==========================================
// FECHA LOCAL
// ==========================================
function obtenerFechaLocal() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");

  return `${anio}-${mes}-${dia}`;
}








// ==========================================
// OBTENER O CREAR REGISTRO DIARIO
// ==========================================
async function obtenerRegistroDiario() {
  const resultado = await chrome.storage.local.get(CLAVE_REGISTRO);
  let registro = resultado[CLAVE_REGISTRO];
  const fechaActual = obtenerFechaLocal();

  // Crear registro inicial o reiniciarlo al cambiar el día.
  if (
    !registro ||
    registro.fecha !== fechaActual ||
    !registro.ordenes ||
    typeof registro.ordenes !== "object"
  ) {
    registro = {
      fecha: fechaActual,
      ordenes: {},
    };

    await chrome.storage.local.set({
      [CLAVE_REGISTRO]: registro,
    });
  }

  return registro;
}















// ==========================================
// OBTENER DATOS DE LA FILA
// ==========================================
function obtenerDatosOrden(fila) {
  const placa = fila
    .querySelector("td:first-child strong")
    ?.textContent.trim()
    .toUpperCase();

  // El value del botón Ver identifica la orden.
  const idOrden = fila
    .querySelector('button[name="dato"]')
    ?.value?.trim();

  if (!placa || !idOrden) {
    return null;
  }

  return { placa, idOrden };
}







// ==========================================
// PINTAR ESTADO EN LA CELDA
// ==========================================
function pintarEstado(celda, texto, tipo) {
  let estado = celda.querySelector("[data-estado-presiones]");

  if (!estado) {
    estado = document.createElement("span");
    estado.dataset.estadoPresiones = "";
    celda.replaceChildren(estado);
  }

  const estilos = {
    inyectada: {
      background: "#d1e7dd",
      color: "#0f5132",
    },
    pendiente: {
      background: "#fff3cd",
      color: "#664d03",
    },
    limite: {
      background: "#f8d7da",
      color: "#842029",
    },
  };

  const estilo = estilos[tipo] ?? estilos.pendiente;

  // Evitar mutaciones innecesarias del DOM.
  if (
    estado.textContent !== texto ||
    estado.style.backgroundColor !== estilo.background ||
    estado.style.color !== estilo.color
  ) {
    estado.textContent = texto;

    estado.style.cssText = `
      display: inline-block;
      padding: 4px 8px;
      border-radius: 6px;
      background: ${estilo.background};
      color: ${estilo.color};
      font-size: 12px;
      font-weight: bold;
      white-space: nowrap;
    `;
  }
}








async function actualizarTablaPresiones() {
  // Evitar que dos ejecuciones procesen la tabla a la vez.
  if (actualizacionEnCurso) {
    actualizacionPendiente = true;
    return;
  }

  actualizacionEnCurso = true;

  try {
    const tbody = document.querySelector("#vEnPista");

    if (!tbody) {
      return;
    }

    const tabla = tbody.closest("table");
    const encabezado = tabla?.querySelector("thead tr");

    if (!encabezado) {
      console.warn("No se encontró el encabezado de la tabla");
      return;
    }

    // Agregar el encabezado una sola vez.
    if (!encabezado.querySelector('[data-columna="presiones"]')) {
      const th = document.createElement("th");
      th.textContent = "Presiones";
      th.dataset.columna = "presiones";
      encabezado.appendChild(th);
    }

    const registro = await obtenerRegistroDiario();
    let registroModificado = false;

    // Procesar todas las filas visibles.
    for (const fila of tbody.querySelectorAll("tr")) {
      const datos = obtenerDatosOrden(fila);

      if (!datos) {
        continue;
      }

      const { placa, idOrden } = datos;

      // Crear la celda si todavía no existe.
      let celda = fila.querySelector('[data-columna="presiones"]');

      if (!celda) {
        celda = document.createElement("td");
        celda.dataset.columna = "presiones";
        fila.appendChild(celda);
      }

      // Buscar la orden por su serial único.
      let orden = registro.ordenes[idOrden];

      if (!orden) {
        // Registrar la orden nueva como pendiente.
        orden = {
          placa,
          inyectada: false,
          fechaInyeccion: null,
        };

        registro.ordenes[idOrden] = orden;
        registroModificado = true;
      } else if (orden.placa !== placa) {
        // Actualizar la placa sin modificar el estado de inyección.
        orden.placa = placa;
        registroModificado = true;
      }

      // Mostrar el estado guardado.
      if (orden.inyectada === true) {
        pintarEstado(celda, "Inyectada", "inyectada");
      } else {
        pintarEstado(celda, "Pendiente", "pendiente");
      }
    }

    // Guardar solo si hubo cambios.
    if (registroModificado) {
      await chrome.storage.local.set({
        [CLAVE_REGISTRO]: registro,
      });
    }
  } catch (error) {
    console.error("Error actualizando estados de presiones:", error);
  } finally {
    actualizacionEnCurso = false;

    // Procesar otra vez si hubo cambios durante la ejecución.
    if (actualizacionPendiente) {
      actualizacionPendiente = false;
      void actualizarTablaPresiones();
    }
  }
}








// ==========================================
// OBSERVAR CAMBIOS DE LA TABLA
// ==========================================
function iniciarObservadorTabla() {
  const tbody = document.querySelector("#vEnPista");

  if (!tbody) {
    console.warn("No se encontró #vEnPista");
    return;
  }

  // Evitar instalar el observador dos veces.
  if (observadorTabla) {
    observadorTabla.disconnect();
  }

  // Procesar las filas que ya existen.
  void actualizarTablaPresiones();

  // Detectar filas nuevas o cambios en la tabla.
  observadorTabla = new MutationObserver(() => {
    void actualizarTablaPresiones();
  });

  observadorTabla.observe(tbody, {
    childList: true,
    subtree: true,
  });
}






// ==========================================
// INICIO
// ==========================================
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    iniciarObservadorTabla,
    { once: true }
  );
} else {
  iniciarObservadorTabla();
}


















function obtenerOrdenesTabla() {
  const tbody = document.querySelector("#vEnPista");

  if (!tbody) {
    return [];
  }

  return Array.from(tbody.querySelectorAll("tr"))
    .map((fila) => {
      const placa = fila
        .querySelector("td:first-child strong")
        ?.textContent.trim()
        .toUpperCase();

      const idOrden = fila
        .querySelector('button[name="dato"]')
        ?.value?.trim();

      if (!placa || !idOrden) {
        return null;
      }

      return { placa, idOrden };
    })
    .filter(Boolean);
}






















chrome.runtime.onMessage.addListener((mensaje, sender, sendResponse) => {
  // ==========================================
  // OBTENER PLACAS
  // ==========================================
  if (mensaje.accion === "obtenerPlacas") {
  sendResponse({
    ok: true,
    placas: obtenerOrdenesTabla(),
  });

  return;
}

  // ==========================================
  // INYECTAR PRESIONES
  // ==========================================
  if (mensaje.accion === "inyectarPresiones") {
  const { idOrden, placa, presiones } = mensaje;

  console.log("Solicitud de inyección recibida:", {
    idOrden,
    placa,
    presiones,
  });

  // Validar los datos recibidos.
  if (!idOrden || !placa || !Array.isArray(presiones)) {
    sendResponse({
      ok: false,
      error: "La orden, la placa o las presiones no son válidas.",
    });
    return;
  }

  const filas = document.querySelectorAll("#vEnPista tr");

  // Buscar la orden por su serial único, no solamente por placa.
  const filaEncontrada = Array.from(filas).find((fila) => {
    const idOrdenFila = fila
      .querySelector('button[name="dato"]')
      ?.value?.trim();

    return idOrdenFila === idOrden;
  });

  const botonVer = filaEncontrada?.querySelector(
    'button[name="dato"]'
  );

  if (!botonVer) {
    sendResponse({
      ok: false,
      error: `No se encontró la orden ${idOrden} para la placa ${placa}.`,
    });
    return;
  }

  // Validar que el serial encontrado corresponda también a la placa.
  const placaFila = filaEncontrada
    .querySelector("td:first-child strong")
    ?.textContent.trim()
    .toUpperCase();

  if (placaFila !== placa.toUpperCase()) {
    sendResponse({
      ok: false,
      error: "La placa no coincide con la orden seleccionada.",
    });
    return;
  }

  // Guardar los datos antes de abrir la orden.
  chrome.storage.local.set({
    presionesPendientes: {
      idOrden,
      placa,
      presiones,
    },
  }).then(() => {
    console.log("Orden preparada para inyección:", idOrden);

    // Abrir exactamente la orden seleccionada.
    botonVer.click();

    console.log(`Clic ejecutado para la orden ${idOrden}`);

    sendResponse({
      ok: true,
      mensaje: `Se abrió la orden ${idOrden} (${placa}).`,
    });
  }).catch((error) => {
    console.error("Error guardando las presiones pendientes:", error);

    sendResponse({
      ok: false,
      error: "No fue posible guardar las presiones pendientes.",
    });
  });

  // La respuesta se enviará de forma asíncrona.
  return true;
}
});
