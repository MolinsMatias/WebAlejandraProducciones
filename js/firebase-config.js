// SDKs de Firebase version modular 9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Tu configuración de Firebase va aquí.
// REEMPLAZAR ESTOS VALORES por los del proyecto Firebase real
const firebaseConfig = {
  apiKey: "AIzaSyAnHYE0UuBtJdva9NxG-x_RgVQ4A2KM-v0",
  authDomain: "alejandra-producciones-f7e4c.firebaseapp.com",
  projectId: "alejandra-producciones-f7e4c",
  storageBucket: "alejandra-producciones-f7e4c.firebasestorage.app",
  messagingSenderId: "160930970904",
  appId: "1:160930970904:web:ca8065bd4a846240eaf26d",
  measurementId: "G-68VR9CXTXB"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
