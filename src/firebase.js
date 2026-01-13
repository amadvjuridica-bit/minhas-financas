import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const BUILD_TAG = "BUILD_2026-01-13_FINAL";

export const firebaseConfig = {
  apiKey: "AIzaSyDp3edNnevPlGmIKTYFEBfCVztrwcQDRnE",
  authDomain: "assistente---controlefinan.firebaseapp.com",
  projectId: "assistente---controlefinan",
  storageBucket: "assistente---controlefinan.firebasestorage.app",
  messagingSenderId: "448399185816",
  appId: "1:448399185816:web:777e2a810af9b98cdb7ded",
};

// 🚨 TRAVA HARD
if (!firebaseConfig.apiKey || firebaseConfig.apiKey.length < 20) {
  throw new Error("🔥 API KEY DO FIREBASE INVÁLIDA EM RUNTIME");
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
