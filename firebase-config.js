// DHMotopartes - Configuración de Firebase
// Reemplaza los valores de abajo con las credenciales oficiales de tu proyecto Firebase.

const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "TU_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://TU_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT_ID.appspot.com",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID"
};

// Inicializar Firebase (solo si la API Key no es el marcador de posición)
let dbRef = null;
let authRef = null;
let firebaseInitialized = false;

if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "TU_API_KEY_AQUI") {
    try {
        firebase.initializeApp(firebaseConfig);
        dbRef = firebase.database();
        authRef = firebase.auth();
        firebaseInitialized = true;
        console.log("Firebase inicializado con éxito.");
    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
    }
} else {
    console.warn("Firebase no está configurado aún. Usando LocalStorage/Demo como fallback.");
}
