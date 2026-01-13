// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDp3edNnevPlGmIKTYFEBfCVztrwcQDRnE",
  authDomain: "assistente---controlefinan.firebaseapp.com",
  projectId: "assistente---controlefinan",
  storageBucket: "assistente---controlefinan.appspot.com",
  messagingSenderId: "448399185816",
  appId: "1:448399185816:web:777e2a810af9b98cdb7ded",
  measurementId: "G-D28XWKCG72",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence error:", err?.code || err);
});

export const db = getFirestore(app);
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore persistence not enabled:", err?.code || err);
});
