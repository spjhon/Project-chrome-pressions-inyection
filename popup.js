
document.addEventListener("DOMContentLoaded", async () => {
    const estado = document.getElementById("estado");
    const selectPlaca = document.getElementById("placa");
    const botonInyectar = document.getElementById("btn-inyectar");

    // ==========================================
    // MOSTRAR MENSAJES EN EL POPUP
    // ==========================================

    function mostrarEstado(mensaje, tipo = "") {
        estado.textContent = mensaje;
        estado.className = "status-message";

        if (tipo) {
            estado.classList.add(tipo);
        }
    }

    // ==========================================
    // DETECTAR PANEL DE GESTIÓN TECMMAS
    // ==========================================

    async function detectarPanelGestion() {
        mostrarEstado("Buscando el Panel de gestión de Tecmmas...");

        // Mantener deshabilitados los controles mientras verificamos
        selectPlaca.disabled = true;
        botonInyectar.disabled = true;

        try {
            const pestanas = await chrome.tabs.query({
                url: [
                    "http://192.168.0.100:8040/et/index.php/oficina/CGestion",
                    "http://192.168.0.100:8040/et/index.php/oficina/CGestion?*",
                    "http://192.168.0.100:8040/et/index.php/oficina/CGestion/*"
                ]
            });

            if (pestanas.length === 0) {
                mostrarEstado(
                    "No se ha detectado el Panel de gestión de Tecmmas.",
                    "error"
                );

                console.warn(
                    "No se encontró ninguna pestaña del Panel de gestión de Tecmmas."
                );

                return;
            }

            const pestanaGestion = pestanas.find(
                pestana => Number.isInteger(pestana.id)
            );

            if (!pestanaGestion) {
                mostrarEstado(
                    "Se encontró una coincidencia, pero no se pudo identificar la pestaña de Tecmmas.",
                    "error"
                );

                return;
            }

            mostrarEstado(
                "Panel de gestión de Tecmmas detectado correctamente.",
                "success"
            );

            console.log(
                "Panel de gestión detectado:",
                pestanaGestion.url
            );

            // Guardar el ID para utilizarlo en el siguiente paso
            window.pestanaGestionId = pestanaGestion.id;

        } catch (error) {
            console.error(
                "Error al detectar el Panel de gestión:",
                error
            );

            mostrarEstado(
                "Ocurrió un error al intentar detectar el Panel de gestión de Tecmmas.",
                "error"
            );
        }
    }

    // ==========================================
    // INICIALIZAR POPUP
    // ==========================================

    await detectarPanelGestion();
});
