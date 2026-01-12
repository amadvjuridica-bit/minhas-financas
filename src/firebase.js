import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDp3edNnevPlGmIKTYFEBfCVztrwcQDRnE",
  authDomain: "assistente---controlefinan.firebaseapp.com",
  projectId: "assistente---controlefinan",
  storageBucket: "assistente---controlefinan.firebasestorage.app",
  messagingSenderId: "448399185816",
  appId: "1:448399185816:web:777e2a810af9b98cdb7ded"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// mantém login após F5
setPersistence(auth, browserLocalPersistence).catch(console.error);

// cache offline Firestore
enableIndexedDbPersistence(db).catch(() => {});
