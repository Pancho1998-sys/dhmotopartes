/* ==========================================================================
   DHMotopartes - Core Logic & State Management
   ========================================================================== */

// App State Definition
let state = {
    products: [],
    cart: [],
    sales: [],
    customers: [],
    cashMovements: [],
    settings: {
        storeName: "Macutech",
        storeAddress: "Av. Libertador 2450, Ciudad",
        storePhone: "+54 9 11 5555-1234",
        currency: "$",
        storeTax: 15,
        categories: ['Sistema Eléctrico', 'Repuestos de Motor', 'Frenos', 'Transmisión', 'Herramientas', 'Accesorios'],
        logo: "",
        cardBgType: "default",
        cardBgColor: "#1f2937",
        cardBgColorHover: "#26354a",
        cardBgImage: ""
    }
};

// Database Key
const STORAGE_KEY = 'dhmotopartes_db';
let firebaseSyncActive = false;

// Temporary branding variables
let tempLogoBase64 = null;
let tempCardBgImageBase64 = null;
let tempProductImageBase64 = "";
let activeCatalogCategory = '';

// Pagination state
let inventoryPage = 1;
const itemsPerPage = 8;
let customersPage = 1;
let historyPage = 1;
let cajaPage = 1;

// Barcode scanner buffer
let barcodeBuffer = '';
let lastKeyTime = 0;

/* ==========================================================================
   Initialization & Authentication
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    setupAuthentication();
    initRouter();
    initDatetime();
    setupEventListeners();
    setupBarcodeListener();
    // setupCajeroRegistration();
    
    // Listen for custom hash changes
    window.addEventListener('hashchange', handleRoute);
});

// Update connection status label on sidebar
function updateSidebarStatus(online, text) {
    const dot = document.getElementById('store-status-dot');
    const label = document.getElementById('store-status-text');
    if (dot) {
        dot.className = online ? "status-dot online pulse" : "status-dot offline";
    }
    if (label) {
        label.textContent = text;
    }
}

let currentUserRole = 'usuario';
let currentUserProfile = null;
let myStoreId = null;

// Setup Supabase Auth & Login UI flow
function setupAuthentication() {
    const loginOverlay = document.getElementById('login-overlay');
    const loginForm = document.getElementById('login-form');
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    const loginError = document.getElementById('login-error-message');
    const loginStatus = document.getElementById('login-status-notice');
    const loginBtnLocal = document.getElementById('login-btn-local');
    const btnLogout = document.getElementById('btn-logout');
    
    // Set up logout button click listener
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if (supabaseInitialized && supabaseClient) {
                await supabaseClient.auth.signOut();
                playScanSound('warning');
            } else {
                alert("Sesión local finalizada.");
                window.location.reload();
            }
        });
    }

    if (!supabaseInitialized) {
        // Supabase is not configured yet. Show local mode notice and let user bypass.
        if (loginOverlay) {
            loginOverlay.classList.add('active');
            loginOverlay.style.display = 'flex';
        }
        if (loginStatus) {
            loginStatus.innerHTML = `⚠️ <strong>Base de datos en la nube no configurada.</strong><br>Completa las credenciales en <code>supabase-config.js</code> para conectar el sistema a internet.`;
        }
        if (loginBtnLocal) {
            loginBtnLocal.style.display = 'block';
            loginBtnLocal.addEventListener('click', () => {
                if (loginOverlay) {
                    loginOverlay.classList.remove('active');
                    loginOverlay.style.display = 'none';
                }
                loadDatabase(); // Loads local/demo data
                renderApp();
            });
        }
        // Disable submit button since there is no Supabase to authenticate against
        const btnSubmit = document.getElementById('login-btn-submit');
        if (btnSubmit) btnSubmit.disabled = true;
        return;
    }

    // Supabase is configured!
    if (loginOverlay) {
        loginOverlay.classList.add('active');
        loginOverlay.style.display = 'flex';
    }
    if (loginStatus) {
        loginStatus.textContent = "Ingresa tus credenciales para acceder a la base de datos remota.";
    }

    // Set up Supabase auth state listener
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
            const user = session.user;
            console.log("Usuario autenticado en Supabase:", user.email);
            
            try {
                // Fetch profile and check role
                let { data: profile, error } = await supabaseClient
                    .from('user_profiles')
                    .select('first_name, last_name, dni, role, store_id')
                    .eq('id', user.id)
                    .single();
                
                if (error || !profile) {
                    console.error("Error al obtener perfil, reintentando...", error);
                    await new Promise(r => setTimeout(r, 800));
                    const { data: retryProfile } = await supabaseClient
                        .from('user_profiles')
                        .select('first_name, last_name, dni, role, store_id')
                        .eq('id', user.id)
                        .single();
                    if (!retryProfile) {
                        alert("Error al cargar perfil de usuario en la base de datos.");
                        await supabaseClient.auth.signOut();
                        return;
                    }
                    profile = retryProfile;
                }
                
                // Authorize
                if (profile.role !== 'admin' && profile.role !== 'superadmin' && profile.role !== 'saas_admin' && profile.role !== 'cajero') {
                    alert("Acceso denegado: Este panel es exclusivo para Cajeros, Administradores, Superadministradores o SaaS Admin.");
                    await supabaseClient.auth.signOut();
                    return;
                }
                
                if (profile.role !== 'saas_admin' && !profile.store_id) {
                    alert("Error: Tu cuenta no está vinculada a ninguna tienda (store_id nulo). Contacta al administrador.");
                    await supabaseClient.auth.signOut();
                    return;
                }
                
                currentUserRole = profile.role;
                currentUserProfile = profile;
                myStoreId = profile.store_id;
                
                const initials = ((profile.first_name || '')[0] || '') + ((profile.last_name || '')[0] || '');
                const emailInitials = initials.toUpperCase() || user.email.slice(0, 2).toUpperCase();
                
                const avatarEl = document.getElementById('user-avatar');
                const nameEl = document.getElementById('user-name-display');
                
                if (avatarEl) avatarEl.textContent = emailInitials;
                if (nameEl) nameEl.textContent = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || user.email.split('@')[0];
                if (btnLogout) btnLogout.style.display = 'inline-flex';
                
                if (loginOverlay) {
                    loginOverlay.classList.remove('active');
                    loginOverlay.style.display = 'none';
                }
                
                // Show/Hide panels based on cajero role
                const navItemsToHide = ['nav-dashboard', 'nav-inventario', 'nav-clientes', 'nav-historial', 'nav-caja', 'nav-configuracion'];
                if (currentUserRole === 'cajero') {
                    navItemsToHide.forEach(id => {
                        const el = document.getElementById(id);
                        if (el && el.parentElement) el.parentElement.style.display = 'none';
                    });
                    if (window.location.hash === '#dashboard' || window.location.hash === '') {
                        window.location.hash = '#pos';
                    }
                } else {
                    navItemsToHide.forEach(id => {
                        const el = document.getElementById(id);
                        if (el && el.parentElement) el.parentElement.style.display = 'block';
                    });
                }

                // Show/Hide SaaS panel link if global admin
                const navSaas = document.getElementById('nav-item-saas');
                if (navSaas) {
                    if (currentUserRole === 'saas_admin') {
                        navSaas.style.display = 'block';
                        window.location.hash = '#saas';
                        loadSaasStores();
                    } else {
                        navSaas.style.display = 'none';
                    }
                }
                
                // Show/Hide cashier management if superadmin
                const cajerosPanel = document.getElementById('superadmin-cajeros-panel');
                if (cajerosPanel) {
                    if (currentUserRole === 'superadmin') {
                        cajerosPanel.style.display = 'block';
                        renderCajerosList();
                    } else {
                        cajerosPanel.style.display = 'none';
                    }
                }
                
                // Load DB from Supabase (Skip loading store DB if saas_admin)
                if (currentUserRole !== 'saas_admin') {
                    await loadDatabase();
                }
                
            } catch (err) {
                console.error("Auth state processing failed:", err);
            }
        } else {
            console.log("Usuario desautenticado.");
            currentUserRole = 'usuario';
            currentUserProfile = null;
            myStoreId = null;
            
            if (loginOverlay) {
                loginOverlay.classList.add('active');
                loginOverlay.style.display = 'flex';
            }
            if (btnLogout) btnLogout.style.display = 'none';
            
            // Clean active sync state if logging out
            firebaseSyncActive = false;
            // Clear realtime channel
            try {
                supabaseClient.channel('public:store_states').unsubscribe();
            } catch(e){}
        }
    });

    // Handle login form submit
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = loginEmail.value.trim();
            const password = loginPassword.value;
            
            if (loginError) loginError.style.display = 'none';
            const btnSubmit = document.getElementById('login-btn-submit');
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = `<i data-lucide="loader" class="animate-spin" style="animation: spin 1s linear infinite;"></i> Cargando...`;
                if (window.lucide) lucide.createIcons();
            }
            
            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });
                
                if (error) throw error;
                playScanSound('success');
            } catch (error) {
                console.error("Error al iniciar sesión:", error);
                playScanSound('fail');
                if (loginError) {
                    loginError.style.display = 'block';
                    loginError.textContent = "Error: " + getFriendlyAuthErrorMessage(error);
                }
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = `<i data-lucide="log-in"></i> Acceder al Sistema`;
                    if (window.lucide) lucide.createIcons();
                }
            }
        });
    }
}

function getFriendlyAuthErrorMessage(error) {
    if (!error) return 'Error desconocido.';
    const message = error.message.toLowerCase();
    if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
        return 'Correo o contraseña incorrectos.';
    }
    if (message.includes('email not confirmed')) {
        return 'El correo electrónico no ha sido verificado.';
    }
    return error.message;
}

// Sync settings inputs with state settings
function syncSettingsInputs() {
    if (state.settings) {
        const nameEl = document.getElementById('set-store-name');
        const addrEl = document.getElementById('set-store-address');
        const phoneEl = document.getElementById('set-store-phone');
        const whatsappEl = document.getElementById('set-store-whatsapp');
        const instagramEl = document.getElementById('set-store-instagram');
        const descEl = document.getElementById('set-store-description');
        const currEl = document.getElementById('set-store-currency');
        const taxEl = document.getElementById('set-store-tax');
        
        if (nameEl) nameEl.value = state.settings.storeName || "";
        if (addrEl) addrEl.value = state.settings.storeAddress || "";
        if (phoneEl) phoneEl.value = state.settings.storePhone || "";
        if (whatsappEl) whatsappEl.value = state.settings.whatsapp || "";
        if (instagramEl) instagramEl.value = state.settings.instagram || "";
        if (descEl) descEl.value = state.settings.brandDescription || "";
        if (currEl) currEl.value = state.settings.currency || "";
        if (taxEl) taxEl.value = state.settings.storeTax || 0;

        // Brand & Design Sync
        const cardBgType = state.settings.cardBgType || "default";
        const cardBgColor = state.settings.cardBgColor || "#1f2937";
        const cardBgColorHover = state.settings.cardBgColorHover || "#26354a";
        const logo = state.settings.logo || "";
        const cardBgImage = state.settings.cardBgImage || "";

        tempLogoBase64 = logo;
        tempCardBgImageBase64 = cardBgImage;

        const cardBgTypeSelect = document.getElementById('set-card-bg-type');
        const cardBgColorInput = document.getElementById('set-card-bg-color');
        const cardBgColorHoverInput = document.getElementById('set-card-bg-hover');
        
        if (cardBgTypeSelect) cardBgTypeSelect.value = cardBgType;
        if (cardBgColorInput) cardBgColorInput.value = cardBgColor;
        if (cardBgColorHoverInput) cardBgColorHoverInput.value = cardBgColorHover;

        // Toggle groups visibility
        const colorGroup = document.getElementById('card-bg-color-group');
        const imageGroup = document.getElementById('card-bg-image-group');
        if (colorGroup) colorGroup.style.display = (cardBgType === 'color') ? 'block' : 'none';
        if (imageGroup) imageGroup.style.display = (cardBgType === 'image') ? 'block' : 'none';

        // Logo uploader UI sync
        const logoDropzone = document.getElementById('brand-logo-dropzone');
        const logoPreviewContainer = document.getElementById('brand-logo-preview-container');
        const logoPreviewImg = document.getElementById('brand-logo-preview-img');

        if (logo) {
            if (logoPreviewImg) logoPreviewImg.src = logo;
            if (logoPreviewContainer) logoPreviewContainer.style.display = 'flex';
            if (logoDropzone) logoDropzone.style.display = 'none';
        } else {
            if (logoPreviewContainer) logoPreviewContainer.style.display = 'none';
            if (logoDropzone) logoDropzone.style.display = 'block';
        }

        // Card BG uploader UI sync
        const cardBgDropzone = document.getElementById('card-bg-dropzone');
        const cardBgPreviewContainer = document.getElementById('card-bg-preview-container');
        const cardBgPreviewImg = document.getElementById('card-bg-preview-img');

        if (cardBgImage) {
            if (cardBgPreviewImg) cardBgPreviewImg.src = cardBgImage;
            if (cardBgPreviewContainer) cardBgPreviewContainer.style.display = 'flex';
            if (cardBgDropzone) cardBgDropzone.style.display = 'none';
        } else {
            if (cardBgPreviewContainer) cardBgPreviewContainer.style.display = 'none';
            if (cardBgDropzone) cardBgDropzone.style.display = 'block';
        }
        
        // Render categories UI in settings
        renderCategorySettings();
        applyBrandSettings();
    }
}

// Load DB from Supabase or fallback to LocalStorage/Demo Data
async function loadDatabase() {
    const session = supabaseClient ? (await supabaseClient.auth.getSession()).data.session : null;
    if (supabaseInitialized && session && session.user) {
        try {
            if (!firebaseSyncActive && myStoreId) {
                // Load current global state
                const { data, error } = await supabaseClient
                    .from('store_states')
                    .select('state')
                    .eq('store_id', myStoreId)
                    .single();
                
                if (error) {
                    console.error("Error loading state from Supabase:", error);
                    if (error.code === 'PGRST116') {
                        // Store state row doesn't exist yet, we will create it when saving
                        console.log("No existe estado previo para esta tienda. Iniciando vacío.");
                        state.products = [];
                        state.sales = [];
                        state.customers = [];
                        state.cashMovements = [];
                        syncSettingsInputs();
                        renderApp();
                    }
                } else if (data && data.state) {
                    state = data.state;
                    if (!state.cashMovements) state.cashMovements = [];
                    syncSettingsInputs();
                    renderApp();
                }

                // Subscribe to real-time updates for this specific store
                supabaseClient.channel('public:store_states')
                    .on(
                        'postgres_changes',
                        { event: 'UPDATE', schema: 'public', table: 'store_states', filter: `store_id=eq.${myStoreId}` },
                        (payload) => {
                            console.log("Realtime state update received from Supabase");
                            if (payload.new && payload.new.state) {
                                state = payload.new.state;
                                if (!state.cashMovements) state.cashMovements = [];
                                syncSettingsInputs();
                                renderApp();
                            }
                        }
                    )
                    .subscribe();
                
                firebaseSyncActive = true;
            }
            updateSidebarStatus(true, "Conectado Nube");
            return;
        } catch (e) {
            console.error("Error setting up Supabase sync:", e);
        }
    }

    updateSidebarStatus(false, "Modo Local");
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
        try {
            state = JSON.parse(localData);
            if (!state.cashMovements) state.cashMovements = [];
        } catch (e) {
            console.error("Error parsing local database. Using empty data.", e);
            loadDemoData();
        }
    } else {
        loadDemoData();
    }
    syncSettingsInputs();
}

// Save DB state to LocalStorage and background push to Supabase
async function saveDatabase() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    
    const session = supabaseClient ? (await supabaseClient.auth.getSession()).data.session : null;
    if (supabaseInitialized && session && session.user && myStoreId) {
        try {
            const { error } = await supabaseClient
                .from('store_states')
                .upsert({ store_id: myStoreId, state: state, updated_at: new Date().toISOString() });
            
            if (error) {
                console.error("Error syncing state to Supabase:", error);
            } else {
                console.log("Database synchronized to Supabase successfully.");
            }
        } catch (err) {
            console.error("Could not sync to Supabase:", err);
        }
    } else {
        fetch('/api/db', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(state)
        }).catch(err => {
            console.warn("Could not save to remote local server, saved to LocalStorage only:", err);
        });
    }
}

// Populate database with mock data for motorcycle shop
function loadDemoData() {
    state.products = [
        { id: "p1", sku: "REP-BUJ-NGK", name: "Bujía NGK CPR8EA-9 (Honda Titan/FZ16)", category: "Sistema Eléctrico", cost: 450, price: 850, stock: 42, stockMin: 10, image: "" },
        { id: "p2", sku: "REP-FIL-ACE", name: "Filtro de Aceite Honda Tornado XR 250", category: "Repuestos de Motor", cost: 650, price: 1200, stock: 22, stockMin: 5, image: "" },
        { id: "p3", sku: "REP-PAS-FRE", name: "Pastillas de Freno Cobreq YBR 125/Fazer", category: "Frenos", cost: 1100, price: 2200, stock: 15, stockMin: 8, image: "" },
        { id: "p4", sku: "REP-KIT-TRA", name: "Kit Transmisión Completo Rouser NS 200 (DID)", category: "Transmisión", cost: 7800, price: 12500, stock: 4, stockMin: 3, image: "" },
        { id: "p5", sku: "HER-LLA-ALL", name: "Juego de Llaves Allen L-Wrench (9 Piezas)", category: "Herramientas", cost: 2700, price: 4500, stock: 12, stockMin: 4, image: "" },
        { id: "p6", sku: "HER-EXT-VOL", name: "Extractor de Volante Magneto Universal", category: "Herramientas", cost: 3800, price: 6200, stock: 2, stockMin: 2, image: "" },
        { id: "p7", sku: "ACC-CAS-REV", name: "Casco Rebatible Hawk Revo Negro Mate L", category: "Accesorios", cost: 19000, price: 28900, stock: 6, stockMin: 2, image: "" },
        { id: "p8", sku: "REP-CAB-EMB", name: "Cable de Embrague Corven Triax 150", category: "Transmisión", cost: 500, price: 1100, stock: 0, stockMin: 5, image: "" },
        { id: "p9", sku: "REP-BTE-YUAS", name: "Batería Yuasa 12V 7Ah YTX7L-BS", category: "Sistema Eléctrico", cost: 13500, price: 19500, stock: 9, stockMin: 3, image: "" },
        { id: "p10", sku: "HER-COR-CAD", name: "Corta Cadena Profesional Mecánico", category: "Herramientas", cost: 2000, price: 3400, stock: 15, stockMin: 5, image: "" }
    ];

    state.customers = [
        { id: "c1", name: "Martín Gómez (Taller El Rayo)", phone: "+54 9 11 4444-5555", email: "tallerelrayo@gmail.com", points: 150, dateRegistered: "2026-01-15" },
        { id: "c2", name: "Sofía Rodríguez", phone: "+54 9 11 9999-8888", email: "sofia.rod@outlook.com", points: 45, dateRegistered: "2026-03-22" },
        { id: "c3", name: "Juan Carlos Depetris", phone: "+54 9 11 3333-2222", email: "jc.depetris@yahoo.com.ar", points: 10, dateRegistered: "2026-04-10" }
    ];

    // Generate sales for the last 7 days to populate the chart
    state.sales = [];
    const today = new Date();
    const daysData = [
        { daysAgo: 6, total: 32000, qty: 3 },
        { daysAgo: 5, total: 45000, qty: 4 },
        { daysAgo: 4, total: 18000, qty: 2 },
        { daysAgo: 3, total: 62000, qty: 5 },
        { daysAgo: 2, total: 41000, qty: 4 },
        { daysAgo: 1, total: 83000, qty: 7 },
        { daysAgo: 0, total: 54000, qty: 4 }
    ];

    daysData.forEach(day => {
        const saleDate = new Date(today);
        saleDate.setDate(today.getDate() - day.daysAgo);
        
        state.sales.push({
            id: `V-100${day.daysAgo}`,
            date: saleDate.toISOString(),
            customerId: "c1",
            customerName: "Martín Gómez (Taller El Rayo)",
            items: [
                { id: "p1", name: "Bujía NGK CPR8EA-9", price: 850, quantity: 4 },
                { id: "p4", name: "Kit Transmisión NS 200", price: 12500, quantity: 1 }
            ],
            subtotal: 15900,
            discount: 0,
            tax: 2385,
            total: 18285,
            paymentMethod: "card",
            amountReceived: 18285,
            changeReturned: 0,
            status: "completed"
        });
        
        // Adjust the total sum for demo purposes
        state.sales[state.sales.length - 1].total = day.total;
    });

    state.cashMovements = [
        {
            id: "cm_demo_1",
            date: new Date(today.getTime() - 3600000 * 24 * 3).toISOString(), // 3 days ago
            type: "inflow",
            amount: 5000.00,
            concept: "Apertura de caja - Caja Inicial",
            notes: "Caja chica de apertura"
        },
        {
            id: "cm_demo_2",
            date: new Date(today.getTime() - 3600000 * 24 * 2).toISOString(), // 2 days ago
            type: "outflow",
            amount: 1500.00,
            concept: "Pago de flete / Envío de repuestos urgentes",
            notes: "Flete Moto Express"
        }
    ];

    state.cart = [];
    saveDatabase();
}

/* ==========================================================================
   Routing
   ========================================================================== */
function initRouter() {
    // If no hash, default to dashboard
    if (!window.location.hash) {
        window.location.hash = '#dashboard';
    }
    handleRoute();
}

function handleRoute() {
    const hash = window.location.hash || '#dashboard';
    const views = ['dashboard', 'pos', 'inventario', 'clientes', 'historial', 'caja', 'configuracion', 'saas', 'catalogo'];
    
    // Parse target view
    let targetView = hash.replace('#', '');
    
    if (!views.includes(targetView)) return;

    // Fullscreen and Preview Banner handling for Catalog
    const banner = document.getElementById('catalog-preview-banner');
    if (targetView === 'catalogo') {
        document.body.classList.add('catalog-fullscreen');
        if (banner) banner.style.display = 'flex';
    } else {
        document.body.classList.remove('catalog-fullscreen');
        if (banner) banner.style.display = 'none';
    }

    // Route protection for cajero
    if (currentUserRole === 'cajero' && targetView !== 'pos' && targetView !== 'catalogo') {
        window.location.hash = '#pos';
        return;
    }

    // Toggle active link in sidebar
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === hash) {
            link.classList.add('active');
        }
    });

    // Toggle active view container
    document.querySelectorAll('.app-view').forEach(view => {
        view.classList.remove('active-view');
        if (view.id === `view-${targetView}`) {
            view.classList.add('active-view');
        }
    });

    // Update Header Title
    const titleMap = {
        'dashboard': 'Panel de Control',
        'pos': 'Punto de Venta (POS)',
        'inventario': 'Control de Inventario',
        'clientes': 'Clientes CRM',
        'historial': 'Historial de Ventas',
        'caja': 'Control de Caja y Movimientos',
        'configuracion': 'Configuración del Sistema',
        'saas': 'Panel SaaS Global',
        'catalogo': 'Catálogo de Clientes'
    };
    
    document.getElementById('page-title').textContent = titleMap[targetView] || 'DHMotopartes';
    
    // Close sidebar on mobile after choosing a link
    document.getElementById('app-sidebar').classList.remove('mobile-open');

    // Perform route-specific re-renders
    if (targetView === 'dashboard') {
        renderDashboard();
    } else if (targetView === 'pos') {
        renderPOS();
    } else if (targetView === 'inventario') {
        renderInventory();
    } else if (targetView === 'clientes') {
        renderCustomers();
    } else if (targetView === 'historial') {
        renderHistory();
    } else if (targetView === 'caja') {
        renderCaja();
    } else if (targetView === 'catalogo') {
        renderCatalog();
    } else if (targetView === 'saas') {
        if (currentUserRole === 'saas_admin') {
            loadSaasStores();
        } else {
            alert("No tienes permisos para acceder a esta sección.");
            window.location.hash = '#dashboard';
        }
    }
}

/* ==========================================================================
   Audio Synthesis Beeps
   ========================================================================== */
function playScanSound(type = 'success') {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        if (type === 'success') {
            osc.frequency.setValueAtTime(1000, ctx.currentTime); // High pitched beep
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08); // very short
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.08);
        } else if (type === 'warning') {
            osc.frequency.setValueAtTime(600, ctx.currentTime); // Alert chime
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } else {
            osc.frequency.setValueAtTime(250, ctx.currentTime); // Low pitch fail buzz
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.25);
        }
    } catch (e) {
        console.warn("Web Audio API is not supported or blocked by browser permissions", e);
    }
}

/* ==========================================================================
   Global Event Listeners Setup
   ========================================================================== */
function setupEventListeners() {
    // Mobile Sidebar Toggle
    document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
        document.getElementById('app-sidebar').classList.add('mobile-open');
    });
    
    document.getElementById('sidebar-close-btn').addEventListener('click', () => {
        document.getElementById('app-sidebar').classList.remove('mobile-open');
    });
    
    // Theme Toggle
    document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
    document.getElementById('theme-btn-dark').addEventListener('click', () => applyThemeMode('dark'));
    document.getElementById('theme-btn-light').addEventListener('click', () => applyThemeMode('light'));
    
    // Theme Accent Pickers
    document.getElementById('accent-pickers-container').addEventListener('click', (e) => {
        if (e.target.classList.contains('color-dot')) {
            document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
            e.target.classList.add('active');
            applyAccentTheme(e.target.dataset.color);
        }
    });

    // Close modal triggers
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-close-modal');
            closeModal(modalId);
        });
    });

    // POS Search & Clear Inputs
    const posSearchInput = document.getElementById('pos-search-input');
    const posClearSearch = document.getElementById('pos-clear-search');
    posSearchInput.addEventListener('input', () => {
        if (posSearchInput.value) {
            posClearSearch.style.display = 'block';
        } else {
            posClearSearch.style.display = 'none';
        }
        renderPOSProductGrid();
    });
    posClearSearch.addEventListener('click', () => {
        posSearchInput.value = '';
        posClearSearch.style.display = 'none';
        posSearchInput.focus();
        renderPOSProductGrid();
    });

    // POS Cart Action Buttons
    document.getElementById('cart-clear-btn').addEventListener('click', clearCart);
    document.getElementById('cart-apply-discount-btn').addEventListener('click', () => openModal('modal-discount'));
    document.getElementById('cart-checkout-btn').addEventListener('click', openCheckoutModal);
    
    // Discount Save
    document.getElementById('discount-save-btn').addEventListener('click', applyCartDiscount);

    // Customer Add Button in POS
    document.getElementById('pos-add-customer-btn').addEventListener('click', () => {
        document.getElementById('customer-modal-title').textContent = "Registrar Cliente Nuevo";
        document.getElementById('customer-id-field').value = "";
        document.getElementById('customer-form').reset();
        openModal('modal-customer');
    });

    // Customer Save Form
    document.getElementById('customer-form').addEventListener('submit', saveCustomer);

    // Checkout Processing Listeners
    document.getElementById('checkout-confirm-btn').addEventListener('click', processCheckout);
    document.getElementById('checkout-cash-received').addEventListener('input', calculateChange);
    
    // Quick Cash container
    document.getElementById('quick-cash-container').addEventListener('click', (e) => {
        if (e.target.classList.contains('quick-cash-btn')) {
            const val = parseFloat(e.target.dataset.amount);
            document.getElementById('checkout-cash-received').value = val;
            calculateChange();
        }
    });

    // Checkout Method Switch
    document.getElementById('checkout-method-selector').addEventListener('click', (e) => {
        const btn = e.target.closest('.method-btn');
        if (btn) {
            document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const cashSection = document.getElementById('checkout-cash-inputs');
            if (btn.dataset.method === 'cash') {
                cashSection.style.display = 'block';
                calculateChange();
            } else {
                cashSection.style.display = 'none';
                document.getElementById('checkout-confirm-btn').disabled = false;
            }
        }
    });

    // Inventory View Listeners
    document.getElementById('inventory-add-product-btn').addEventListener('click', () => {
        document.getElementById('product-modal-title').textContent = "Registrar Nuevo Repuesto";
        document.getElementById('product-id-field').value = "";
        document.getElementById('product-form').reset();
        document.getElementById('prod-sku').readOnly = false;
        
        // Reset image selector UI
        tempProductImageBase64 = "";
        const fileRadio = document.getElementById('prod-image-src-file');
        if (fileRadio) fileRadio.checked = true;
        const dropzone = document.getElementById('prod-image-dropzone');
        if (dropzone) dropzone.style.display = 'flex';
        const urlGroup = document.getElementById('prod-image-url-group');
        if (urlGroup) urlGroup.style.display = 'none';
        const previewContainer = document.getElementById('prod-image-preview-container');
        if (previewContainer) previewContainer.style.display = 'none';
        const fileInput = document.getElementById('prod-image-file-input');
        if (fileInput) fileInput.value = "";
        
        openModal('modal-product');
    });
    
    document.getElementById('product-form').addEventListener('submit', saveProduct);
    document.getElementById('inventory-search').addEventListener('input', renderInventoryTable);
    document.getElementById('inventory-filter-category').addEventListener('change', renderInventoryTable);
    document.getElementById('inventory-filter-stock').addEventListener('change', renderInventoryTable);

    // Customers View Search
    document.getElementById('customers-search').addEventListener('input', renderCustomersTable);
    document.getElementById('customers-add-btn').addEventListener('click', () => {
        document.getElementById('customer-modal-title').textContent = "Registrar Cliente Nuevo";
        document.getElementById('customer-id-field').value = "";
        document.getElementById('customer-form').reset();
        openModal('modal-customer');
    });

    // History View Search & Filters
    document.getElementById('history-search').addEventListener('input', renderHistoryTable);
    document.getElementById('history-filter-start').addEventListener('change', renderHistoryTable);
    document.getElementById('history-filter-end').addEventListener('change', renderHistoryTable);
    document.getElementById('history-filter-status').addEventListener('change', renderHistoryTable);
    
    // Receipt Actions
    document.getElementById('receipt-print-btn').addEventListener('click', () => {
        window.print();
    });
    document.getElementById('receipt-void-btn').addEventListener('click', voidSale);

    // Settings Store Form
    document.getElementById('settings-store-form').addEventListener('submit', saveSettings);

    // Cash Movement Listeners
    document.getElementById('caja-add-inflow-btn').addEventListener('click', () => {
        document.getElementById('caja-movement-modal-title').textContent = "Registrar Ingreso de Caja";
        document.getElementById('caja-movement-type-field').value = "inflow";
        document.getElementById('caja-movement-form').reset();
        openModal('modal-caja-movement');
    });

    document.getElementById('caja-add-outflow-btn').addEventListener('click', () => {
        document.getElementById('caja-movement-modal-title').textContent = "Registrar Egreso de Caja";
        document.getElementById('caja-movement-type-field').value = "outflow";
        document.getElementById('caja-movement-form').reset();
        openModal('modal-caja-movement');
    });

    document.getElementById('caja-movement-form').addEventListener('submit', saveCajaMovement);
    document.getElementById('caja-search').addEventListener('input', () => {
        cajaPage = 1;
        renderCaja();
    });
    document.getElementById('caja-filter-type').addEventListener('change', () => {
        cajaPage = 1;
        renderCaja();
    });

    // Excel Import/Export Listeners
    document.getElementById('inventory-import-excel').addEventListener('change', handleExcelImport);
    document.getElementById('inventory-export-excel').addEventListener('click', exportInventoryExcel);
    document.getElementById('excel-confirm-import-btn').addEventListener('click', confirmExcelImport);
    document.getElementById('excel-download-template-btn').addEventListener('click', downloadExcelTemplate);

    // Data backups & resets
    document.getElementById('data-load-demo-btn').addEventListener('click', () => {
        if (confirm("¿Estás seguro de que deseas sobrescribir los datos actuales con la base de datos demo de la repuestera?")) {
            loadDemoData();
            syncSettingsInputs(); // sync settings inputs
            renderApp();
            playScanSound('success');
            alert("Base de datos demo cargada con éxito.");
        }
    });

    document.getElementById('data-reset-btn').addEventListener('click', () => {
        if (confirm("ATENCIÓN: Se eliminarán todos los productos, ventas y clientes de forma permanente. ¿Deseas continuar?")) {
            state.products = [];
            state.sales = [];
            state.customers = [];
            state.cart = [];
            saveDatabase();
            renderApp();
            playScanSound('fail');
            alert("El sistema ha sido reiniciado por completo.");
        }
    });

    document.getElementById('data-export-btn').addEventListener('click', exportJSONBackup);
    document.getElementById('data-import-input').addEventListener('change', importJSONBackup);
    document.getElementById('data-export-csv-btn').addEventListener('click', exportSalesCSV);

    // Keyboard Shortcuts (F8 for Cobrar, F9 for Imprimir)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'F8') {
            const checkoutBtn = document.getElementById('cart-checkout-btn');
            if (window.location.hash === '#pos' && checkoutBtn && !checkoutBtn.disabled) {
                e.preventDefault();
                openCheckoutModal();
            }
        }
        if (e.key === 'F9') {
            const printModal = document.getElementById('modal-receipt');
            if (printModal && printModal.classList.contains('active')) {
                e.preventDefault();
                window.print();
            }
        }
    });

    // Select dropdown cardBgType change logic
    const cardBgTypeSelect = document.getElementById('set-card-bg-type');
    const colorGroup = document.getElementById('card-bg-color-group');
    const imageGroup = document.getElementById('card-bg-image-group');
    
    if (cardBgTypeSelect) {
        cardBgTypeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (colorGroup) colorGroup.style.display = (val === 'color') ? 'block' : 'none';
            if (imageGroup) imageGroup.style.display = (val === 'image') ? 'block' : 'none';
        });
    }

    // Logo Upload Logic
    const logoInput = document.getElementById('brand-logo-input');
    const logoDropzone = document.getElementById('brand-logo-dropzone');
    const logoPreviewContainer = document.getElementById('brand-logo-preview-container');
    const logoPreviewImg = document.getElementById('brand-logo-preview-img');
    const logoRemoveBtn = document.getElementById('brand-logo-remove-btn');

    if (logoDropzone && logoInput) {
        logoDropzone.addEventListener('click', () => logoInput.click());
        
        logoDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            logoDropzone.style.borderColor = 'var(--primary)';
        });
        logoDropzone.addEventListener('dragleave', () => {
            logoDropzone.style.borderColor = '';
        });
        logoDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            logoDropzone.style.borderColor = '';
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleLogoFile(e.dataTransfer.files[0]);
            }
        });
        
        logoInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleLogoFile(e.target.files[0]);
            }
        });
    }

    function handleLogoFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            tempLogoBase64 = event.target.result;
            if (logoPreviewImg) logoPreviewImg.src = tempLogoBase64;
            if (logoPreviewContainer) logoPreviewContainer.style.display = 'flex';
            if (logoDropzone) logoDropzone.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    if (logoRemoveBtn) {
        logoRemoveBtn.addEventListener('click', () => {
            tempLogoBase64 = ""; // Clear
            if (logoInput) logoInput.value = "";
            if (logoPreviewContainer) logoPreviewContainer.style.display = 'none';
            if (logoDropzone) logoDropzone.style.display = 'block';
        });
    }

    // Card BG Image Upload Logic
    const cardBgInput = document.getElementById('card-bg-image-input');
    const cardBgDropzone = document.getElementById('card-bg-dropzone');
    const cardBgPreviewContainer = document.getElementById('card-bg-preview-container');
    const cardBgPreviewImg = document.getElementById('card-bg-preview-img');
    const cardBgRemoveBtn = document.getElementById('card-bg-remove-btn');

    if (cardBgDropzone && cardBgInput) {
        cardBgDropzone.addEventListener('click', () => cardBgInput.click());
        
        cardBgDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            cardBgDropzone.style.borderColor = 'var(--primary)';
        });
        cardBgDropzone.addEventListener('dragleave', () => {
            cardBgDropzone.style.borderColor = '';
        });
        cardBgDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            cardBgDropzone.style.borderColor = '';
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleCardBgFile(e.dataTransfer.files[0]);
            }
        });
        
        cardBgInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleCardBgFile(e.target.files[0]);
            }
        });
    }

    function handleCardBgFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            tempCardBgImageBase64 = event.target.result;
            if (cardBgPreviewImg) cardBgPreviewImg.src = tempCardBgImageBase64;
            if (cardBgPreviewContainer) cardBgPreviewContainer.style.display = 'flex';
            if (cardBgDropzone) cardBgDropzone.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    if (cardBgRemoveBtn) {
        cardBgRemoveBtn.addEventListener('click', () => {
            tempCardBgImageBase64 = ""; // Clear
            if (cardBgInput) cardBgInput.value = "";
            if (cardBgPreviewContainer) cardBgPreviewContainer.style.display = 'none';
            if (cardBgDropzone) cardBgDropzone.style.display = 'block';
        });
    }

    // Public Catalog Listeners
    const btnViewCatalog = document.getElementById('btn-view-public-catalog');
    if (btnViewCatalog) {
        btnViewCatalog.addEventListener('click', () => {
            window.location.hash = '#catalogo';
        });
    }

    const catalogSearchInput = document.getElementById('catalog-search-input');
    if (catalogSearchInput) {
        catalogSearchInput.addEventListener('input', renderCatalogProductGrid);
    }

    // Product Image source toggles (File vs URL)
    const prodImgSrcFile = document.getElementById('prod-image-src-file');
    const prodImgSrcUrl = document.getElementById('prod-image-src-url');
    const prodImgDropzone = document.getElementById('prod-image-dropzone');
    const prodImgUrlGroup = document.getElementById('prod-image-url-group');
    const prodImgFileInput = document.getElementById('prod-image-file-input');
    const prodImgPreviewContainer = document.getElementById('prod-image-preview-container');
    const prodImgPreviewImg = document.getElementById('prod-image-preview-img');
    const prodImgRemoveBtn = document.getElementById('prod-image-remove-btn');

    if (prodImgSrcFile && prodImgSrcUrl) {
        prodImgSrcFile.addEventListener('change', toggleProductImageSource);
        prodImgSrcUrl.addEventListener('change', toggleProductImageSource);
    }

    function toggleProductImageSource() {
        if (prodImgSrcFile.checked) {
            prodImgUrlGroup.style.display = 'none';
            if (tempProductImageBase64) {
                prodImgDropzone.style.display = 'none';
                prodImgPreviewContainer.style.display = 'flex';
            } else {
                prodImgDropzone.style.display = 'flex';
                prodImgPreviewContainer.style.display = 'none';
            }
        } else {
            prodImgUrlGroup.style.display = 'block';
            prodImgDropzone.style.display = 'none';
            prodImgPreviewContainer.style.display = 'none';
        }
    }

    // Dropzone events for product image
    if (prodImgDropzone && prodImgFileInput) {
        prodImgDropzone.addEventListener('click', () => prodImgFileInput.click());
        
        prodImgDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            prodImgDropzone.style.borderColor = 'var(--primary)';
        });
        prodImgDropzone.addEventListener('dragleave', () => {
            prodImgDropzone.style.borderColor = '';
        });
        prodImgDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            prodImgDropzone.style.borderColor = '';
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleProductImageFile(e.dataTransfer.files[0]);
            }
        });
        
        prodImgFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleProductImageFile(e.target.files[0]);
            }
        });
    }

    function handleProductImageFile(file) {
        compressProductImage(file, (compressedBase64) => {
            tempProductImageBase64 = compressedBase64;
            if (prodImgPreviewImg) prodImgPreviewImg.src = tempProductImageBase64;
            if (prodImgPreviewContainer) prodImgPreviewContainer.style.display = 'flex';
            if (prodImgDropzone) prodImgDropzone.style.display = 'none';
            
            // Show file size information
            const sizeInKb = Math.round((compressedBase64.length * 3/4) / 1024);
            const sizeInfo = document.getElementById('prod-image-size-info');
            if (sizeInfo) sizeInfo.textContent = `Optimizado: ~${sizeInKb} KB`;
        });
    }

    if (prodImgRemoveBtn) {
        prodImgRemoveBtn.addEventListener('click', () => {
            tempProductImageBase64 = "";
            if (prodImgFileInput) prodImgFileInput.value = "";
            if (prodImgPreviewContainer) prodImgPreviewContainer.style.display = 'none';
            if (prodImgDropzone) prodImgDropzone.style.display = 'flex';
        });
    }

    // Helper to compress product images using canvas
    function compressProductImage(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400;
                const MAX_HEIGHT = 400;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Export to compressed JPEG
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                callback(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

/* ==========================================================================
   Barcode Listener (Hardware USB/Bluetooth Keyboard Emulators)
   ========================================================================== */
function setupBarcodeListener() {
    window.addEventListener('keydown', (e) => {
        // Exclude inputs that are not the POS search bar.
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
            if (activeEl.id !== 'pos-search-input') {
                return; // User is actively typing in a form or another modal, ignore barcode intercept
            }
        }

        const currentTime = Date.now();
        
        // Fast typing speed validation (< 50ms interval)
        if (currentTime - lastKeyTime > 50) {
            barcodeBuffer = '';
        }
        
        lastKeyTime = currentTime;

        // Skip modifiers
        if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
            return;
        }

        if (e.key === 'Enter') {
            if (barcodeBuffer.trim().length >= 3) {
                e.preventDefault();
                processBarcodeScan(barcodeBuffer.trim());
                barcodeBuffer = '';
            }
        } else {
            // Standard single char keys
            if (e.key.length === 1) {
                barcodeBuffer += e.key;
            }
        }
    });
}

function processBarcodeScan(code) {
    console.log("Barcode scanned:", code);
    
    // Look for product by SKU or unique barcode
    const product = state.products.find(p => p.sku.toUpperCase() === code.toUpperCase());
    
    if (product) {
        if (product.stock <= 0) {
            playScanSound('fail');
            alert(`El repuesto "${product.name}" no cuenta con stock disponible.`);
            return;
        }

        // Add to cart!
        addCartItem(product.id);
        
        // Flash barcode status indicator in UI
        const badge = document.getElementById('pos-barcode-badge');
        if (badge) {
            badge.style.borderColor = 'var(--primary)';
            badge.style.boxShadow = '0 0 10px rgba(var(--primary-rgb), 0.5)';
            badge.style.backgroundColor = 'var(--primary-light)';
            
            setTimeout(() => {
                badge.style.borderColor = '';
                badge.style.boxShadow = '';
                badge.style.backgroundColor = '';
            }, 300);
        }
        
        // Redirect to POS hash if on another view so the user can visually see the cart updating!
        if (window.location.hash !== '#pos') {
            window.location.hash = '#pos';
        }
        
    } else {
        // Not found
        playScanSound('warning');
        
        // If in inventory view, autofill barcode to New Product SKU field
        if (window.location.hash === '#inventario') {
            document.getElementById('product-modal-title').textContent = "Registrar Nuevo Repuesto";
            document.getElementById('product-id-field').value = "";
            document.getElementById('product-form').reset();
            document.getElementById('prod-sku').value = code;
            document.getElementById('prod-sku').readOnly = false;
            openModal('modal-product');
            setTimeout(() => document.getElementById('prod-name').focus(), 300);
        } else {
            alert(`Código de barras "${code}" no encontrado en el catálogo.`);
        }
    }
}

/* ==========================================================================
   Global Theme Handling
   ========================================================================== */
function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    applyThemeMode(isDark ? 'light' : 'dark');
}

function applyThemeMode(mode) {
    const darkBtn = document.getElementById('theme-btn-dark');
    const lightBtn = document.getElementById('theme-btn-light');
    
    if (mode === 'dark') {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        darkBtn.classList.add('active');
        lightBtn.classList.remove('active');
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        lightBtn.classList.add('active');
        darkBtn.classList.remove('active');
    }
}

function applyAccentTheme(color) {
    // Reset all theme accent classes
    document.body.classList.remove('theme-violet', 'theme-blue', 'theme-emerald', 'theme-crimson', 'theme-amber');
    if (color && color !== 'violet') {
        document.body.classList.add(`theme-${color}`);
    }
    // Update active dot in UI
    const dots = document.querySelectorAll('#accent-pickers-container .color-dot');
    dots.forEach(d => {
        if (d.dataset.color === color) {
            d.classList.add('active');
        } else {
            d.classList.remove('active');
        }
    });
    // Re-render SVG chart to pick up color change
    if (window.location.hash === '#dashboard') {
        renderSalesChartContainer();
    }
}

/* ==========================================================================
   Modals Control
   ========================================================================== */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        // Handle autofocus fields
        if (modalId === 'modal-checkout') {
            const cashInput = document.getElementById('checkout-cash-received');
            cashInput.value = '';
            document.getElementById('checkout-change-display').textContent = "$0.00";
            
            // Auto focus cash input if method is cash
            const activeMethod = document.querySelector('#checkout-method-selector .method-btn.active');
            if (activeMethod.dataset.method === 'cash') {
                setTimeout(() => cashInput.focus(), 150);
            }
        }
        if (modalId === 'modal-discount') {
            setTimeout(() => document.getElementById('discount-value').focus(), 150);
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

/* ==========================================================================
   Date Display
   ========================================================================== */
function initDatetime() {
    const updateTime = () => {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        document.getElementById('current-datetime').textContent = now.toLocaleDateString('es-ES', options);
    };
    updateTime();
    setInterval(updateTime, 60000);
}

/* ==========================================================================
   General Render Router dispatcher
   ========================================================================== */
function renderApp() {
    renderDashboard();
    renderPOS();
    renderInventory();
    renderCustomers();
    renderHistory();
    renderCaja();
}

/* ==========================================================================
   1. DASHBOARD VIEW CONTROLLER
   ========================================================================== */
function renderDashboard() {
    // Calculate dashboard statistics
    const today = new Date().toDateString();
    
    // Filter completed sales today
    const salesToday = state.sales.filter(s => s.status === 'completed' && new Date(s.date).toDateString() === today);
    const totalTodaySales = salesToday.reduce((sum, s) => sum + s.total, 0);
    const profitToday = salesToday.reduce((sum, s) => {
        // Calculate cost of items sold
        let costOfSale = 0;
        s.items.forEach(item => {
            const prod = state.products.find(p => p.id === item.id);
            const cost = prod ? prod.cost : 0;
            costOfSale += cost * item.quantity;
        });
        return sum + (s.total - costOfSale - s.tax); // profit equals total minus cost minus tax
    }, 0);
    
    document.getElementById('metric-today-sales').textContent = `${state.settings.currency}${totalTodaySales.toFixed(2)}`;
    document.getElementById('metric-sales-count').innerHTML = `<i data-lucide="trending-up"></i> ${salesToday.length} transacciones`;
    document.getElementById('metric-today-profit').textContent = `${state.settings.currency}${Math.max(0, profitToday).toFixed(2)}`;
    
    const profitMargin = totalTodaySales > 0 ? (profitToday / totalTodaySales) * 100 : 0;
    document.getElementById('metric-profit-margin').textContent = `${profitMargin.toFixed(0)}% Margen prom.`;

    // Total products and stocks
    const totalProducts = state.products.length;
    const totalStockQty = state.products.reduce((sum, p) => sum + p.stock, 0);
    document.getElementById('metric-total-products').textContent = totalProducts;
    document.getElementById('metric-total-stock').textContent = `${totalStockQty} unidades físicas`;

    // Low stock warnings
    const lowStockList = state.products.filter(p => p.stock <= p.stockMin);
    const lowStockCount = lowStockList.length;
    document.getElementById('metric-low-stock-count').textContent = lowStockCount;
    
    const alertIconEl = document.getElementById('metric-stock-alert-icon');
    if (lowStockCount > 0) {
        alertIconEl.className = "metric-icon bg-amber status-dot pulse";
    } else {
        alertIconEl.className = "metric-icon bg-amber";
    }

    // Render Dashboard Stock Alert List
    const lowStockContainer = document.getElementById('dashboard-low-stock-list');
    if (lowStockCount === 0) {
        lowStockContainer.innerHTML = `
            <div class="empty-state-small">
                <i data-lucide="check-circle" class="text-success"></i>
                <p>Nivel de stock óptimo en todos los artículos.</p>
            </div>
        `;
    } else {
        let listHtml = '';
        // Display top 4 low stock items
        lowStockList.slice(0, 4).forEach(p => {
            const stockColor = p.stock === 0 ? 'text-danger' : 'text-warning';
            listHtml += `
                <div class="feed-item">
                    <div class="feed-item-left">
                        <div class="feed-item-icon bg-amber" style="color: #f59e0b;">
                            <i data-lucide="alert-circle" style="width:14px; height:14px;"></i>
                        </div>
                        <div>
                            <p class="feed-item-title">${p.name}</p>
                            <p class="feed-item-subtext">SKU: ${p.sku}</p>
                        </div>
                    </div>
                    <div class="feed-item-right">
                        <span class="feed-item-value ${stockColor}">${p.stock} unidades</span>
                        <p class="feed-item-subtext">Mín: ${p.stockMin}</p>
                    </div>
                </div>
            `;
        });
        lowStockContainer.innerHTML = listHtml;
    }

    // Render Recent Sales on Dashboard
    const recentSalesContainer = document.getElementById('dashboard-recent-sales');
    // completed sales, sorted desc by date
    const completedSales = state.sales.filter(s => s.status === 'completed')
                                       .sort((a, b) => new Date(b.date) - new Date(a.date));
                                       
    if (completedSales.length === 0) {
        recentSalesContainer.innerHTML = `
            <div class="empty-state-small">
                <i data-lucide="info"></i>
                <p>No se registran ventas realizadas.</p>
            </div>
        `;
    } else {
        let listHtml = '';
        completedSales.slice(0, 4).forEach(s => {
            const itemsCount = s.items.reduce((sum, item) => sum + item.quantity, 0);
            listHtml += `
                <div class="feed-item cursor-pointer" onclick="viewSaleDetail('${s.id}')">
                    <div class="feed-item-left">
                        <div class="feed-item-icon bg-emerald" style="color: #10b981;">
                            <i data-lucide="check" style="width:14px; height:14px;"></i>
                        </div>
                        <div>
                            <p class="feed-item-title">${s.id}</p>
                            <p class="feed-item-subtext">${s.customerName || 'Consumidor Final'} | ${itemsCount} art.</p>
                        </div>
                    </div>
                    <div class="feed-item-right">
                        <span class="feed-item-value">${state.settings.currency}${s.total.toFixed(2)}</span>
                        <p class="feed-item-subtext">${new Date(s.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                </div>
            `;
        });
        recentSalesContainer.innerHTML = listHtml;
    }

    renderSalesChartContainer();
    
    if (window.lucide) lucide.createIcons();
}

function renderSalesChartContainer() {
    // Generate data for last 7 days (today back to 6 days ago)
    const today = new Date();
    const daysWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const chartData = [];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        
        // Sum completed sales for this date
        const dateStr = d.toDateString();
        const dailyTotal = state.sales
            .filter(s => s.status === 'completed' && new Date(s.date).toDateString() === dateStr)
            .reduce((sum, s) => sum + s.total, 0);
            
        chartData.push({
            date: daysWeek[d.getDay()],
            total: dailyTotal
        });
    }
    
    renderSalesChart('sales-chart-container', chartData, state.settings.currency);
}

/* ==========================================================================
   2. POINT OF SALE (POS) VIEW CONTROLLER
   ========================================================================== */
let activePOSCategory = '';

function renderPOS() {
    // Populate Customer Dropdown
    const select = document.getElementById('cart-customer-select');
    select.innerHTML = '<option value="0">Consumidor Final</option>';
    state.customers.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });

    // Populate Category Tabs
    const tabsContainer = document.getElementById('pos-category-tabs');
    // Extract unique categories
    const categories = ['Todas', ...(state.settings.categories || [])];
    
    let tabsHtml = '';
    categories.forEach(cat => {
        const displayCat = cat === 'Todas' ? '' : cat;
        const activeClass = activePOSCategory === displayCat ? 'active' : '';
        tabsHtml += `
            <button class="category-tab ${activeClass}" onclick="setPOSCategory('${displayCat}')">
                ${cat}
            </button>
        `;
    });
    tabsContainer.innerHTML = tabsHtml;

    renderPOSProductGrid();
    renderCart();
}

window.setPOSCategory = function(cat) {
    activePOSCategory = cat;
    renderPOS();
};

function renderPOSProductGrid() {
    const searchVal = document.getElementById('pos-search-input').value.toLowerCase();
    const grid = document.getElementById('pos-products-grid');
    
    // Filter catalog products
    const filtered = state.products.filter(p => {
        const matchesCategory = !activePOSCategory || p.category === activePOSCategory;
        const matchesSearch = p.name.toLowerCase().includes(searchVal) || 
                              p.sku.toLowerCase().includes(searchVal);
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state-small" style="grid-column: 1 / -1;">
                <i data-lucide="package-x" style="width: 48px; height: 48px; opacity: 0.3;"></i>
                <p>No se encontraron repuestos o herramientas.</p>
            </div>
        `;
    } else {
        let cardsHtml = '';
        filtered.forEach(p => {
            cardsHtml += createPOSProductCard(p, state.settings.currency);
        });
        grid.innerHTML = cardsHtml;
    }
    
    if (window.lucide) lucide.createIcons();
}

// Shopping Cart Actions
window.addCartItem = function(prodId) {
    const product = state.products.find(p => p.id === prodId);
    if (!product) return;

    // Check stock availability
    const existingInCart = state.cart.find(item => item.id === prodId);
    const cartQty = existingInCart ? existingInCart.quantity : 0;
    
    if (cartQty >= product.stock) {
        playScanSound('fail');
        alert(`No hay más stock disponible de "${product.name}".`);
        return;
    }

    if (existingInCart) {
        existingInCart.quantity += 1;
    } else {
        state.cart.push({
            id: product.id,
            name: product.name,
            sku: product.sku,
            price: product.price,
            quantity: 1
        });
    }

    playScanSound('success');
    renderCart();
};

window.modifyCartItemQty = function(prodId, delta) {
    const cartItem = state.cart.find(item => item.id === prodId);
    if (!cartItem) return;
    
    const product = state.products.find(p => p.id === prodId);
    if (!product) return;

    if (delta > 0 && cartItem.quantity >= product.stock) {
        playScanSound('fail');
        alert("Stock máximo alcanzado.");
        return;
    }

    cartItem.quantity += delta;
    if (cartItem.quantity <= 0) {
        state.cart = state.cart.filter(item => item.id !== prodId);
    }
    
    renderCart();
};

function clearCart() {
    if (state.cart.length > 0) {
        state.cart = [];
        // Clear active discount
        cartDiscount = { type: 'amount', value: 0 };
        renderCart();
    }
}

// Calculate totals & update UI
let cartDiscount = { type: 'amount', value: 0 };

function renderCart() {
    const list = document.getElementById('cart-items-list');
    
    if (state.cart.length === 0) {
        list.innerHTML = `
            <div class="cart-empty-state">
                <i data-lucide="shopping-bag" class="cart-empty-icon"></i>
                <p>El carrito está vacío</p>
                <span class="text-muted small">Haz clic en los repuestos del catálogo para agregarlos</span>
            </div>
        `;
        document.getElementById('cart-summary-subtotal').textContent = "$0.00";
        document.getElementById('cart-summary-discount').textContent = "-$0.00";
        document.getElementById('cart-summary-tax').textContent = "$0.00";
        document.getElementById('cart-summary-total').textContent = "$0.00";
        document.getElementById('cart-checkout-btn').disabled = true;
        
        if (window.lucide) lucide.createIcons();
        return;
    }

    let itemsHtml = '';
    state.cart.forEach(item => {
        itemsHtml += `
            <div class="cart-item">
                <div>
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-sku">SKU: ${item.sku} | ${state.settings.currency}${item.price.toFixed(2)}</div>
                </div>
                <div class="cart-item-qty">
                    <button class="qty-btn" onclick="modifyCartItemQty('${item.id}', -1)">-</button>
                    <span class="qty-val">${item.quantity}</span>
                    <button class="qty-btn" onclick="modifyCartItemQty('${item.id}', 1)">+</button>
                </div>
                <div class="cart-item-price">
                    ${state.settings.currency}${(item.price * item.quantity).toFixed(2)}
                </div>
            </div>
        `;
    });
    list.innerHTML = itemsHtml;

    // Totals Math
    const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Apply Discount
    let discountAmt = 0;
    if (cartDiscount.type === 'amount') {
        discountAmt = cartDiscount.value;
    } else {
        discountAmt = subtotal * (cartDiscount.value / 100);
    }
    // Cap discount at subtotal
    discountAmt = Math.min(discountAmt, subtotal);

    const taxableAmount = Math.max(0, subtotal - discountAmt);
    const taxRate = state.settings.storeTax / 100;
    const tax = taxableAmount * taxRate;
    const total = taxableAmount + tax;

    // Set summary elements
    document.getElementById('cart-summary-subtotal').textContent = `${state.settings.currency}${subtotal.toFixed(2)}`;
    document.getElementById('cart-summary-discount').textContent = `-${state.settings.currency}${discountAmt.toFixed(2)}`;
    document.getElementById('cart-summary-tax-label').textContent = `Impuesto (${state.settings.storeTax}%):`;
    document.getElementById('cart-summary-tax').textContent = `${state.settings.currency}${tax.toFixed(2)}`;
    document.getElementById('cart-summary-total').textContent = `${state.settings.currency}${total.toFixed(2)}`;
    document.getElementById('cart-checkout-btn').disabled = false;
}

function applyCartDiscount() {
    const type = document.getElementById('discount-type').value;
    const value = parseFloat(document.getElementById('discount-value').value) || 0;
    
    if (value < 0) {
        alert("El valor del descuento no puede ser menor a 0.");
        return;
    }
    
    cartDiscount = { type, value };
    closeModal('modal-discount');
    renderCart();
}

// Checkout Modal trigger
let checkoutTotalVal = 0;

function openCheckoutModal() {
    // Calculate total from cart
    const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let discountAmt = 0;
    if (cartDiscount.type === 'amount') {
        discountAmt = cartDiscount.value;
    } else {
        discountAmt = subtotal * (cartDiscount.value / 100);
    }
    discountAmt = Math.min(discountAmt, subtotal);
    const taxableAmount = Math.max(0, subtotal - discountAmt);
    const tax = taxableAmount * (state.settings.storeTax / 100);
    checkoutTotalVal = taxableAmount + tax;

    document.getElementById('checkout-total-display').textContent = `${state.settings.currency}${checkoutTotalVal.toFixed(2)}`;
    
    // Render Quick Cash buttons (rounding bills in cash)
    const quickContainer = document.getElementById('quick-cash-container');
    const exactOption = Math.ceil(checkoutTotalVal);
    const options = [
        exactOption,
        Math.ceil(exactOption / 100) * 100, // round next 100
        Math.ceil(exactOption / 500) * 500, // round next 500
        Math.ceil(exactOption / 1000) * 1000 // round next 1000
    ];
    // Remove duplicates
    const uniqueOptions = [...new Set(options)].sort((a,b)=>a-b);
    
    let cashBtns = '';
    uniqueOptions.forEach(opt => {
        cashBtns += `
            <button class="quick-cash-btn" data-amount="${opt}">
                ${state.settings.currency}${opt}
            </button>
        `;
    });
    quickContainer.innerHTML = cashBtns;

    // Reset default payment method to cash
    document.querySelectorAll('.method-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-method="cash"]').classList.add('active');
    document.getElementById('checkout-cash-inputs').style.display = 'block';

    openModal('modal-checkout');
}

function calculateChange() {
    const receivedInput = document.getElementById('checkout-cash-received');
    const received = parseFloat(receivedInput.value) || 0;
    const confirmBtn = document.getElementById('checkout-confirm-btn');
    
    const change = received - checkoutTotalVal;
    
    const changeDisplay = document.getElementById('checkout-change-display');
    changeDisplay.textContent = `${state.settings.currency}${Math.max(0, change).toFixed(2)}`;
    
    if (change >= -0.01) { // allow fractional rounding
        confirmBtn.disabled = false;
        changeDisplay.className = "change-value text-success";
    } else {
        confirmBtn.disabled = true;
        changeDisplay.className = "change-value text-danger";
    }
}

// Process Checkout & deduct inventory stocks
function processCheckout() {
    const selectedCustomerId = document.getElementById('cart-customer-select').value;
    let customerName = "Consumidor Final";
    let customer = null;
    
    if (selectedCustomerId !== "0") {
        customer = state.customers.find(c => c.id === selectedCustomerId);
        if (customer) {
            customerName = customer.name;
        }
    }

    // Capture payment details
    const activeMethod = document.querySelector('#checkout-method-selector .method-btn.active').dataset.method;
    const received = activeMethod === 'cash' ? parseFloat(document.getElementById('checkout-cash-received').value) || 0 : checkoutTotalVal;
    const change = received - checkoutTotalVal;

    // Cart calculations
    const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let discountAmt = 0;
    if (cartDiscount.type === 'amount') {
        discountAmt = cartDiscount.value;
    } else {
        discountAmt = subtotal * (cartDiscount.value / 100);
    }
    discountAmt = Math.min(discountAmt, subtotal);
    const taxableAmount = Math.max(0, subtotal - discountAmt);
    const tax = taxableAmount * (state.settings.storeTax / 100);
    const total = taxableAmount + tax;

    // Deduct stock in catalog database
    state.cart.forEach(cartItem => {
        const prod = state.products.find(p => p.id === cartItem.id);
        if (prod) {
            prod.stock = Math.max(0, prod.stock - cartItem.quantity);
        }
    });

    // Award loyalty points (1 point per 100 units of currency spent)
    if (customer) {
        const pointsEarned = Math.floor(total / 100);
        customer.points += pointsEarned;
    }

    // Folio Generator
    const transactionId = `V-${Date.now().toString().slice(-6)}`;

    // Create Sale record
    const saleRecord = {
        id: transactionId,
        date: new Date().toISOString(),
        customerId: selectedCustomerId !== "0" ? selectedCustomerId : null,
        customerName: customerName,
        items: [...state.cart],
        subtotal,
        discount: discountAmt,
        tax,
        total,
        paymentMethod: activeMethod,
        amountReceived: received,
        changeReturned: Math.max(0, change),
        status: "completed"
    };

    state.sales.push(saleRecord);
    
    // Persist to local DB
    saveDatabase();

    // Close checkout and clear cart
    closeModal('modal-checkout');
    state.cart = [];
    cartDiscount = { type: 'amount', value: 0 };
    renderCart();
    
    // Render and print receipt
    renderPOS(); // update POS view
    playScanSound('success');
    viewSaleDetail(transactionId);
}

/* ==========================================================================
   3. INVENTORY VIEW CONTROLLER
   ========================================================================== */
function renderInventory() {
    // Populate category filters
    const filterCat = document.getElementById('inventory-filter-category');
    const prodCatSelect = document.getElementById('prod-category');
    
    const categories = state.settings.categories || [];
    
    if (filterCat) {
        filterCat.innerHTML = '<option value="">Todas las categorías</option>';
        categories.forEach(cat => {
            filterCat.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
    }

    if (prodCatSelect) {
        prodCatSelect.innerHTML = '<option value="">Seleccione una categoría</option>';
        categories.forEach(cat => {
            prodCatSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
    }

    // Render table
    renderInventoryTable();
}

function renderInventoryTable() {
    const searchVal = document.getElementById('inventory-search').value.toLowerCase();
    const catVal = document.getElementById('inventory-filter-category').value;
    const stockVal = document.getElementById('inventory-filter-stock').value;
    const tbody = document.getElementById('inventory-table-body');
    
    // Apply filters
    const filtered = state.products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchVal) || 
                              p.sku.toLowerCase().includes(searchVal);
                              
        const matchesCategory = !catVal || p.category === catVal;
        
        let matchesStock = true;
        if (stockVal === 'low') {
            matchesStock = p.stock > 0 && p.stock <= p.stockMin;
        } else if (stockVal === 'out') {
            matchesStock = p.stock <= 0;
        } else if (stockVal === 'ok') {
            matchesStock = p.stock > p.stockMin;
        }
        
        return matchesSearch && matchesCategory && matchesStock;
    });

    // Pagination slice
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (inventoryPage > totalPages) inventoryPage = totalPages;
    
    const startIdx = (inventoryPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = filtered.slice(startIdx, endIdx);

    // Build markup
    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted" style="padding: 40px;">
                    No se registran productos con los filtros seleccionados.
                </td>
            </tr>
        `;
        document.getElementById('inventory-pagination').innerHTML = '';
        return;
    }

    let rowsHtml = '';
    pageItems.forEach(p => {
        const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
        
        let stockBadge = 'ok';
        let stockText = `${p.stock} U.`;
        if (p.stock <= 0) {
            stockBadge = 'out';
            stockText = 'Sin Stock';
        } else if (p.stock <= p.stockMin) {
            stockBadge = 'low';
            stockText = `${p.stock} (Bajo)`;
        }

        rowsHtml += `
            <tr>
                <td style="font-weight: 700;">${p.sku}</td>
                <td style="font-weight: 500;">${p.name}</td>
                <td>${p.category}</td>
                <td class="text-right">${state.settings.currency}${p.cost.toFixed(2)}</td>
                <td class="text-right" style="font-weight: 700;">${state.settings.currency}${p.price.toFixed(2)}</td>
                <td class="text-center text-emerald" style="font-weight: 600;">${margin.toFixed(0)}%</td>
                <td class="text-center">
                    <span class="stock-pill ${stockBadge}">${stockText}</span>
                </td>
                <td class="text-center text-muted">${p.stockMin}</td>
                <td class="text-center">
                    <div class="table-action-btn-group">
                        <button class="btn btn-secondary btn-icon-only" onclick="editProduct('${p.id}')" title="Editar"><i data-lucide="edit-3" style="width:14px; height:14px;"></i></button>
                        <button class="btn btn-danger btn-outline btn-icon-only" onclick="deleteProduct('${p.id}')" title="Eliminar"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = rowsHtml;

    // Render pagination footer
    document.getElementById('inventory-pagination').innerHTML = `
        <span>Mostrando registros ${startIdx + 1}-${Math.min(endIdx, totalItems)} de ${totalItems}</span>
        <div class="flex-align-center" style="gap: 8px;">
            <button class="btn btn-secondary btn-icon-only" onclick="changeInventoryPage(-1)" ${inventoryPage === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" style="width:14px; height:14px;"></i></button>
            <span>Pág. ${inventoryPage} de ${totalPages}</span>
            <button class="btn btn-secondary btn-icon-only" onclick="changeInventoryPage(1)" ${inventoryPage === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" style="width:14px; height:14px;"></i></button>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
}

window.changeInventoryPage = function(delta) {
    inventoryPage += delta;
    renderInventoryTable();
};

// Create or edit product in DB
function saveProduct(e) {
    e.preventDefault();
    
    const id = document.getElementById('product-id-field').value;
    const sku = document.getElementById('prod-sku').value.trim().toUpperCase();
    const name = document.getElementById('prod-name').value.trim();
    const category = document.getElementById('prod-category').value;
    const cost = parseFloat(document.getElementById('prod-cost').value) || 0;
    const price = parseFloat(document.getElementById('prod-price').value) || 0;
    const stock = parseInt(document.getElementById('prod-stock').value) || 0;
    const stockMin = parseInt(document.getElementById('prod-stock-min').value) || 5;
    
    const isFileMode = document.getElementById('prod-image-src-file').checked;
    const image = isFileMode ? tempProductImageBase64 : document.getElementById('prod-image').value.trim();

    // Check SKU duplicate on creation
    if (!id) {
        const skuExists = state.products.find(p => p.sku === sku);
        if (skuExists) {
            alert(`Ya existe un repuesto con el SKU: ${sku}`);
            return;
        }
        
        state.products.push({
            id: `p_${Date.now()}`,
            sku, name, category, cost, price, stock, stockMin, image
        });
    } else {
        const product = state.products.find(p => p.id === id);
        if (product) {
            product.sku = sku;
            product.name = name;
            product.category = category;
            product.cost = cost;
            product.price = price;
            product.stock = stock;
            product.stockMin = stockMin;
            product.image = image;
        }
    }

    saveDatabase();
    closeModal('modal-product');
    renderInventory();
    playScanSound('success');
}

window.editProduct = function(id) {
    const p = state.products.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('product-modal-title').textContent = "Editar Repuesto";
    document.getElementById('product-id-field').value = p.id;
    document.getElementById('prod-sku').value = p.sku;
    document.getElementById('prod-sku').readOnly = true;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-category').value = p.category;
    document.getElementById('prod-cost').value = p.cost;
    document.getElementById('prod-price').value = p.price;
    document.getElementById('prod-stock').value = p.stock;
    document.getElementById('prod-stock-min').value = p.stockMin;
    
    // Reset image uploader UI first
    tempProductImageBase64 = "";
    const fileInput = document.getElementById('prod-image-file-input');
    if (fileInput) fileInput.value = "";

    const hasBase64Image = p.image && p.image.startsWith('data:image/');
    
    if (hasBase64Image) {
        const fileRadio = document.getElementById('prod-image-src-file');
        if (fileRadio) fileRadio.checked = true;
        
        tempProductImageBase64 = p.image;
        const previewImg = document.getElementById('prod-image-preview-img');
        if (previewImg) previewImg.src = p.image;
        
        const previewContainer = document.getElementById('prod-image-preview-container');
        if (previewContainer) previewContainer.style.display = 'flex';
        
        const dropzone = document.getElementById('prod-image-dropzone');
        if (dropzone) dropzone.style.display = 'none';
        
        const urlGroup = document.getElementById('prod-image-url-group');
        if (urlGroup) urlGroup.style.display = 'none';
        
        const urlInput = document.getElementById('prod-image');
        if (urlInput) urlInput.value = '';
        
        // Show file size information
        const sizeInKb = Math.round((p.image.length * 3/4) / 1024);
        const sizeInfo = document.getElementById('prod-image-size-info');
        if (sizeInfo) sizeInfo.textContent = `Optimizado: ~${sizeInKb} KB`;
    } else {
        const urlRadio = document.getElementById('prod-image-src-url');
        if (urlRadio) urlRadio.checked = true;
        
        const urlInput = document.getElementById('prod-image');
        if (urlInput) urlInput.value = p.image || '';
        
        const previewContainer = document.getElementById('prod-image-preview-container');
        if (previewContainer) previewContainer.style.display = 'none';
        
        const dropzone = document.getElementById('prod-image-dropzone');
        if (dropzone) dropzone.style.display = 'none';
        
        const urlGroup = document.getElementById('prod-image-url-group');
        if (urlGroup) urlGroup.style.display = 'block';
    }

    openModal('modal-product');
};

window.deleteProduct = function(id) {
    if (confirm("¿Estás seguro de que deseas eliminar este producto del catálogo?")) {
        state.products = state.products.filter(p => p.id !== id);
        saveDatabase();
        renderInventory();
        playScanSound('fail');
    }
};

/* ==========================================================================
   4. CUSTOMERS VIEW CONTROLLER
   ========================================================================== */
function renderCustomers() {
    renderCustomersTable();
}

function renderCustomersTable() {
    const searchVal = document.getElementById('customers-search').value.toLowerCase();
    const tbody = document.getElementById('customers-table-body');

    const filtered = state.customers.filter(c => {
        return c.name.toLowerCase().includes(searchVal) ||
               (c.phone && c.phone.includes(searchVal)) ||
               (c.email && c.email.toLowerCase().includes(searchVal)) ||
               (c.dni && c.dni.includes(searchVal));
    });

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (customersPage > totalPages) customersPage = totalPages;
    
    const startIdx = (customersPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = filtered.slice(startIdx, endIdx);

    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted" style="padding: 40px;">
                    No hay clientes registrados en el sistema.
                </td>
            </tr>
        `;
        document.getElementById('customers-pagination').innerHTML = '';
        return;
    }

    let rowsHtml = '';
    pageItems.forEach(c => {
        rowsHtml += `
            <tr>
                <td>${c.id}</td>
                <td style="font-weight: 600;">
                    ${c.name}
                    <div style="font-size: 11px; color: var(--text-muted); font-weight: normal; margin-top: 2px;">DNI: ${c.dni || 'No registrado'}</div>
                </td>
                <td>${c.phone || '<span class="text-muted">No registrado</span>'}</td>
                <td>${c.email || '<span class="text-muted">No registrado</span>'}</td>
                <td class="text-center" style="font-weight: 700; color: var(--primary);">${c.points} pts</td>
                <td>${c.dateRegistered || '-'}</td>
                <td class="text-center">
                    <div class="table-action-btn-group">
                        <button class="btn btn-secondary btn-icon-only" onclick="editCustomer('${c.id}')" title="Editar"><i data-lucide="edit-3" style="width:14px; height:14px;"></i></button>
                        <button class="btn btn-danger btn-outline btn-icon-only" onclick="deleteCustomer('${c.id}')" title="Eliminar"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = rowsHtml;

    document.getElementById('customers-pagination').innerHTML = `
        <span>Mostrando registros ${startIdx + 1}-${Math.min(endIdx, totalItems)} de ${totalItems}</span>
        <div class="flex-align-center" style="gap: 8px;">
            <button class="btn btn-secondary btn-icon-only" onclick="changeCustomersPage(-1)" ${customersPage === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" style="width:14px; height:14px;"></i></button>
            <span>Pág. ${customersPage} de ${totalPages}</span>
            <button class="btn btn-secondary btn-icon-only" onclick="changeCustomersPage(1)" ${customersPage === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" style="width:14px; height:14px;"></i></button>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
}

window.changeCustomersPage = function(delta) {
    customersPage += delta;
    renderCustomersTable();
};

function saveCustomer(e) {
    e.preventDefault();
    
    const id = document.getElementById('customer-id-field').value;
    const firstName = document.getElementById('cust-first-name').value.trim();
    const lastName = document.getElementById('cust-last-name').value.trim();
    const dni = document.getElementById('cust-dni').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const email = document.getElementById('cust-email').value.trim();
    const points = parseInt(document.getElementById('cust-points').value) || 0;
    
    const compiledName = `${firstName} ${lastName}`;

    if (!id) {
        // Create new
        state.customers.push({
            id: `c_${Date.now()}`,
            firstName,
            lastName,
            name: compiledName,
            dni,
            phone,
            email,
            points,
            dateRegistered: new Date().toISOString().split('T')[0]
        });
    } else {
        // Edit existing
        const customer = state.customers.find(c => c.id === id);
        if (customer) {
            customer.firstName = firstName;
            customer.lastName = lastName;
            customer.name = compiledName;
            customer.dni = dni;
            customer.phone = phone;
            customer.email = email;
            customer.points = points;
        }
    }

    saveDatabase();
    closeModal('modal-customer');
    
    // Refresh current view (POS or CRM)
    if (window.location.hash === '#pos') {
        renderPOS();
    } else {
        renderCustomers();
    }
    
    playScanSound('success');
}

window.editCustomer = function(id) {
    const c = state.customers.find(cust => cust.id === id);
    if (!c) return;

    document.getElementById('customer-modal-title').textContent = "Editar Cliente";
    document.getElementById('customer-id-field').value = c.id;
    document.getElementById('cust-first-name').value = c.firstName || c.name.split(' ')[0] || '';
    document.getElementById('cust-last-name').value = c.lastName || c.name.split(' ').slice(1).join(' ') || '';
    document.getElementById('cust-dni').value = c.dni || '';
    document.getElementById('cust-phone').value = c.phone || '';
    document.getElementById('cust-email').value = c.email || '';
    document.getElementById('cust-points').value = c.points;

    openModal('modal-customer');
};

window.deleteCustomer = function(id) {
    if (confirm("¿Deseas eliminar a este cliente de la base de datos? Sus puntos acumulados se perderán.")) {
        state.customers = state.customers.filter(c => c.id !== id);
        saveDatabase();
        renderCustomers();
        playScanSound('fail');
    }
};

/* ==========================================================================
   5. SALES HISTORY VIEW CONTROLLER
   ========================================================================== */
let activeReceiptId = '';

function renderHistory() {
    renderHistoryTable();
}

function renderHistoryTable() {
    const searchVal = document.getElementById('history-search').value.toLowerCase();
    const startVal = document.getElementById('history-filter-start').value;
    const endVal = document.getElementById('history-filter-end').value;
    const statusVal = document.getElementById('history-filter-status').value;
    const tbody = document.getElementById('history-table-body');

    const filtered = state.sales.filter(s => {
        const matchesSearch = s.id.toLowerCase().includes(searchVal) ||
                              s.customerName.toLowerCase().includes(searchVal);
                              
        const matchesStatus = !statusVal || s.status === statusVal;
        
        let matchesDates = true;
        if (startVal) {
            const startDate = new Date(startVal);
            startDate.setHours(0,0,0,0);
            matchesDates = matchesDates && (new Date(s.date) >= startDate);
        }
        if (endVal) {
            const endDate = new Date(endVal);
            endDate.setHours(23,59,59,999);
            matchesDates = matchesDates && (new Date(s.date) <= endDate);
        }

        return matchesSearch && matchesStatus && matchesDates;
    }).sort((a,b) => new Date(b.date) - new Date(a.date)); // Sort desc (recent first)

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (historyPage > totalPages) historyPage = totalPages;
    
    const startIdx = (historyPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = filtered.slice(startIdx, endIdx);

    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted" style="padding: 40px;">
                    No se encontraron transacciones registradas.
                </td>
            </tr>
        `;
        document.getElementById('history-pagination').innerHTML = '';
        return;
    }

    let rowsHtml = '';
    pageItems.forEach(s => {
        const itemsCount = s.items.reduce((sum, item) => sum + item.quantity, 0);
        
        let statusBadge = 'success';
        let statusText = 'Completada';
        if (s.status === 'voided') {
            statusBadge = 'danger';
            statusText = 'Anulada';
        }

        rowsHtml += `
            <tr>
                <td style="font-weight: 700; color: var(--primary);">${s.id}</td>
                <td>${new Date(s.date).toLocaleString('es-ES')}</td>
                <td style="font-weight: 500;">${s.customerName}</td>
                <td>${itemsCount} artículos</td>
                <td class="text-right" style="font-weight: 700;">${state.settings.currency}${s.total.toFixed(2)}</td>
                <td>${getPaymentMethodLabel(s.paymentMethod)}</td>
                <td class="text-center">
                    <span class="badge badge-${statusBadge}">${statusText}</span>
                </td>
                <td class="text-center">
                    <button class="btn btn-secondary" onclick="viewSaleDetail('${s.id}')">
                        <i data-lucide="eye" style="width:13px; height:13px;"></i> Detalle
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = rowsHtml;

    document.getElementById('history-pagination').innerHTML = `
        <span>Mostrando registros ${startIdx + 1}-${Math.min(endIdx, totalItems)} de ${totalItems}</span>
        <div class="flex-align-center" style="gap: 8px;">
            <button class="btn btn-secondary btn-icon-only" onclick="changeHistoryPage(-1)" ${historyPage === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" style="width:14px; height:14px;"></i></button>
            <span>Pág. ${historyPage} de ${totalPages}</span>
            <button class="btn btn-secondary btn-icon-only" onclick="changeHistoryPage(1)" ${historyPage === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" style="width:14px; height:14px;"></i></button>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
}

window.changeHistoryPage = function(delta) {
    historyPage += delta;
    renderHistoryTable();
};

window.viewSaleDetail = function(saleId) {
    const sale = state.sales.find(s => s.id === saleId);
    if (!sale) return;

    activeReceiptId = saleId;
    
    // Hide/show refund button depending on status
    const voidBtn = document.getElementById('receipt-void-btn');
    if (sale.status === 'voided') {
        voidBtn.style.display = 'none';
    } else {
        voidBtn.style.display = 'inline-flex';
    }

    const container = document.getElementById('receipt-modal-content');
    container.innerHTML = renderReceipt(sale, state.settings);
    
    openModal('modal-receipt');
};

// Void a sale (returns products back to stock)
function voidSale() {
    if (!activeReceiptId) return;
    
    const sale = state.sales.find(s => s.id === activeReceiptId);
    if (!sale || sale.status === 'voided') return;

    if (confirm(`¿Estás seguro de que deseas ANULAR la venta ${activeReceiptId}? Se devolverán los artículos al stock del inventario.`)) {
        // Return products to inventory
        sale.items.forEach(item => {
            const prod = state.products.find(p => p.id === item.id);
            if (prod) {
                prod.stock += item.quantity;
            }
        });

        // Deduct points from loyalty customer
        if (sale.customerId) {
            const customer = state.customers.find(c => c.id === sale.customerId);
            if (customer) {
                const pointsToDeduct = Math.floor(sale.total / 100);
                customer.points = Math.max(0, customer.points - pointsToDeduct);
            }
        }

        sale.status = 'voided';
        
        saveDatabase();
        closeModal('modal-receipt');
        renderHistory();
        playScanSound('fail');
        alert(`Venta ${activeReceiptId} anulada con éxito. Stock devuelto.`);
    }
}

/* ==========================================================================
   6. SETTINGS VIEW CONTROLLER
   ========================================================================== */
function saveSettings(e) {
    e.preventDefault();
    
    const storeName = document.getElementById('set-store-name').value.trim();
    const storeAddress = document.getElementById('set-store-address').value.trim();
    const storePhone = document.getElementById('set-store-phone').value.trim();
    const whatsapp = document.getElementById('set-store-whatsapp').value.trim();
    const instagram = document.getElementById('set-store-instagram').value.trim();
    const brandDescription = document.getElementById('set-store-description').value.trim();
    const currency = document.getElementById('set-store-currency').value.trim();
    const storeTax = parseFloat(document.getElementById('set-store-tax').value) || 0;
    
    const cardBgType = document.getElementById('set-card-bg-type').value;
    const cardBgColor = document.getElementById('set-card-bg-color').value;
    const cardBgColorHover = document.getElementById('set-card-bg-hover').value;

    const theme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
    const activeDot = document.querySelector('#accent-pickers-container .color-dot.active');
    const accentColor = activeDot ? activeDot.dataset.color : 'violet';

    if (tempLogoBase64 !== null) {
        state.settings.logo = tempLogoBase64;
    }
    if (tempCardBgImageBase64 !== null) {
        state.settings.cardBgImage = tempCardBgImageBase64;
    }

    state.settings = {
        ...state.settings,
        storeName,
        storeAddress,
        storePhone,
        currency,
        storeTax,
        cardBgType,
        cardBgColor,
        cardBgColorHover,
        theme,
        accentColor,
        whatsapp,
        instagram,
        brandDescription
    };

    // Apply brand settings dynamically
    applyBrandSettings();

    saveDatabase();
    playScanSound('success');
    alert("Configuración de la empresa y diseño visual guardados con éxito.");
}

function applyBrandSettings() {
    if (!state.settings) return;
    
    // Apply theme & accent
    applyThemeMode(state.settings.theme || 'dark');
    applyAccentTheme(state.settings.accentColor || 'violet');
    
        const storeName = state.settings.storeName || "Macutech";
    
    // Update page title
    document.title = `${storeName} - Control de Ventas e Inventario`;
    
    // Sync header/sidebar text displays
    const storeNameSidebar = document.getElementById('store-name-sidebar');
    if (storeNameSidebar) {
        storeNameSidebar.textContent = storeName;
    }
    
    const logoTitleSidebar = document.getElementById('logo-title-sidebar');
    if (logoTitleSidebar) {
        logoTitleSidebar.innerHTML = storeName;
    }
    const logoTitleLogin = document.getElementById('logo-title-login');
    if (logoTitleLogin) {
        logoTitleLogin.innerHTML = storeName;
    }
    const catalogStoreName = document.getElementById('catalog-store-name');
    if (catalogStoreName) {
        catalogStoreName.textContent = storeName;
    }

    // Render description, whatsapp and instagram in public catalog
    const catalogDescText = document.getElementById('catalog-description-text');
    const catalogWhatsappLink = document.getElementById('catalog-whatsapp-link');
    const catalogInstagramLink = document.getElementById('catalog-instagram-link');
    const catalogInfoCard = document.getElementById('catalog-info-card');

    let hasInfo = false;

    if (catalogDescText) {
        const desc = state.settings.brandDescription || "";
        if (desc) {
            catalogDescText.textContent = desc;
            catalogDescText.style.display = 'block';
            hasInfo = true;
        } else {
            catalogDescText.style.display = 'none';
        }
    }

    if (catalogWhatsappLink) {
        let wa = state.settings.whatsapp || "";
        if (wa) {
            wa = wa.trim();
            let waUrl = wa;
            if (!wa.startsWith('http://') && !wa.startsWith('https://')) {
                const digits = wa.replace(/[^\d+]/g, '');
                waUrl = `https://wa.me/${digits.replace('+', '')}`;
            }
            catalogWhatsappLink.href = waUrl;
            catalogWhatsappLink.style.display = 'inline-flex';
            hasInfo = true;
        } else {
            catalogWhatsappLink.style.display = 'none';
        }
    }

    if (catalogInstagramLink) {
        let ig = state.settings.instagram || "";
        if (ig) {
            ig = ig.trim();
            let igUrl = ig;
            if (!ig.startsWith('http://') && !ig.startsWith('https://')) {
                const username = ig.replace('@', '');
                igUrl = `https://instagram.com/${username}`;
            }
            catalogInstagramLink.href = igUrl;
            catalogInstagramLink.style.display = 'inline-flex';
            hasInfo = true;
        } else {
            catalogInstagramLink.style.display = 'none';
        }
    }

    if (catalogInfoCard) {
        catalogInfoCard.style.display = hasInfo ? 'flex' : 'none';
    }

    if (window.lucide && hasInfo) {
        lucide.createIcons();
    }

    // Logo handling
    const logoUrl = state.settings.logo;
    const sidebarLogoIcon = document.getElementById('logo-icon-container');
    const sidebarLogoDefault = document.getElementById('logo-icon-default');
    const sidebarLogoImg = document.getElementById('logo-icon-img');
    
    const loginLogoIcon = document.getElementById('login-logo-container');
    const loginLogoDefault = document.getElementById('login-logo-default');
    const loginLogoImg = document.getElementById('login-logo-img');

    const catalogLogoIcon = document.getElementById('catalog-logo-container');
    const catalogLogoDefault = document.getElementById('catalog-logo-default');
    const catalogLogoImg = document.getElementById('catalog-logo-img');
    
    if (logoUrl) {
        // Display custom logo image
        if (sidebarLogoIcon) sidebarLogoIcon.classList.add('has-custom-logo');
        if (sidebarLogoDefault) sidebarLogoDefault.style.display = 'none';
        if (sidebarLogoImg) {
            sidebarLogoImg.src = logoUrl;
            sidebarLogoImg.style.display = 'block';
        }
        
        if (loginLogoIcon) loginLogoIcon.classList.add('has-custom-logo');
        if (loginLogoDefault) loginLogoDefault.style.display = 'none';
        if (loginLogoImg) {
            loginLogoImg.src = logoUrl;
            loginLogoImg.style.display = 'block';
        }

        if (catalogLogoIcon) catalogLogoIcon.classList.add('has-custom-logo');
        if (catalogLogoDefault) catalogLogoDefault.style.display = 'none';
        if (catalogLogoImg) {
            catalogLogoImg.src = logoUrl;
            catalogLogoImg.style.display = 'block';
        }
    } else {
        // Default wrench icon
        if (sidebarLogoIcon) sidebarLogoIcon.classList.remove('has-custom-logo');
        if (sidebarLogoDefault) sidebarLogoDefault.style.display = 'block';
        if (sidebarLogoImg) sidebarLogoImg.style.display = 'none';
        
        if (loginLogoIcon) loginLogoIcon.classList.remove('has-custom-logo');
        if (loginLogoDefault) loginLogoDefault.style.display = 'block';
        if (loginLogoImg) loginLogoImg.style.display = 'none';

        if (catalogLogoIcon) catalogLogoIcon.classList.remove('has-custom-logo');
        if (catalogLogoDefault) catalogLogoDefault.style.display = 'block';
        if (catalogLogoImg) catalogLogoImg.style.display = 'none';
    }

    // Card custom styles logic
    const bgType = state.settings.cardBgType || 'default';
    const bgColor = state.settings.cardBgColor || '#1f2937';
    const bgHover = state.settings.cardBgColorHover || '#26354a';
    const bgImage = state.settings.cardBgImage || '';
    
    let dynamicCss = '';
    
    if (bgType === 'glass') {
        dynamicCss = `
            :root, body.light-theme {
                --bg-card: rgba(255, 255, 255, 0.03) !important;
                --bg-card-hover: rgba(255, 255, 255, 0.07) !important;
                --border-color: rgba(255, 255, 255, 0.08) !important;
            }
            .metric-card, .dashboard-panel, .prod-card, .data-table-card, .data-op-card, .login-card {
                backdrop-filter: blur(14px) !important;
                -webkit-backdrop-filter: blur(14px) !important;
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3) !important;
            }
        `;
    } else if (bgType === 'aurora') {
        dynamicCss = `
            :root, body.light-theme {
                --bg-card: linear-gradient(135deg, rgba(31, 41, 55, 0.9) 0%, rgba(99, 102, 241, 0.12) 100%) !important;
                --bg-card-hover: linear-gradient(135deg, rgba(38, 53, 74, 0.9) 0%, rgba(99, 102, 241, 0.18) 100%) !important;
                --border-color: rgba(99, 102, 241, 0.3) !important;
                --border-hover: rgba(99, 102, 241, 0.5) !important;
            }
            .metric-card, .dashboard-panel, .prod-card, .data-table-card, .data-op-card, .login-card {
                box-shadow: 0 4px 20px rgba(99, 102, 241, 0.1) !important;
            }
        `;
    } else if (bgType === 'carbon') {
        dynamicCss = `
            :root, body.light-theme {
                --bg-card: linear-gradient(135deg, #151a22 0%, #0a0c10 100%) !important;
                --bg-card-hover: linear-gradient(135deg, #1b222c 0%, #101319 100%) !important;
                --border-color: rgba(255, 255, 255, 0.04) !important;
                --border-hover: rgba(255, 255, 255, 0.08) !important;
            }
            .metric-card, .dashboard-panel, .prod-card, .data-table-card, .data-op-card, .login-card {
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.55) !important;
            }
        `;
    } else if (bgType === 'color') {
        dynamicCss = `
            :root, body.light-theme {
                --bg-card: ${bgColor} !important;
                --bg-card-hover: ${bgHover} !important;
            }
        `;
    } else if (bgType === 'image') {
        if (bgImage) {
            dynamicCss = `
                .metric-card, .dashboard-panel, .prod-card, .data-table-card, .data-op-card, .login-card {
                    background-image: url('${bgImage}') !important;
                    background-size: cover !important;
                    background-position: center !important;
                    background-repeat: no-repeat !important;
                    border-color: rgba(255, 255, 255, 0.08) !important;
                }
            `;
        }
    }
    
    const styleTag = document.getElementById('custom-brand-styles');
    if (styleTag) {
        styleTag.innerHTML = dynamicCss;
    }
}

// Category Management Functions
function renderCategorySettings() {
    const list = document.getElementById('settings-category-list');
    if (!list) return;

    if (!state.settings.categories) {
        state.settings.categories = ['Sistema Eléctrico', 'Repuestos de Motor', 'Frenos', 'Transmisión', 'Herramientas', 'Accesorios'];
    }

    let html = '';
    state.settings.categories.forEach((cat, index) => {
        html += `
            <div class="category-item">
                <span>${cat}</span>
                <button class="btn-icon" onclick="deleteCategory(${index})" title="Eliminar categoría" style="color: var(--rose-red);">
                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                </button>
            </div>
        `;
    });
    list.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

window.addCategory = function() {
    const input = document.getElementById('new-category-name');
    const name = input.value.trim();
    if (!name) return;

    if (!state.settings.categories) state.settings.categories = [];
    if (state.settings.categories.includes(name)) {
        alert("La categoría ya existe.");
        return;
    }

    state.settings.categories.push(name);
    input.value = '';
    saveDatabase();
    renderCategorySettings();
    renderInventory();
    
    // Also re-render POS tabs if we are in POS view
    if (document.getElementById('view-pos').classList.contains('active')) {
        renderPOS();
    }
}

window.deleteCategory = function(index) {
    if (!state.settings.categories) return;
    
    const catName = state.settings.categories[index];
    const inUse = state.products.some(p => p.category === catName);
    
    if (inUse) {
        const confirmDelete = confirm(`Hay productos utilizando la categoría "${catName}". ¿Estás seguro de eliminarla? Los productos conservarán el nombre de la categoría pero ya no aparecerá en el menú principal.`);
        if (!confirmDelete) return;
    }

    state.settings.categories.splice(index, 1);
    saveDatabase();
    renderCategorySettings();
    renderInventory();
    
    if (document.getElementById('view-pos').classList.contains('active')) {
        renderPOS();
    }
}

/* ==========================================================================
   Public Customer Catalog Controller
   ========================================================================== */
function renderCatalog() {
    const storeName = state.settings.storeName || "Macutech";
    const logoUrl = state.settings.logo;
    
    // Sync store name and logo preview elements
    const catalogStoreName = document.getElementById('catalog-store-name');
    if (catalogStoreName) catalogStoreName.textContent = storeName;

    const catalogLogoDefault = document.getElementById('catalog-logo-default');
    const catalogLogoImg = document.getElementById('catalog-logo-img');
    const catalogLogoIcon = document.getElementById('catalog-logo-container');
    if (logoUrl) {
        if (catalogLogoIcon) catalogLogoIcon.classList.add('has-custom-logo');
        if (catalogLogoDefault) catalogLogoDefault.style.display = 'none';
        if (catalogLogoImg) {
            catalogLogoImg.src = logoUrl;
            catalogLogoImg.style.display = 'block';
        }
    } else {
        if (catalogLogoIcon) catalogLogoIcon.classList.remove('has-custom-logo');
        if (catalogLogoDefault) catalogLogoDefault.style.display = 'block';
        if (catalogLogoImg) catalogLogoImg.style.display = 'none';
    }

    // Populate Category Tabs
    const tabsContainer = document.getElementById('catalog-categories-container');
    if (tabsContainer) {
        const categories = ['Todas', ...(state.settings.categories || [])];
        let tabsHtml = '';
        categories.forEach(cat => {
            const displayCat = cat === 'Todas' ? '' : cat;
            const activeClass = activeCatalogCategory === displayCat ? 'active' : '';
            tabsHtml += `
                <button class="category-tab ${activeClass}" onclick="setCatalogCategory('${displayCat}')">
                    ${cat}
                </button>
            `;
        });
        tabsContainer.innerHTML = tabsHtml;
    }

    renderCatalogProductGrid();
}

window.setCatalogCategory = function(cat) {
    activeCatalogCategory = cat;
    renderCatalog();
};

function renderCatalogProductGrid() {
    const searchVal = document.getElementById('catalog-search-input').value.toLowerCase();
    const grid = document.getElementById('catalog-products-grid');
    if (!grid) return;
    
    const filtered = state.products.filter(p => {
        const matchesCategory = !activeCatalogCategory || p.category === activeCatalogCategory;
        const matchesSearch = p.name.toLowerCase().includes(searchVal) || 
                              p.sku.toLowerCase().includes(searchVal);
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state-small" style="grid-column: 1 / -1;">
                <i data-lucide="package-x" style="width: 48px; height: 48px; opacity: 0.3;"></i>
                <p>No se encontraron repuestos o herramientas en este catálogo.</p>
            </div>
        `;
    } else {
        let cardsHtml = '';
        filtered.forEach(p => {
            cardsHtml += createCatalogProductCard(p, state.settings.currency);
        });
        grid.innerHTML = cardsHtml;
    }
    
    if (window.lucide) lucide.createIcons();
}

// Export database as JSON file download
function exportJSONBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `aurapos_backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    playScanSound('success');
}

// Restore database from JSON backup upload
function importJSONBackup(e) {
    const fileReader = new FileReader();
    fileReader.onload = function(event) {
        try {
            const parsedData = JSON.parse(event.target.result);
            
            // Validate schema
            if (parsedData.products && parsedData.sales && parsedData.customers && parsedData.settings) {
                state = parsedData;
                saveDatabase();
                syncSettingsInputs(); // sync settings inputs
                renderApp();
                playScanSound('success');
                alert("Base de datos restaurada con éxito.");
            } else {
                throw new Error("El archivo no contiene el formato correcto de AuraPOS.");
            }
        } catch (error) {
            playScanSound('fail');
            alert(`Error al importar el archivo: ${error.message}`);
        }
    };
    if (e.target.files[0]) {
        fileReader.readAsText(e.target.files[0]);
    }
}

// Export sales logs as a CSV file
function exportSalesCSV() {
    if (state.sales.length === 0) {
        alert("No se registran ventas para exportar.");
        return;
    }

    // CSV Headers
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Folio,Fecha,Cliente,Subtotal,Descuento,Impuestos,Total,Metodo Pago,Estado\r\n";

    state.sales.forEach(s => {
        const row = [
            s.id,
            new Date(s.date).toISOString().replace('T', ' ').slice(0, 19),
            `"${s.customerName}"`,
            s.subtotal.toFixed(2),
            s.discount.toFixed(2),
            s.tax.toFixed(2),
            s.total.toFixed(2),
            s.paymentMethod,
            s.status
        ];
        csvContent += row.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", encodedUri);
    downloadAnchor.setAttribute("download", `reporte_ventas_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    playScanSound('success');
}

// Utility helper for translation mapping
function getPaymentMethodLabel(method) {
    switch (method) {
        case 'cash': return 'Efectivo';
        case 'card': return 'Tarjeta';
        case 'transfer': return 'Transferencia';
        default: return 'Otro';
    }
}

/* ==========================================================================
   7. CAJA (CASH CONTROL) VIEW CONTROLLER
   ========================================================================== */
function renderCaja() {
    // 1. Calculate Metrics
    const currency = state.settings.currency || '$';
    
    // Cash Sales metrics
    const cashSales = state.sales.filter(s => s.paymentMethod === 'cash');
    const salesTotal = cashSales.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.total, 0);
    const salesCount = cashSales.filter(s => s.status === 'completed').length;
    
    // Voided Sales metrics (cash)
    const voidsTotal = cashSales.filter(s => s.status === 'voided').reduce((sum, s) => sum + s.total, 0);
    
    // Manual inflows
    const inflowsTotal = state.cashMovements.filter(m => m.type === 'inflow').reduce((sum, m) => sum + m.amount, 0);
    const inflowsCount = state.cashMovements.filter(m => m.type === 'inflow').length;
    
    // Manual outflows
    const outflowsTotal = state.cashMovements.filter(m => m.type === 'outflow').reduce((sum, m) => sum + m.amount, 0);
    const outflowsCount = state.cashMovements.filter(m => m.type === 'outflow').length;
    
    // Balance
    const balance = salesTotal - voidsTotal + inflowsTotal - outflowsTotal;
    
    // Update metric displays
    document.getElementById('caja-metric-balance').textContent = `${currency}${balance.toFixed(2)}`;
    document.getElementById('caja-metric-sales').textContent = `${currency}${salesTotal.toFixed(2)}`;
    document.getElementById('caja-metric-sales-count').textContent = `${salesCount} transacciones`;
    document.getElementById('caja-metric-inflows').textContent = `${currency}${inflowsTotal.toFixed(2)}`;
    document.getElementById('caja-metric-inflows-count').textContent = `${inflowsCount} movimientos`;
    document.getElementById('caja-metric-outflows').textContent = `${currency}${outflowsTotal.toFixed(2)}`;
    document.getElementById('caja-metric-outflows-count').textContent = `${outflowsCount} movimientos`;

    // Set border color of main balance based on sign
    const balanceCard = document.getElementById('caja-metric-balance').closest('.metric-card');
    if (balance < 0) {
        balanceCard.style.borderColor = 'var(--danger)';
    } else {
        balanceCard.style.borderColor = '';
    }

    // 2. Build the unified table rows
    const searchVal = document.getElementById('caja-search').value.toLowerCase();
    const typeVal = document.getElementById('caja-filter-type').value;
    const tbody = document.getElementById('caja-table-body');
    
    const allMovements = compileAllCashMovements();
    
    // Filter
    const filtered = allMovements.filter(m => {
        const matchesSearch = m.concept.toLowerCase().includes(searchVal) || m.notes.toLowerCase().includes(searchVal);
        const matchesType = !typeVal || m.type === typeVal;
        return matchesSearch && matchesType;
    });

    // Pagination
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (cajaPage > totalPages) cajaPage = totalPages;
    
    const startIdx = (cajaPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = filtered.slice(startIdx, endIdx);

    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted" style="padding: 40px;">
                    No se registran movimientos con los filtros seleccionados.
                </td>
            </tr>
        `;
        document.getElementById('caja-pagination').innerHTML = '';
        return;
    }

    let rowsHtml = '';
    pageItems.forEach(m => {
        let typeBadgeClass = 'badge-primary';
        let typeText = 'Venta';
        let amountPrefix = '+';
        let amountClass = 'text-success';
        
        if (m.type === 'inflow') {
            typeBadgeClass = 'badge-success';
            typeText = 'Ingreso Manual';
            amountPrefix = '+';
            amountClass = 'text-success';
        } else if (m.type === 'outflow') {
            typeBadgeClass = 'badge-danger';
            typeText = 'Egreso Manual';
            amountPrefix = '-';
            amountClass = 'text-danger';
        } else if (m.type === 'voided') {
            typeBadgeClass = 'badge-warning';
            typeText = 'Anulación';
            amountPrefix = '-';
            amountClass = 'text-danger';
        } else if (m.type === 'sale') {
            typeBadgeClass = 'badge-primary';
            typeText = 'Venta Efectivo';
            amountPrefix = '+';
            amountClass = 'text-success';
        }

        rowsHtml += `
            <tr>
                <td>${new Date(m.date).toLocaleString('es-ES')}</td>
                <td><span class="badge ${typeBadgeClass}">${typeText}</span></td>
                <td style="font-weight: 500;">${m.concept}</td>
                <td class="text-right ${amountClass}" style="font-weight: 700;">
                    ${amountPrefix}${currency}${m.amount.toFixed(2)}
                </td>
                <td class="text-muted" style="font-size: 13px;">${m.notes || '-'}</td>
            </tr>
        `;
    });
    tbody.innerHTML = rowsHtml;

    // Render pagination footer
    document.getElementById('caja-pagination').innerHTML = `
        <span>Mostrando registros ${startIdx + 1}-${Math.min(endIdx, totalItems)} de ${totalItems}</span>
        <div class="flex-align-center" style="gap: 8px;">
            <button class="btn btn-secondary btn-icon-only" onclick="changeCajaPage(-1)" ${cajaPage === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" style="width:14px; height:14px;"></i></button>
            <span>Pág. ${cajaPage} de ${totalPages}</span>
            <button class="btn btn-secondary btn-icon-only" onclick="changeCajaPage(1)" ${cajaPage === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" style="width:14px; height:14px;"></i></button>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
}

window.changeCajaPage = function(delta) {
    cajaPage += delta;
    renderCaja();
};

function saveCajaMovement(e) {
    e.preventDefault();
    
    const type = document.getElementById('caja-movement-type-field').value;
    const amount = parseFloat(document.getElementById('caja-movement-amount').value) || 0;
    const concept = document.getElementById('caja-movement-concept').value.trim();
    const notes = document.getElementById('caja-movement-notes').value.trim();
    
    if (amount <= 0) {
        alert("El monto debe ser mayor a 0.");
        return;
    }
    
    const movement = {
        id: `cm_${Date.now()}`,
        date: new Date().toISOString(),
        type,
        amount,
        concept,
        notes
    };
    
    state.cashMovements.push(movement);
    saveDatabase();
    
    closeModal('modal-caja-movement');
    document.getElementById('caja-movement-form').reset();
    
    renderCaja();
    playScanSound('success');
}

function compileAllCashMovements() {
    let movements = [];
    // Add manual cash movements
    if (state.cashMovements) {
        state.cashMovements.forEach(m => {
            movements.push({
                id: m.id,
                date: m.date,
                type: m.type, // 'inflow' | 'outflow'
                amount: m.amount,
                concept: m.concept,
                notes: m.notes || ''
            });
        });
    }
    // Add cash sales
    if (state.sales) {
        state.sales.forEach(s => {
            if (s.paymentMethod === 'cash') {
                if (s.status === 'completed') {
                    movements.push({
                        id: s.id,
                        date: s.date,
                        type: 'sale',
                        amount: s.total,
                        concept: `Venta en Efectivo (Folio: ${s.id})`,
                        notes: `Cliente: ${s.customerName}`
                    });
                } else if (s.status === 'voided') {
                    movements.push({
                        id: s.id,
                        date: s.date,
                        type: 'voided',
                        amount: s.total,
                        concept: `Anulación Venta Efectivo (Folio: ${s.id})`,
                        notes: `Reembolso de venta por anulación`
                    });
                }
            }
        });
    }
    return movements.sort((a, b) => new Date(b.date) - new Date(a.date)); // descending date (newest first)
}

/* ==========================================================================
   8. EXCEL MASS IMPORT CONTROLLER
   ========================================================================== */
let tempExcelProducts = [];

function findExcelColumnIndex(headers, targets) {
    for (let i = 0; i < headers.length; i++) {
        if (headers[i] === undefined || headers[i] === null) continue;
        const h = headers[i].toString().toLowerCase().trim()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove accents
        if (targets.includes(h)) {
            return i;
        }
    }
    return -1;
}

function handleExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Read first sheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convert to 2D array (header: 1 forces array of arrays)
            const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (jsonRows.length < 2) {
                alert("El archivo Excel no tiene suficientes filas. Debe contener los encabezados y al menos un producto.");
                return;
            }
            
            const headers = jsonRows[0];
            
            // Mappings (variations in spanish/english)
            const skuIdx = findExcelColumnIndex(headers, ['sku', 'codigo', 'code', 'referencia', 'id']);
            const nameIdx = findExcelColumnIndex(headers, ['nombre', 'name', 'descripcion', 'producto', 'articulo', 'detalle']);
            const catIdx = findExcelColumnIndex(headers, ['categoria', 'category']);
            const costIdx = findExcelColumnIndex(headers, ['costo', 'cost', 'compra', 'precio compra']);
            const priceIdx = findExcelColumnIndex(headers, ['precio', 'price', 'venta', 'precio venta']);
            const stockIdx = findExcelColumnIndex(headers, ['stock', 'cantidad', 'cant']);
            const minIdx = findExcelColumnIndex(headers, ['stockmin', 'stock minimo', 'minimo', 'alerta']);
            
            if (skuIdx === -1) {
                alert("No se pudo detectar la columna 'SKU' o 'Código'. Por favor, asegúrate de que el archivo Excel tenga una columna con uno de estos nombres.");
                return;
            }
            
            tempExcelProducts = [];
            let duplicates = new Set();
            
            for (let i = 1; i < jsonRows.length; i++) {
                const row = jsonRows[i];
                if (!row || row.length === 0) continue;
                
                const rawSku = row[skuIdx];
                if (rawSku === undefined || rawSku === null || rawSku.toString().trim() === '') continue;
                
                const sku = rawSku.toString().trim().toUpperCase();
                if (duplicates.has(sku)) continue; // skip duplicates in the spreadsheet
                duplicates.add(sku);
                
                // Lookup in current database
                const exists = state.products.find(p => p.sku === sku);
                
                // Read values with fallbacks
                const name = nameIdx !== -1 && row[nameIdx] !== undefined && row[nameIdx] !== null 
                    ? row[nameIdx].toString().trim() 
                    : (exists ? exists.name : `Repuesto SKU ${sku}`);
                
                const category = catIdx !== -1 && row[catIdx] !== undefined && row[catIdx] !== null 
                    ? row[catIdx].toString().trim() 
                    : (exists ? exists.category : 'Repuestos de Motor');
                
                const cost = costIdx !== -1 && row[costIdx] !== undefined && row[costIdx] !== null 
                    ? parseFloat(row[costIdx]) || 0 
                    : (exists ? exists.cost : 0);
                
                const price = priceIdx !== -1 && row[priceIdx] !== undefined && row[priceIdx] !== null 
                    ? parseFloat(row[priceIdx]) || 0 
                    : (exists ? exists.price : 0);
                
                const stock = stockIdx !== -1 && row[stockIdx] !== undefined && row[stockIdx] !== null 
                    ? parseInt(row[stockIdx]) || 0 
                    : (exists ? exists.stock : 0);
                
                const stockMin = minIdx !== -1 && row[minIdx] !== undefined && row[minIdx] !== null 
                    ? parseInt(row[minIdx]) || 5 
                    : (exists ? exists.stockMin : 5);
                
                tempExcelProducts.push({
                    sku, name, category, cost, price, stock, stockMin,
                    isNew: !exists,
                    existingProduct: exists || null
                });
            }
            
            if (tempExcelProducts.length === 0) {
                alert("No se encontraron registros de productos procesables en el archivo Excel.");
                return;
            }
            
            showExcelImportPreview();
            
        } catch (error) {
            console.error("Excel processing failed:", error);
            alert("Ocurrió un error al procesar el archivo Excel: " + error.message);
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

function showExcelImportPreview() {
    const totalCount = tempExcelProducts.length;
    const newCount = tempExcelProducts.filter(p => p.isNew).length;
    const updateCount = totalCount - newCount;
    
    document.getElementById('excel-total-count').textContent = totalCount;
    document.getElementById('excel-new-count').textContent = newCount;
    document.getElementById('excel-update-count').textContent = updateCount;
    
    const tbody = document.getElementById('excel-preview-table-body');
    let rowsHtml = '';
    const currency = state.settings.currency || '$';
    
    // Show first 5 items to keep modal lightweight
    const previewItems = tempExcelProducts.slice(0, 5);
    previewItems.forEach(p => {
        const badgeClass = p.isNew ? 'badge-success' : 'badge-warning';
        const badgeText = p.isNew ? 'Nuevo' : 'Actualizar';
        
        rowsHtml += `
            <tr>
                <td style="font-weight: 700;">${p.sku}</td>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td class="text-right">${currency}${p.cost.toFixed(2)}</td>
                <td class="text-right" style="font-weight: 700;">${currency}${p.price.toFixed(2)}</td>
                <td class="text-center" style="font-weight: 700;">${p.stock}</td>
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
            </tr>
        `;
    });
    
    if (totalCount > 5) {
        rowsHtml += `
            <tr>
                <td colspan="7" class="text-center text-muted" style="padding: 12px; font-weight: 500;">
                    ... y ${totalCount - 5} productos más en el archivo ...
                  </td>
            </tr>
        `;
    }
    
    tbody.innerHTML = rowsHtml;
    
    if (window.lucide) lucide.createIcons();
    openModal('modal-excel-preview');
}

function confirmExcelImport() {
    if (tempExcelProducts.length === 0) return;
    
    let created = 0;
    let updated = 0;
    
    tempExcelProducts.forEach(p => {
        if (p.isNew) {
            state.products.push({
                id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                sku: p.sku,
                name: p.name,
                category: p.category,
                cost: p.cost,
                price: p.price,
                stock: p.stock,
                stockMin: p.stockMin,
                image: ''
            });
            created++;
        } else {
            const prod = state.products.find(item => item.id === p.existingProduct.id);
            if (prod) {
                prod.name = p.name;
                prod.category = p.category;
                prod.cost = p.cost;
                prod.price = p.price;
                prod.stock = p.stock;
                prod.stockMin = p.stockMin;
                updated++;
            }
        }
    });
    
    saveDatabase();
    closeModal('modal-excel-preview');
    
    // Refresh view
    inventoryPage = 1;
    renderInventory();
    playScanSound('success');
    
    alert(`Importación Masiva Completada:\n- ${created} productos nuevos creados.\n- ${updated} productos existentes actualizados.`);
    tempExcelProducts = [];
}

function downloadExcelTemplate() {
    // Columns
    const headers = ['SKU', 'Nombre', 'Categoria', 'Costo', 'Precio', 'Stock', 'Stock Minimo'];
    
    // Sample items for motorcycle spare parts store
    const rows = [
        ['REP-FIL-NAF', 'Filtro de Nafta Universal Motocicleta', 'Repuestos de Motor', 150.00, 320.00, 50, 10],
        ['REP-BUJ-NGK-D8EA', 'Bujía NGK D8EA (Motos 110cc-150cc)', 'Sistema Eléctrico', 420.00, 800.00, 100, 15],
        ['REP-TRA-CAD-DID', 'Cadena DID 428H-118L Reforzada', 'Transmisión', 3500.00, 5900.00, 15, 5]
    ];
    
    const data = [headers, ...rows];
    
    try {
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla de Inventario');
        
        // Write file binary
        XLSX.writeFile(workbook, 'plantilla_inventario_dhmotopartes.xlsx');
        playScanSound('success');
    } catch (err) {
        console.error("Template generation failed:", err);
        alert("No se pudo generar la plantilla Excel: " + err.message);
    }
}

function exportInventoryExcel() {
    if (state.products.length === 0) {
        alert("No hay productos en el inventario para exportar.");
        return;
    }
    
    // Headers
    const headers = ['SKU', 'Nombre', 'Categoria', 'Costo', 'Precio', 'Stock', 'Stock Minimo'];
    
    // Data Rows
    const rows = state.products.map(p => [
        p.sku,
        p.name,
        p.category,
        p.cost,
        p.price,
        p.stock,
        p.stockMin
    ]);
    
    const data = [headers, ...rows];
    
    try {
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario DHMotopartes');
        
        XLSX.writeFile(workbook, 'inventario_completo.xlsx');
        playScanSound('success');
    } catch (err) {
        console.error("Inventory export failed:", err);
        alert("Ocurrió un error al exportar el inventario a Excel: " + err.message);
    }
}

/* ==========================================================================
   9. SUPERADMIN CASHIER MANAGEMENT PANEL
   ========================================================================== */
async function renderCajerosList() {
    if (!supabaseInitialized || currentUserRole !== 'superadmin') return;
    
    const tbody = document.getElementById('cajeros-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center text-muted" style="padding: 20px;">
                <i data-lucide="loader" class="animate-spin" style="animation: spin 1s linear infinite;"></i> Cargando personal...
            </td>
        </tr>
    `;
    if (window.lucide) lucide.createIcons();
    
    try {
        const { data: profiles, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .order('email', { ascending: true });
            
        if (error) throw error;
        
        if (!profiles || profiles.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted" style="padding: 20px;">
                        No hay personal registrado.
                    </td>
                </tr>
            `;
            return;
        }
        
        const session = (await supabaseClient.auth.getSession()).data.session;
        const currentUid = session ? session.user.id : null;
        
        let rowsHtml = '';
        profiles.forEach(p => {
            const isSelf = p.id === currentUid;
            const selectDisabled = isSelf ? 'disabled' : '';
            
            rowsHtml += `
                <tr>
                    <td style="font-weight: 600;">${p.email}</td>
                    <td>${p.dni || '-'}</td>
                    <td>${p.first_name || ''} ${p.last_name || ''}</td>
                    <td>
                        <select onchange="updateCajeroRole('${p.id}', this.value)" ${selectDisabled} style="padding: 4px 8px; font-size: 12px; width: auto; height: auto;">
                            <option value="usuario" ${p.role === 'usuario' ? 'selected' : ''}>Usuario / Cliente</option>
                            <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Cajero (Admin)</option>
                            <option value="superadmin" ${p.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
                        </select>
                    </td>
                    <td class="text-center">
                        <button class="btn btn-danger btn-outline btn-icon-only" onclick="deleteCajero('${p.id}')" ${selectDisabled} title="Eliminar Cajero" style="width: 28px; height: 28px;">
                            <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = rowsHtml;
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error("Error rendering cajeros:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger" style="padding: 20px;">
                    Error al cargar personal: ${err.message}
                </td>
            </tr>
        `;
    }
}

window.updateCajeroRole = async function(userId, newRole) {
    if (!supabaseInitialized || currentUserRole !== 'superadmin') return;
    
    try {
        const { error } = await supabaseClient
            .from('user_profiles')
            .update({ role: newRole })
            .eq('id', userId);
            
        if (error) throw error;
        
        playScanSound('success');
        alert("Rol de usuario actualizado correctamente.");
        renderCajerosList();
    } catch (err) {
        console.error("Error updating role:", err);
        alert("Error al actualizar rol: " + err.message);
        renderCajerosList();
    }
};

window.deleteCajero = async function(userId) {
    if (!supabaseInitialized || currentUserRole !== 'superadmin') return;
    
    if (confirm("¿Estás seguro de que deseas eliminar este usuario del sistema? Se eliminará de la base de datos y de la autenticación.")) {
        try {
            if (supabaseAdmin) {
                const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
                if (authError) throw authError;
            } else {
                const { error: dbError } = await supabaseClient
                    .from('user_profiles')
                    .delete()
                    .eq('id', userId);
                if (dbError) throw dbError;
            }
            
            playScanSound('fail');
            alert("Usuario eliminado correctamente.");
            renderCajerosList();
        } catch (err) {
            console.error("Error deleting cashier:", err);
            alert("Error al eliminar cajero: " + err.message);
            renderCajerosList();
        }
    }
};

function setupCajeroRegistration() {
    const form = document.getElementById('new-cajero-form');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!supabaseInitialized || currentUserRole !== 'superadmin') {
            alert("Acción no permitida.");
            return;
        }
        
        const firstName = document.getElementById('cajero-first-name').value.trim();
        const lastName = document.getElementById('cajero-last-name').value.trim();
        const dni = document.getElementById('cajero-dni').value.trim();
        const email = document.getElementById('cajero-email').value.trim();
        const password = document.getElementById('cajero-password').value;
        
        if (password.length < 6) {
            alert("La contraseña debe tener al menos 6 caracteres.");
            return;
        }
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const origHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i data-lucide="loader" class="animate-spin" style="animation: spin 1s linear infinite;"></i> Registrando...`;
        if (window.lucide) lucide.createIcons();
        
        try {
            if (!supabaseAdmin) {
                throw new Error("Cliente administrador de Supabase no inicializado (verifica la Service Role Key).");
            }
            
            const { data, error } = await supabaseAdmin.auth.admin.createUser({
                email: email,
                password: password,
                email_confirm: true,
                user_metadata: {
                    first_name: firstName,
                    last_name: lastName,
                    dni: dni
                }
            });
            
            if (error) throw error;
            
            const newUserId = data.user.id;
            const { error: profileError } = await supabaseClient
                .from('user_profiles')
                .update({ role: 'admin', store_id: myStoreId })
                .eq('id', newUserId);
                
            if (profileError) throw profileError;
            
            playScanSound('success');
            alert(`Cajero ${firstName} ${lastName} registrado con éxito.`);
            form.reset();
            renderCajerosList();
        } catch (err) {
            console.error("Error creating cashier:", err);
            alert("Error al registrar cajero: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origHtml;
            if (window.lucide) lucide.createIcons();
        }
    });
}

/* ==========================================================================
   10. SAAS GLOBAL ADMIN CONTROLLERS
   ========================================================================== */
async function loadSaasStores() {
    if (!supabaseInitialized || currentUserRole !== 'saas_admin') return;

    const tbody = document.getElementById('saas-stores-table-body');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center text-muted" style="padding: 20px;">
                <i data-lucide="loader" class="animate-spin" style="animation: spin 1s linear infinite;"></i> Cargando empresas...
            </td>
        </tr>
    `;
    if (window.lucide) lucide.createIcons();

    try {
        const { data: stores, error } = await supabaseClient
            .from('stores')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!stores || stores.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted" style="padding: 20px;">
                        No hay empresas registradas en la plataforma.
                    </td>
                </tr>
            `;
            return;
        }

        let rowsHtml = '';
        stores.forEach(s => {
            rowsHtml += `
                <tr>
                    <td style="font-family: monospace; font-size: 12px;" class="text-muted">${s.id}</td>
                    <td style="font-weight: 600;">${s.name}</td>
                    <td>${new Date(s.created_at).toLocaleDateString('es-ES')}</td>
                    <td class="text-center">
                        <button class="btn btn-secondary btn-icon-only" onclick="navigator.clipboard.writeText('${s.id}')" title="Copiar ID" style="width: 28px; height: 28px;">
                            <i data-lucide="copy" style="width:12px; height:12px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = rowsHtml;
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error("Error loading stores:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-danger" style="padding: 20px;">
                    Error al cargar empresas: ${err.message}
                </td>
            </tr>
        `;
    }
}

window.createNewSaasStore = async function() {
    if (!supabaseInitialized || currentUserRole !== 'saas_admin') return;

    const storeName = document.getElementById('saas-store-name').value.trim();
    if (!storeName) {
        alert("El nombre comercial es requerido.");
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('stores')
            .insert([{ name: storeName }])
            .select();

        if (error) throw error;

        playScanSound('success');
        alert("Empresa creada exitosamente. El ID se mostrará en la tabla.");
        document.getElementById('saas-new-store-form').reset();
        closeModal('modal-saas-store');
        loadSaasStores();
    } catch (err) {
        console.error("Error creating store:", err);
        alert("Error al crear empresa: " + err.message);
    }
};
