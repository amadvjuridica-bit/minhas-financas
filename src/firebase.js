// src/firebase.js
import { initializeApp } from "firebase/app";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

import {
  getFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";

// ✅ Config FIXA (sem .env) — evita apiKey undefined / “api-key-not-valid”
const firebaseConfig = {
  apiKey: "AIzaSyDp3edNnevPlGmIKTYFEBfCVztrwcQDRnE",
  authDomain: "assistente---controlefinan.firebaseapp.com",
  projectId: "assistente---controlefinan",
  storageBucket: "assistente---controlefinan.firebasestorage.app",
  messagingSenderId: "448399185816",
  appId: "1:448399185816:web:777e2a810af9b98cdb7ded",
  measurementId: "G-D28XWKCG72",
};

const app = initializeApp(firebaseConfig);

// Auth
export const auth = getAuth(app);

// ✅ Mantém login após F5/recarregar
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence error:", err?.code || err);
});

// Firestore
export const db = getFirestore(app);

// ✅ Cache offline do Firestore (salva local e sincroniza com a nuvem)
enableIndexedDbPersistence(db).catch((err) => {
  // Pode falhar se abrir em duas abas ao mesmo tempo (normal)
  console.warn("Firestore persistence not enabled:", err?.code || err);
});
