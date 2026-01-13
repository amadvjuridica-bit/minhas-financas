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

// ✅ SUA CONFIG (tem que ser EXATAMENTE apiKey com K MAIÚSCULO)
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

export const auth = getAuth(app);
export const db = getFirestore(app);

// ✅ Mantém login após F5
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence error:", err);
});

// ✅ Cache offline (mesmo sem internet) + sincroniza depois
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore persistence not enabled:", err?.code || err);
});