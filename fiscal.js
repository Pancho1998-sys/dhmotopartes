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
            // Un chequeo básico para ver si la función responde (se puede enviar una llamada vacía o similar)
            const { data, error } = await supabaseClient.functions.invoke('arca-wsfe', {
                body: {} // Envío vacío sólo para ver respuesta
            });
            // Si el error es sólo de validación de datos (422) o de autenticación, la función está online.
            if (error && error.status === 404) {
                return { online: false, error: "Función no encontrada en Supabase." };
            }
            return { online: true, message: "Servicio Edge Function de facturación disponible." };
        } catch (e) {
            console.error("Error al obtener estado fiscal:", e);
            return { online: false, error: e.message };
        }
    }

    async emitirComprobante(venta, configFiscal) {
        try {
            // Determinar tipo de comprobante (cbte_tipo)
            // 1=Fac A, 6=Fac B, 11=Fac C
            let cbteTipo = 11; // Por defecto Factura C (Monotributo)
            
            // Cargar datos del cliente
            let docTipo = 99; // Consumidor Final sin documento por defecto
            let docNro = 0;
            let condIvaReceptor = 5; // Consumidor Final por defecto

            if (venta.customerId) {
                // Si la venta tiene cliente, lo buscamos en el estado actual
                const customer = state.customers.find(c => c.id === venta.customerId);
                if (customer) {
                    docTipo = parseInt(customer.doc_tipo) || 96; // DNI por defecto si no está especificado
                    docNro = parseInt(String(customer.dni || '').replace(/\D/g, '')) || 0;
                    condIvaReceptor = parseInt(customer.cond_iva_receptor) || 5; // Consumidor Final por defecto
                }
            }

            // Si el emisor es Responsable Inscripto (RI)
            if (configFiscal.iva_condition === 'RI') {
                if (condIvaReceptor === 1) {
                    cbteTipo = 1; // Factura A
                } else {
                    cbteTipo = 6; // Factura B
                }
            } else {
                cbteTipo = 11; // Factura C
            }

            // Construir los montos del payload de IVA
            let impTotal = Math.round(venta.total * 100) / 100;
            let impNeto = impTotal;
            let impIva = 0;
            let ivaList = [];

            // Factura A y B discriminan IVA (solo si el emisor es RI)
            if (configFiscal.iva_condition === 'RI' && (cbteTipo === 1 || cbteTipo === 6)) {
                // Defaultear a 21% (id 5)
                impNeto = Math.round((impTotal / 1.21) * 100) / 100;
                impIva = Math.round((impTotal - impNeto) * 100) / 100;
                ivaList = [{
                    id: 5, // 21%
                    base_imp: impNeto,
                    importe: impIva
                }];
            } else {
                // Para Factura C (u otros sin IVA discriminado)
                impNeto = impTotal;
                impIva = 0;
                ivaList = [];
            }

            const payload = {
                cbte_tipo: cbteTipo,
                concepto: 1, // 1 = Productos (repuestos/motos)
                doc_tipo: docTipo,
                doc_nro: docNro,
                cond_iva_receptor: condIvaReceptor,
                imp_total: impTotal,
                imp_neto: impNeto,
                imp_iva: impIva,
                imp_trib: 0,
                imp_op_ex: 0,
                imp_tot_conc: 0,
                iva: ivaList
            };

            console.log("Invocando arca-wsfe con payload:", payload);

            const { data, error } = await supabaseClient.functions.invoke('arca-wsfe', {
                body: payload
            });

            if (error) {
                console.error("Error devuelto por la Edge Function arca-wsfe:", error);
                return { success: false, error: error.message || "Error al invocar facturador de Supabase" };
            }

            if (!data || data.ok === false) {
                const errMsg = data ? (data.errores || data.observaciones || data.error || "Rechazado por ARCA") : "Respuesta vacía del servidor";
                console.warn("ARCA rechazó el comprobante:", data);
                return { 
                    success: false, 
                    error: typeof errMsg === 'object' ? JSON.stringify(errMsg) : String(errMsg) 
                };
            }

            // Exito: retornar estructura esperada por app.js
            return {
                success: true,
                nroComprobante: `${String(data.pos_number).padStart(4, '0')}-${String(data.nro).padStart(8, '0')}`,
                cae: data.cae,
                caeFchVto: data.cae_vto ? `${data.cae_vto.slice(0, 4)}-${data.cae_vto.slice(4, 6)}-${data.cae_vto.slice(6, 8)}` : "", // Formatear AAAAMMDD a AAAA-MM-DD
                entorno: configFiscal.environment || 'homologacion'
            };
        } catch (e) {
            console.error("Excepción en ARCAFacturadorAPI.emitirComprobante:", e);
            return { success: false, error: e.message };
        }
    }
}

// Variable global del facturador en el scope de window
window.facturador = null;

/**
 * Inicializa el facturador correspondiente según la configuración.
 */
function initFacturador() {
    // Si Supabase está inicializado, apuntamos a la Edge Function de Supabase, en caso contrario usamos el Mock
    if (typeof supabaseInitialized !== 'undefined' && supabaseInitialized && typeof supabaseClient !== 'undefined' && supabaseClient) {
        const supabaseUrl = supabaseClient.supabaseUrl;
        window.facturador = new ARCAFacturadorAPI(`${supabaseUrl}/functions/v1/arca-wsfe`);
    } else {
        window.facturador = new MockFacturador();
    }
    console.log("Facturador electrónico inicializado:", window.facturador.constructor.name);
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
    const cuitClean = cuit.trim();
    const posInt = parseInt(posNumber) || 1;
    const ivaClean = ivaCondition;
    const envClean = environment || 'homologacion';

    if (typeof supabaseInitialized !== 'undefined' && supabaseInitialized && typeof supabaseClient !== 'undefined' && supabaseClient && typeof myStoreId !== 'undefined' && myStoreId) {
        // Enviar a la Edge Function
        const { data, error } = await supabaseClient.functions.invoke('fiscal-config', {
            body: {
                cuit: cuitClean,
                pos_number: posInt,
                iva_condition: ivaClean,
                environment: envClean,
                certificate_pem: certText ? certText.trim() : "",
                private_key_pem: keyText ? keyText.trim() : ""
            }
        });

        if (error) {
            console.error("Error al invocar fiscal-config:", error);
            throw new Error(error.message || "Error al comunicarse con el servidor fiscal");
        }
        if (data && data.error) {
            throw new Error(data.error);
        }

        // Si se guardó con éxito en Supabase, guardamos en LocalStorage SOLO los campos de visualización/display
        const storeKey = myStoreId;
        const localDisplayData = {
            cuit: cuitClean,
            pos_number: posInt,
            iva_condition: ivaClean,
            environment: envClean,
            cert_expires_at: data.cert_expires_at || null
        };
        localStorage.setItem(`dhmotopartes_fiscal_${storeKey}`, JSON.stringify(localDisplayData));

        return true;
    }

    // Fallback Offline / LocalStorage sin credenciales sensibles
    const storeKey = (typeof myStoreId !== 'undefined' && myStoreId) ? myStoreId : 'local';
    const localDisplayData = {
        cuit: cuitClean,
        pos_number: posInt,
        iva_condition: ivaClean,
        environment: envClean,
        cert_expires_at: null
    };
    localStorage.setItem(`dhmotopartes_fiscal_${storeKey}`, JSON.stringify(localDisplayData));
    return true;
}
