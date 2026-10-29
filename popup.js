const SUPABASE_URL = "https://lyktizihszlbmzzjrqye.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mm7Jq7xv6eCse0QMySrcVA_7mfvAA9b";
const EXTENSION_SECRET = "oJafEs8LySXwXlVkFFJZqXXdzKNnaOuk";
const TENANT_ID = "aaaaaaaa-0000-0000-0000-000000000001";







// ==========================================
// DECLARAR FUNCION MOSTRAR ESTADOS
// ==========================================

function mostrarEstado(divHTMLEstado, mensaje, tipo = "") {
  divHTMLEstado.textContent = mensaje;
  divHTMLEstado.className = "status-message";

  if (tipo) {
    divHTMLEstado.classList.add(tipo);
  }
}









// ==========================================
// REGISTRO DIARIO DE PLACAS
// ==========================================

const CLAVE_REGISTRO_DIARIO = "registroPresionesDiario";

// ==========================================
// OBTENER FECHA LOCAL
// Formato: YYYY-MM-DD
// ==========================================

function obtenerFechaLocal() {
  const ahora = new Date();

  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");

  return `${anio}-${mes}-${dia}`;
}

// ==========================================
// INICIALIZAR O LIMPIAR REGISTRO DIARIO
// ==========================================

async function inicializarRegistroDiario() {
  const fechaActual = obtenerFechaLocal();

  const resultado = await chrome.storage.local.get(
    CLAVE_REGISTRO_DIARIO
  );

  const registroGuardado = resultado[CLAVE_REGISTRO_DIARIO];

  if (
    !registroGuardado ||
    registroGuardado.fecha !== fechaActual ||
    !registroGuardado.ordenes ||
    typeof registroGuardado.ordenes !== "object" ||
    Array.isArray(registroGuardado.ordenes)
  ) {
    const registroNuevo = {
      fecha: fechaActual,
      ordenes: {},
    };

    
    await chrome.storage.local.set({
      [CLAVE_REGISTRO_DIARIO]: registroNuevo,
    });

    console.log(
      `Registro diario inicializado para ${fechaActual}.`
    );

    return registroNuevo;
  }

  console.log(
    `Registro diario recuperado para ${fechaActual}.`
  );

  return registroGuardado;
}














// ==========================================
// DECLARAR FUNCION DESHABILITAR CONTROLES
// ==========================================
function deshabilitarControles(selectHTMLPlaca, botonHTMLInyectar) {
  selectHTMLPlaca.disabled = true;
  botonHTMLInyectar.disabled = true;
}

// ==========================================
// DECLARAR FUNCION INYECTAR PLACAS EN EL SELECT
// ==========================================

function llenarSelectPlacas(
  ordenes,
  divHTMLEstado,
  selectHTMLPlaca,
  botonHTMLInyectar
) {
  selectHTMLPlaca.replaceChildren();

  const opcionInicial = document.createElement("option");
  opcionInicial.value = "";
  opcionInicial.textContent = "Selecciona una placa";
  opcionInicial.disabled = true;
  opcionInicial.selected = true;

  selectHTMLPlaca.appendChild(opcionInicial);

  const listaOrdenes = Array.isArray(ordenes) ? ordenes : [];

  listaOrdenes.forEach(({ placa, idOrden }) => {
    if (!placa || !idOrden) return;

    const opcion = document.createElement("option");

    // El value es el identificador único de la orden.
    opcion.value = idOrden;
    opcion.textContent = `${placa} — ${idOrden}`;

    // Conservamos la placa por separado.
    opcion.dataset.placa = placa;

    selectHTMLPlaca.appendChild(opcion);
  });

  selectHTMLPlaca.disabled = listaOrdenes.length === 0;
  botonHTMLInyectar.disabled = true;

  if (listaOrdenes.length === 0) {
    mostrarEstado(
      divHTMLEstado,
      "No se encontraron órdenes en pista.",
      "warning"
    );
  }
}









// ==========================================
// DECLARAR FUNCION ASINCTRONA CONSULTAR PRESIONES EN SUPABASE
// ==========================================

async function consultarPresionesSupabase(placa, divHTMLEstado) {
  console.log("Consultando presiones para:", placa);

  const url = `${SUPABASE_URL}/functions/v1/consultar-presiones`;

  const respuesta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "X-Extension-Secret": EXTENSION_SECRET,
    },
    body: JSON.stringify({
      tenant_id: TENANT_ID,
      placa: placa,
    }),
  });

  let resultado;

  try {
    resultado = await respuesta.json();
  } catch {
    throw new Error("La Edge Function devolvió una respuesta inválida.");
  }

  if (!respuesta.ok || !resultado.success) {
    throw new Error(resultado.error || `Error HTTP ${respuesta.status}`);
  }

  if (!resultado.encontrado) {
    mostrarEstado(
      divHTMLEstado,
      `No se encontró una orden para la placa ${placa}.`,
      "warning",
    );

    return resultado;
  }

  if (resultado.presiones.length === 0) {
    mostrarEstado(
      divHTMLEstado,
      `La orden más reciente de ${placa} no tiene presiones registradas.`,
      "warning",
    );

    return resultado;
  }

  console.log("Orden encontrada:", resultado.orden);
  console.table(resultado.presiones);

  mostrarEstado(
    divHTMLEstado,
    `Se encontraron ${resultado.cantidad_presiones} registros de presión para ${placa}.`,
    "success",
  );

  return resultado;
}








// ==========================================
// DECLARAR FUNCION ASYNC VERIFICAR PESTAÑA ACTIVA
// ==========================================
async function verificarPestanaActiva(
  divHTMLEstado,
  selectHTMLPlaca,
  botonHTMLInyectar,
  estadoPestana,
) {
  try {
    const pestanasGestion = await chrome.tabs.query({
      url: ["http://192.168.0.100:8040/et/index.php/oficina/CGestion*"],
    });

    if (pestanasGestion.length === 0) {
      estadoPestana.id = null;
      deshabilitarControles(selectHTMLPlaca, botonHTMLInyectar);
      llenarSelectPlacas([], divHTMLEstado, selectHTMLPlaca, botonHTMLInyectar);
      mostrarEstado(
        divHTMLEstado,
        "No se ha detectado el Panel de gestión de Tecmmas.",
        "error",
      );
      return;
    }

		//obtiene la pestaña en la que esta parado el usuario
    const pestanasActivas = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });

		//separa esactamente la pestaña activa de la lista de activas
    const pestanaActiva = pestanasActivas[0];

		//compara entonces si la pestaña abierta o la que tiene el focus es la misma que la pestaña con la url de teccmas, si es asi entonces la guarda en gestionActiva
    const gestionActiva = pestanaActiva && pestanasGestion.some((pestana) => pestana.id === pestanaActiva.id);

    if (!gestionActiva) {
      estadoPestana.id = pestanasGestion[0].id;
      deshabilitarControles(selectHTMLPlaca, botonHTMLInyectar);
      llenarSelectPlacas([], divHTMLEstado, selectHTMLPlaca, botonHTMLInyectar);
      mostrarEstado(
        divHTMLEstado,
        "Tecmmas está abierto, pero no estás situado en su Panel de gestión. Cambia a esa pestaña para continuar.",
        "warning",
      );
      return;
    }

    estadoPestana.id = pestanaActiva.id;

    mostrarEstado(
      divHTMLEstado,
      "Estás situado en el Panel de gestión de Tecmmas.",
      "success",
    );

    console.log("Panel de gestión activo:", pestanaActiva.url);

    const respuesta = await chrome.tabs.sendMessage(estadoPestana.id, {
      accion: "obtenerPlacas",
    });

    console.log("Placas obtenidas", respuesta);

    if (respuesta?.ok && Array.isArray(respuesta.placas)) {
      llenarSelectPlacas(respuesta.placas, divHTMLEstado, selectHTMLPlaca, botonHTMLInyectar);
    } else {
      deshabilitarControles(selectHTMLPlaca, botonHTMLInyectar);
      llenarSelectPlacas([], divHTMLEstado, selectHTMLPlaca, botonHTMLInyectar);

      mostrarEstado(
        divHTMLEstado,
        "No fue posible obtener las placas de Tecmmas.",
        "error",
      );
    }
  } catch (error) {
    console.error("Error verificando pestaña:", error);

    estadoPestana.id = null;
    deshabilitarControles(selectHTMLPlaca, botonHTMLInyectar);
    llenarSelectPlacas([], divHTMLEstado, selectHTMLPlaca, botonHTMLInyectar);

    mostrarEstado(
      divHTMLEstado,
      "No fue posible verificar la pestaña de Tecmmas.",
      "error",
    );
  }
}



















async function inyectarPresionesTecmmas(
  idOrden,
  placa,
  presiones,
  estadoPestana
) {
  if (estadoPestana.id === null) {
    throw new Error("No hay una pestaña de Tecmmas seleccionada.");
  }

  const respuesta = await chrome.tabs.sendMessage(
  estadoPestana.id,
  {
    accion: "inyectarPresiones",
    idOrden,
    placa,
    presiones,
  }
);

  if (!respuesta?.ok) {
    throw new Error(
      respuesta?.error || "No fue posible inyectar las presiones en Tecmmas.",
    );
  }

  return respuesta;
}




















document.addEventListener("DOMContentLoaded", async () => {




// ==========================================
  // INICIALIZAR REGISTRO DIARIO
  // ==========================================

  await inicializarRegistroDiario();

 

  // ==========================================
  // RESTO DE TU CÓDIGO ACTUAL
  // ==========================================



  // ==========================================
  // OBTENER ELEMENTOS A MODIFICAR
  // ==========================================
  const divHTMLEstado = document.getElementById("estado");
  const selectHTMLPlaca = document.getElementById("placa");
  const botonHTMLInyectar = document.getElementById("btn-inyectar");

  const estadoPestana = { id: null };

  // ==========================================
  // ADD LISTENER DESHABILITAR EL BOTON
  // ==========================================
	//cada vez que cambia el select, el boton se deshabilita en el caso de que el select este deshabilitado o el select no tenga valor
  selectHTMLPlaca.addEventListener("change", () => {
    botonHTMLInyectar.disabled = selectHTMLPlaca.disabled || selectHTMLPlaca.value === "";
  });

  // ==========================================
  // ADD LISTENER CLICK EN EL BOTON
  // ==========================================
  botonHTMLInyectar.addEventListener("click", async () => {
		// Limpiar datos pendientes de una operación anterior.

    const opcionSeleccionada =
  selectHTMLPlaca.selectedOptions[0];

const idOrden = opcionSeleccionada?.value;

const placaSeleccionada =
  opcionSeleccionada?.dataset.placa;

if (!idOrden || !placaSeleccionada) {
  return;
}

    if (!placaSeleccionada) {
      return;
    }

    botonHTMLInyectar.disabled = true;

		await chrome.storage.local.remove("presionesPendientes");

    mostrarEstado(
      divHTMLEstado,
      `Consultando presiones para ${placaSeleccionada}...`,
      "warning",
    );

    try {
			
       const resultado = await consultarPresionesSupabase(
    placaSeleccionada,
    divHTMLEstado,
  );

  if (!resultado?.encontrado || !resultado.presiones?.length) {
  throw new Error(
    `No se encontraron presiones para ${placaSeleccionada}.`
  );
}


  // ==========================================
    // DATOS DE PRUEBA
    // ==========================================

    //const placaPrueba = placaSeleccionada;


    /** 
const presionesPrueba = [
  // ==========================================
  // EJE 1: DELANTERO (2 LLANTAS)
  // ==========================================
  {
    eje: 1,
    posicion: "izquierda",
    presion_encontrada: 30,
    presion_ajustada: 32,
  },
  {
    eje: 1,
    posicion: "derecha",
    presion_encontrada: 29,
    presion_ajustada: 32,
  },

  // ==========================================
  // EJE 2: TRASERO (2 LLANTAS)
  // ==========================================
  {
    eje: 2,
    posicion: "izquierda",
    presion_encontrada: 31,
    presion_ajustada: 34,
  },
  {
    eje: 2,
    posicion: "derecha",
    presion_encontrada: 30,
    presion_ajustada: 34,
  },

  // ==========================================
  // REPUESTO
  // ==========================================
  {
    eje: 2,
    posicion: "repuesto",
    presion_encontrada: 28,
    presion_ajustada: 32,
  },
];
*/

    // ==========================================
    // INYECTAR EN TECMMAS
    // ==========================================

		await chrome.storage.local.set({
    presionesPendientes: {
      idOrden, // Serial único del botón Ver
        placa: placaSeleccionada,
        presiones:  resultado.presiones,
    },
});

   await inyectarPresionesTecmmas(
  idOrden,
  placaSeleccionada,
   resultado.presiones,
  estadoPestana
);

    mostrarEstado(
        divHTMLEstado,
        `Inyección ejecutada para ${placaSeleccionada}.`,
        "success",
    );





    } catch (error) {
     console.error("Error procesando las presiones:", error);

  mostrarEstado(
    divHTMLEstado,
    error.message || "No fue posible completar la operación.",
    "error",
  );
    } finally {
      botonHTMLInyectar.disabled = selectHTMLPlaca.disabled || selectHTMLPlaca.value === "";
    }
  });

  // ==========================================
  // ADD LISTENER DE CHROME
  // ==========================================

  chrome.tabs.onActivated.addListener(() => {
    verificarPestanaActiva(divHTMLEstado, selectHTMLPlaca, botonHTMLInyectar, estadoPestana);
  });

  chrome.windows.onFocusChanged.addListener(() => {
    verificarPestanaActiva(divHTMLEstado, selectHTMLPlaca, botonHTMLInyectar, estadoPestana);
  });

  // ==========================================
  // INICIALIZAR
  // ==========================================

  await verificarPestanaActiva(
    divHTMLEstado,
    selectHTMLPlaca,
    botonHTMLInyectar,
    estadoPestana,
  );
});
