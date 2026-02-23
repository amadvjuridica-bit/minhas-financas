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
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Inter, Arial" }}>
        Carregando...
      </div>
    );
  }

  if (user) return <FinanceApp />;

  if (screen === "register") {
    return <Register onBack={() => setScreen("login")} />;
  }

  return <Login onRegister={() => setScreen("register")} />;
}
