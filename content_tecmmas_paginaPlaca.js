
// ==========================================
// CONTENT SCRIPT: PÁGINA DE LA PLACA
// ==========================================

console.log(
  "Página de la placa detectada:",
  window.location.href,
);


// ==========================================
// ABRIR DIÁLOGO DE PRESIÓN DE INFLADO
// ==========================================

function abrirDialogoPresionInflado() {
  const botonPresion = document.querySelector("#btnPresionInflado");

  if (!botonPresion) {
    console.error("No se encontró el botón Presión de inflado.");
    return false;
  }

  botonPresion.click();

  console.log("Se hizo clic en Presión de inflado.");

  return true;
}


// ==========================================
// ESPERAR A QUE APAREZCA UN CAMPO
// ==========================================

async function esperarCampo(idCampo, tiempoEspera = 5000) {
  const tiempoLimite = Date.now() + tiempoEspera;

  while (!document.getElementById(idCampo)) {
    if (Date.now() >= tiempoLimite) {
      throw new Error(`No apareció el campo ${idCampo}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return document.getElementById(idCampo);
}


// ==========================================
// OBTENER CAMPO SEGÚN EJE Y POSICIÓN
// ==========================================

function obtenerIdCampo(eje, posicion) {
  const MAX_EJES = 5;

  // El repuesto siempre utiliza el mismo campo,
  // independientemente del eje que venga de Supabase.
  if (posicion === "repuesto") {
    return "llanta-R-a";
  }

  // Validar el eje de las llantas normales.
  if (!Number.isInteger(eje) || eje < 1 || eje > MAX_EJES) {
    console.warn(`Eje inválido: ${eje}.`);
    return null;
  }

  // El primer eje tiene una llanta a cada lado.
  if (eje === 1) {
    if (posicion === "izquierda") {
      return "llanta-1-I-a";
    }

    if (posicion === "derecha" || posicion === "centro") {
      return "llanta-1-D-a";
    }

    console.warn(
      `La posición "${posicion}" no es válida para el eje 1.`,
    );

    return null;
  }

  // Los ejes 2 a 5 admiten llantas exteriores e interiores.
  const camposPorPosicion = {
    izquierda: `llanta-${eje}-IE-a`,
    izquierda_interior: `llanta-${eje}-II-a`,
    derecha_interior: `llanta-${eje}-DI-a`,
    derecha: `llanta-${eje}-DE-a`,
    centro: `llanta-${eje}-DE-a`,
  };

  const idCampo = camposPorPosicion[posicion];

  if (!idCampo) {
    console.warn(`Posición no reconocida: "${posicion}".`);
    return null;
  }

  return idCampo;
}


// ==========================================
// ASIGNAR PRESIÓN A UN CAMPO
// ==========================================

function asignarPresion(idCampo, valor) {
  const campo = document.getElementById(idCampo);

  if (!campo) {
    console.warn(`No se encontró el campo ${idCampo}.`);
    return false;
  }

  campo.value = Number(valor);

  // Ejecutar el evento que utiliza Tecmmas para guardar el cambio.
  campo.dispatchEvent(new Event("change", { bubbles: true }));

  console.log(`Presión inyectada: ${idCampo} = ${valor}`);

  return true;
}


// ==========================================
// INYECTAR TODAS LAS PRESIONES
// ==========================================

async function inyectarPresiones(presiones) {
  if (!Array.isArray(presiones)) {
    throw new Error(
      "Las presiones recibidas no tienen un formato válido.",
    );
  }

  // Esperar a que el diálogo tenga disponibles sus campos.
  await esperarCampo("llanta-1-I-a");

  let presionesInyectadas = 0;
  let presionesOmitidas = 0;

  for (const presion of presiones) {
    const posicion = String(presion.posicion ?? "")
      .trim()
      .toLowerCase();

    const eje = Number(presion.eje);
    const valor = presion.presion_ajustada;

    // Validar la presión ajustada.
    if (
      valor === null ||
      valor === undefined ||
      valor === "" ||
      !Number.isFinite(Number(valor))
    ) {
      console.warn("Presión ajustada inválida. Se omite:", presion);
      presionesOmitidas++;
      continue;
    }

    // Obtener el ID del campo que corresponde a la llanta.
    const idCampo = obtenerIdCampo(eje, posicion);

    if (!idCampo) {
      presionesOmitidas++;
      continue;
    }

    // Asignar la presión al campo.
    const inyectada = asignarPresion(idCampo, valor);

    if (inyectada) {
      presionesInyectadas++;
    } else {
      presionesOmitidas++;
    }
  }

  console.log("Resultado de la inyección:", {
    totalRecibidas: presiones.length,
    presionesInyectadas,
    presionesOmitidas,
  });

  // No continuar si ninguna presión pudo inyectarse.
  if (presionesInyectadas === 0 && presiones.length > 0) {
    throw new Error("No se pudo inyectar ninguna presión.");
  }

  // Evitar guardar silenciosamente una operación incompleta.
  if (presionesOmitidas > 0) {
    throw new Error(
      `La inyección quedó incompleta: ${presionesInyectadas} presiones inyectadas y ${presionesOmitidas} omitidas.`,
    );
  }
}













const CLAVE_REGISTRO = "registroPresionesDiario";
const CLAVE_PENDIENTES = "presionesPendientes";

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
// MARCAR ORDEN COMO INYECTADA
// ==========================================
async function marcarOrdenComoInyectada(idOrden, placa) {
  if (!idOrden) {
    throw new Error("No se recibió el serial único de la orden.");
  }

  const fechaActual = obtenerFechaLocal();
  const resultado = await chrome.storage.local.get(CLAVE_REGISTRO);

  let registro = resultado[CLAVE_REGISTRO];

  // Crear o reiniciar el registro si cambió el día.
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
  }

  // Recuperar la orden o crearla si todavía no estaba registrada.
  const orden = registro.ordenes[idOrden] ?? {
    placa,
    inyectada: false,
    fechaInyeccion: null,
  };

  // Actualizar únicamente la orden seleccionada.
  registro.ordenes[idOrden] = {
    ...orden,
    placa,
    inyectada: true,
    fechaInyeccion: new Date().toISOString(),
  };

  await chrome.storage.local.set({
    [CLAVE_REGISTRO]: registro,
  });

  console.log(`Orden ${idOrden} marcada como inyectada.`);
}

// ==========================================
// NAVEGAR DIRECTAMENTE A GESTIÓN
// ==========================================
function navegarAGestion() {
  const urlGestion =
    "http://192.168.0.100:8040/et/index.php/oficina/CGestion";

  console.log("Navegando directamente a Gestión...");

  window.location.href = urlGestion;
}

// ==========================================
// RECUPERAR Y PROCESAR LOS DATOS GUARDADOS
// ==========================================
async function procesarPaginaPlaca() {
  try {
    const datosGuardados = await chrome.storage.local.get(
      CLAVE_PENDIENTES
    );

    const presionesPendientes = datosGuardados[CLAVE_PENDIENTES];

    if (!presionesPendientes) {
      console.warn("No hay presiones pendientes.");
      return;
    }

    const { idOrden, placa, presiones } = presionesPendientes;

    if (!idOrden) {
      throw new Error(
        "Falta idOrden en presionesPendientes. " +
        "Debes guardarlo desde el popup antes de navegar."
      );
    }

    console.log("Orden:", idOrden);
    console.log("Placa:", placa);
    console.table(presiones);

    // PASO 1: Abrir el diálogo de presiones.
    const dialogoAbierto = abrirDialogoPresionInflado();

    if (!dialogoAbierto) {
      throw new Error(
        "No se encontró el botón Presión de inflado."
      );
    }

    console.log(`Diálogo abierto para la placa ${placa}.`);

    // PASO 2: Inyectar las presiones.
    await inyectarPresiones(presiones);

    console.log(`Presiones inyectadas para la placa ${placa}.`);

    // PASO 3: Guardar el estado de ESTA orden.
    await marcarOrdenComoInyectada(idOrden, placa);

    // PASO 4: Limpiar la operación pendiente.
    await chrome.storage.local.remove(CLAVE_PENDIENTES);

    // PASO 5: Volver a Gestión.
    navegarAGestion();

  } catch (error) {
    console.error(
      "Error al procesar la página de la placa:",
      error
    );

    // No borrar presionesPendientes aquí.
    // Si falla la operación, conservamos los datos para investigar
    // el error y evitar perder la información pendiente.
  }
}

// ==========================================
// INICIALIZAR
// ==========================================
void procesarPaginaPlaca();








