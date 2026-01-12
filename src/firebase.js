import { initializeApp } from "firebase/app";

import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// ✅ SUA CONFIG DO FIREBASE (já preenchida)
const firebaseConfig = {
  apiKey: "AIzaSyDp3edNnevPlGmIKTYFEBfCVztrwcQDRnE",
  authDomain: "assistente---controlefinan.firebaseapp.com",
  projectId: "assistente---controlefinan",
  storageBucket: "assistente---controlefinan.firebasestorage.app",
  messagingSenderId: "448399185816",
  appId: "1:448399185816:web:777e2a810af9b98cdb7ded",
};

const app = initializeApp(firebaseConfig);

// Auth + Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

// ✅ Mantém login mesmo após F5/fechar navegador
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence error:", err);
});

// ✅ Cache local do Firestore (não perde dados offline / sincroniza depois)
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore persistence not enabled:", err?.code || err);
});
