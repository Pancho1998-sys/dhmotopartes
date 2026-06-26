/* ==========================================================================
   DHMotopartes - Facturación Electrónica ARCA (AFIP) Integration
   ========================================================================== */

/**
 * Clase abstracta que define la interfaz del facturador electrónico.
 */
class FacturadorElectronico {
    /**
     * Comprueba si el servicio de facturación está disponible.
     * @returns {Promise<{online: boolean, message?: string, error?: string}>}
     */
    async obtenerEstado() {
        throw new Error("Método 'obtenerEstado' no implementado.");
    }

    /**
     * Solicita la emisión de un comprobante electrónico (CAE).
     * @param {Object} venta - Objeto de venta con items, total, etc.
     * @param {Object} configFiscal - CUIT, punto de venta, condición de IVA, etc.
     * @returns {Promise<{success: boolean, nroComprobante?: string, cae?: string, caeFchVto?: string, error?: string}>}
     */
    async emitirComprobante(venta, configFiscal) {
        throw new Error("Método 'emitirComprobante' no implementado.");
    }
}

/**
 * Facturador de simulación (Mock) para pruebas locales, homologación y modo offline.
 */
class MockFacturador extends FacturadorElectronico {
    async obtenerEstado() {
        return { online: true, message: "Servicio de simulación ARCA disponible." };
    }

    async emitirComprobante(venta, configFiscal) {
        return new Promise((resolve) => {
            setTimeout(() => {
                if (!configFiscal || !configFiscal.cuit || !configFiscal.pos_number) {
                    resolve({
                        success: false,
                        error: "Configuración fiscal incompleta (Falta CUIT o Punto de Venta)."
                    });
                    return;
                }

                // Generar un número de factura secuencial simulado
                const randomInvoiceNum = Math.floor(100000 + Math.random() * 900000);
                const posStr = String(configFiscal.pos_number).padStart(4, '0');
                const nroComStr = String(randomInvoiceNum).padStart(8, '0');
                
                // Generar un CAE de 14 dígitos simulado
                const cae = String(Math.floor(10000000000000 + Math.random() * 90000000000000));
                
                // Fecha de vencimiento a 10 días
                const vto = new Date();
                vto.setDate(vto.getDate() + 10);
                const vtoStr = vto.toISOString().split('T')[0];

                resolve({
                    success: true,
                    nroComprobante: `${posStr}-${nroComStr}`,
                    cae: cae,
                    caeFchVto: vtoStr,
                    entorno: configFiscal.environment || 'homologacion'
                });
            }, 1000);
        });
    }
}

/**
 * Cliente de API real que se conecta a Supabase Edge Functions u otro proxy servidor.
 */
class ARCAFacturadorAPI extends FacturadorElectronico {
    constructor(apiUrl) {
        super();
        this.apiUrl = apiUrl;
    }

    async obtenerEstado() {
        try {
            const res = await fetch(`${this.apiUrl}/status`);
            if (!res.ok) throw new Error(`El servidor respondió con código ${res.status}`);
            return await res.json();
        } catch (e) {
            console.error("Error al obtener estado fiscal:", e);
            return { online: false, error: e.message };
        }
    }

    async emitirComprobante(venta, configFiscal) {
        try {
            const res = await fetch(`${this.apiUrl}/emitir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ venta, configFiscal })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Error del servidor de facturación (${res.status})`);
            }
            return await res.json();
        } catch (e) {
            console.error("Error al emitir factura electrónica:", e);
            return { success: false, error: e.message };
        }
    }
}

// Variable global del facturador
let facturador = null;

/**
 * Inicializa el facturador correspondiente según la configuración.
 */
function initFacturador() {
    // Si Supabase está inicializado, apuntamos a la Edge Function de Supabase, en caso contrario usamos el Mock
    if (typeof supabaseInitialized !== 'undefined' && supabaseInitialized && typeof supabaseClient !== 'undefined' && supabaseClient) {
        const supabaseUrl = supabaseClient.supabaseUrl;
        facturador = new ARCAFacturadorAPI(`${supabaseUrl}/functions/v1/arca-wsfe`);
    } else {
        facturador = new MockFacturador();
    }
    console.log("Facturador electrónico inicializado:", facturador.constructor.name);
}

/**
 * Carga la configuración fiscal de la tienda.
 * Soporta modo Supabase (en la nube) y modo local/offline (LocalStorage).
 */
async function loadFiscalConfig() {
    if (typeof supabaseInitialized !== 'undefined' && supabaseInitialized && typeof supabaseClient !== 'undefined' && supabaseClient && typeof myStoreId !== 'undefined' && myStoreId) {
        try {
            const { data, error } = await supabaseClient
                .from('store_fiscal_configs')
                .select('*')
                .eq('store_id', myStoreId)
                .maybeSingle();

            if (error) {
                console.error("Error al obtener configuración fiscal de Supabase:", error);
            }
            return data || null;
        } catch (e) {
            console.error("Excepción al cargar configuración fiscal:", e);
        }
    }
    
    // Fallback Offline / LocalStorage
    const storeKey = (typeof myStoreId !== 'undefined' && myStoreId) ? myStoreId : 'local';
    const localData = localStorage.getItem(`dhmotopartes_fiscal_${storeKey}`);
    return localData ? JSON.parse(localData) : null;
}

/**
 * Guarda la configuración fiscal de la tienda.
 * Soporta modo Supabase (en la nube) y modo local/offline (LocalStorage).
 */
async function saveFiscalConfig(cuit, posNumber, ivaCondition, environment, certText, keyText) {
    const configData = {
        cuit: cuit.trim(),
        pos_number: parseInt(posNumber) || 1,
        iva_condition: ivaCondition,
        environment: environment || 'homologacion',
        certificate_text: certText ? certText.trim() : null,
        private_key_text: keyText ? keyText.trim() : null
    };

    if (typeof supabaseInitialized !== 'undefined' && supabaseInitialized && typeof supabaseClient !== 'undefined' && supabaseClient && typeof myStoreId !== 'undefined' && myStoreId) {
        const { error } = await supabaseClient
            .from('store_fiscal_configs')
            .upsert({
                store_id: myStoreId,
                ...configData,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
        return true;
    }

    // Fallback Offline / LocalStorage
    const storeKey = (typeof myStoreId !== 'undefined' && myStoreId) ? myStoreId : 'local';
    localStorage.setItem(`dhmotopartes_fiscal_${storeKey}`, JSON.stringify(configData));
    
    // Si estamos en modo offline pero con el servidor Python corriendo, 
    // registramos la necesidad de sincronización en segundo plano de ser necesario.
    return true;
}
