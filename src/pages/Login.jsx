// src/pages/Login.jsx
import React, { useState } from "react";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import logo from "../assets/logo.png";

export default function Login({ onRegister }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setMsg("");

    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      console.error("AUTH ERROR:", err);
      setMsg("E-mail ou senha inválidos.");
    }
  }

  async function handleReset() {
    setMsg("");

    if (!email) {
      setMsg("Informe seu e-mail acima para recuperar a senha.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setMsg("📧 Link de recuperação enviado para seu e-mail.");
    } catch (err) {
      console.error("RESET ERROR:", err);
      setMsg("Erro ao enviar e-mail de recuperação.");
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
        background: "linear-gradient(135deg, #0b1220 0%, #0f1b35 60%, #0b1220 100%)",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          padding: "28px 26px 26px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.35)",
        }}
      >
        {/* LOGO */}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <img
            src={logo}
            alt="Logo"
            style={{ width: 160, marginBottom: 8 }}
          />
        </div>

        <h2 style={{ textAlign: "center", marginBottom: 20, color: "#0b1220" }}>
          Entrar
        </h2>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            type="email"
            required
            style={{
              height: 44,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              padding: "0 14px",
              fontSize: 15,
            }}
          />

          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Senha"
            type="password"
            required
            style={{
              height: 44,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              padding: "0 14px",
              fontSize: 15,
            }}
          />

          {/* ESQUECI MINHA SENHA */}
          <div style={{ textAlign: "right", marginTop: -6 }}>
            <button
              type="button"
              onClick={handleReset}
              style={{
                background: "transparent",
                border: 0,
                color: "#2563eb",
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
                fontSize: 14,
              }}
            >
              Esqueci minha senha
            </button>
          </div>

          {msg && (
            <div
              style={{
                background: "#eef2ff",
                border: "1px solid #c7d2fe",
                padding: 10,
                borderRadius: 10,
                color: "#1e3a8a",
                fontSize: 14,
                textAlign: "center",
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
              fontSize: 16,
              cursor: "pointer",
              marginTop: 6,
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
              fontWeight: 800,
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
