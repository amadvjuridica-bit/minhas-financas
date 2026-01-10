import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDp3edNnevPlGmIKTYFEBfCVztrwcQDRnE",
  authDomain: "assistente---controlefinan.firebaseapp.com",
  projectId: "assistente---controlefinan",
  storageBucket: "assistente---controlefinan.firebasestorage.app",
  messagingSenderId: "448399185816",
  appId: "1:448399185816:web:dfc32c1ead92e39ddb7ded",
  measurementId: "G-LTKDEH7XP7",
};

const app = initializeApp(firebaseConfig);

// ✅ Auth
export const auth = getAuth(app);

// ✅ Firestore (DB)
export const db = getFirestore(app);

// (opcional) export default app se quiser usar depois
export default app;