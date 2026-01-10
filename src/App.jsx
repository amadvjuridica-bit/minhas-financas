import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

import Login from "./pages/Login";
import Register from "./pages/Register";
import FinanceApp from "./FinanceApp";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("login"); // login | register

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div style={{ textAlign: "center", marginTop: 50 }}>Carregando...</div>;
  }

  // Usuário logado → Dashboard
  if (user) {
    return <FinanceApp />;
  }

  // Usuário não logado
  if (screen === "register") {
    return <Register onBack={() => setScreen("login")} />;
  }

  return <Login onRegister={() => setScreen("register")} />;
}