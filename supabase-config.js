// DHMotopartes - Configuración de Supabase (SaaS)
// Reemplaza los valores de abajo con las credenciales oficiales de tu proyecto de Supabase.

const supabaseUrl = "https://wkgxssfbzgahkztdjzmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrZ3hzc2ZiemdhaGt6dGRqem1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzI4MjcsImV4cCI6MjA5NjA0ODgyN30.BNlE6dOMlbMlERR7ri4c4QIKqVXCJPHcZviTNunku44";

let supabaseClient = null;
let supabaseInitialized = false;

if (supabaseUrl && supabaseUrl !== "TU_SUPABASE_URL_AQUI" && supabaseKey && supabaseKey !== "TU_SUPABASE_ANON_KEY_AQUI") {
    try {
        supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
        supabaseInitialized = true;
        console.log("Supabase inicializado con éxito.");
    } catch (error) {
        console.error("Error al inicializar Supabase:", error);
    }
} else {
    console.warn("Supabase no está configurado aún. Usando LocalStorage/Demo como fallback en Modo Local.");
}
