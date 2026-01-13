// src/pages/Login.jsx
import React, { useState } from "react";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
} from "firebase/auth";

import logo from "../assets/logo.png";

export default function Login({ onRegister }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");

  async function handle(e) {
    e.preventDefault();
    setMsg("");

    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      console.error("AUTH ERROR:", err);
      setMsg(`${err?.code || "erro"} — ${err?.message || "sem mensagem"}`);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "linear-gradient(135deg, #0b1220 0%, #0f1b35 60%, #0b1220 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          padding: 22,
          boxShadow: "0 30px 80px rgba(0,0,0,.35)",
        }}
      >
        {/* LOGO CENTRALIZADA */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <img
            src={logo}
            alt="Logo"
            style={{
              height: 56,
              width: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>

        <h2 style={{ margin: 0, textAlign: "center", marginBottom: 14 }}>Entrar</h2>

        <form onSubmit={handle} style={{ display: "grid", gap: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            autoComplete="email"
            style={{
              height: 42,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              padding: "0 12px",
            }}
          />

          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="senha (mín. 6)"
            type="password"
            autoComplete="current-password"
            style={{
              height: 42,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              padding: "0 12px",
            }}
          />

          {msg && (
            <div
              style={{
                background: "#fee2e2",
                border: "1px solid #fecaca",
                padding: 10,
                borderRadius: 10,
                color: "#991b1b",
                fontSize: 13,
              }}
            >
              {msg}
            </div>
          )}

          <button
            type="submit"
            style={{
              height: 44,
              borderRadius: 12,
              border: 0,
              background: "#2563eb",
              color: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Entrar
          </button>

          <button
            type="button"
            onClick={onRegister}
            style={{
              height: 40,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              background: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Criar conta
          </button>
        </form>
      </div>
    </div>
  );
}
