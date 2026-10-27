
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


































chrome.runtime.onMessage.addListener((mensaje, sender, sendResponse) => {
  // ==========================================
  // OBTENER PLACAS
  // ==========================================
  if (mensaje.accion === "obtenerPlacas") {
    const filas = document.querySelectorAll("#vEnPista tr");

    const placas = Array.from(filas)
      .map((fila) => {
        return fila
          .querySelector("td:first-child label strong")
          ?.textContent.trim();
      })
      .filter(Boolean);

    console.log("Placas extraídas de Tecmmas:", placas);

    sendResponse({
      ok: true,
      placas,
    });

    return;
  }

  // ==========================================
  // INYECTAR PRESIONES
  // ==========================================
  if (mensaje.accion === "inyectarPresiones") {
    const { placa, presiones } = mensaje;

    console.log("Solicitud de inyección recibida:", {
      placa,
      presiones,
    });

    // Validar que se recibieron los datos necesarios.
    if (!placa || !Array.isArray(presiones)) {
      sendResponse({
        ok: false,
        error: "La placa o las presiones recibidas no son válidas.",
      });

      return;
    }

  

    const placaBuscada = placa;

    const filas = document.querySelectorAll("#vEnPista tr");

    const filaEncontrada = Array.from(filas).find((fila) => {
      const placa = fila
        .querySelector("td:first-child label strong")
        ?.textContent.trim();

      return placa === placaBuscada;
    });

    const botonVer = filaEncontrada?.querySelector('button[name="dato"]');

    if (botonVer) {
      console.log("Botón encontrado:", botonVer);
      console.log("Valor del botón:", botonVer.value);
    }

    if (!botonVer) {
      sendResponse({
        ok: false,
        error: `No se encontró el botón Ver para la placa ${placa}.`,
      });
      return;
    }

     sendResponse({
      ok: true,
      mensaje: `Se hizo clic en Ver para la placa ${placa}.`,
    });

    // Hacer clic en el botón Ver
    botonVer.click();

    console.log(`Clic ejecutado en Ver para la placa ${placa}`);

   

    return;
  }
});
