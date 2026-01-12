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

// ⚠️ IMPORTANTE: mantenha EXATAMENTE as chaves do seu projeto Firebase
// Se você já tem esse objeto no seu arquivo atual, pode reaproveitar.
// Se não tiver, copie do Firebase Console > Project settings > Your apps > Firebase SDK config.
const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// ✅ Mantém o login mesmo após F5/recarregar
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence error:", err);
});

// ✅ Cache offline do Firestore (segura dados e sincroniza quando voltar)
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore persistence not enabled:", err?.code || err);
});
