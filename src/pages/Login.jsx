import React, { useState } from "react";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");

  async function handle(e) {
    e.preventDefault();
    setMsg("");

    try {
      if (mode === "login") {
        const r = await signInWithEmailAndPassword(auth, email, pass);
        onLogin?.(r.user);
      } else {
        const r = await createUserWithEmailAndPassword(auth, email, pass);
        onLogin?.(r.user);
      }
    } catch (err) {
      console.error("AUTH ERROR:", err);
      setMsg(`${err.code || "erro"} — ${err.message || "sem mensagem"}`);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b1220", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 460, background: "#fff", borderRadius: 14, padding: 18 }}>
        <h2>{mode === "login" ? "Entrar" : "Criar conta"}</h2>

        <form onSubmit={handle} style={{ display: "grid", gap: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
          />
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="senha (mín. 6)"
            type="password"
          />

          {msg && <div style={{ color: "red" }}>{msg}</div>}

          <button type="submit">
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>

          <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Criar conta" : "Já tenho conta"}
          </button>
        </form>
      </div>
    </div>
  );
}
