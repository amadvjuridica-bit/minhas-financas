import React, { useState } from "react";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";

// ✅ logo em src/assets/logo.png
import logo from "../assets/logo.png";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | signup
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
      setMsg(`${err?.code || "erro"} — ${err?.message || "sem mensagem"}`);
    }
  }

  return (
    // ✅ TRAVA: ocupa a tela toda e IGNORA qualquer layout pai (sidebar, flex, etc)
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(1200px 800px at 20% 20%, #111b33 0%, #070b14 55%, #050712 100%)",
        padding: 16,
        zIndex: 999999,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "rgba(255,255,255,0.98)",
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          border: "1px solid rgba(148,163,184,0.25)",
        }}
      >
        {/* ✅ LOGO CENTRAL */}
        <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}>
          <img
            src={logo}
            alt="Minhas Finanças"
            style={{ width: 86, height: 86, objectFit: "contain" }}
            onError={(e) => {
              console.error("ERRO ao carregar logo:", e);
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

        <h2 style={{ margin: 0, textAlign: "center", marginBottom: 14, fontSize: 22 }}>
          {mode === "login" ? "Entrar" : "Criar conta"}
        </h2>

        <form onSubmit={handle} style={{ display: "grid", gap: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            autoComplete="email"
            style={{
              height: 44,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              padding: "0 12px",
              outline: "none",
            }}
          />
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="senha (mín. 6)"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            style={{
              height: 44,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              padding: "0 12px",
              outline: "none",
            }}
          />

          {msg && (
            <div
              style={{
                background: "#fee2e2",
                border: "1px solid #fecaca",
                padding: 10,
                borderRadius: 12,
                color: "#991b1b",
                fontSize: 13,
                lineHeight: 1.25,
              }}
            >
              {msg}
            </div>
          )}

          <button
            type="submit"
            style={{
              height: 46,
              borderRadius: 12,
              border: 0,
              background: "#2563eb",
              color: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            style={{
              height: 42,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              background: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {mode === "login" ? "Não tem conta? Criar" : "Já tem conta? Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
