// src/firebase.js
import { initializeApp, getApps } from "firebase/app";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

import {
  getFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";

// ✅ MUDE ESSE TEXTO SEMPRE QUE VOCÊ QUISER TESTAR SE ATUALIZOU NA VERCEL
export const BUILD_TAG = "BUILD_2026-01-13_A";

// ✅ SEU CONFIG (fixo)
export const firebaseConfig = {
  apiKey: "AIzaSyDp3edNnevPlGmIKTYFEBfCVztrwcQDRnE",
  authDomain: "assistente---controlefinan.firebaseapp.com",
  projectId: "assistente---controlefinan",
  storageBucket: "assistente---controlefinan.firebasestorage.app",
  messagingSenderId: "448399185816",
  appId: "1:448399185816:web:777e2a810af9b98cdb7ded",
};

// 🛑 TRAVA: se estiver inválido, vamos ver na cara
if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("COLE")) {
  throw new Error("FIREBASE CONFIG INVÁLIDO: apiKey vazio/placeholder");
}

// Evita inicializar duas vezes
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence error:", err);
});

export const db = getFirestore(app);
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore persistence error:", err.code || err);
});
