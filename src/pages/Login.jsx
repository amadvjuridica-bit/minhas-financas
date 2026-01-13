import React, { useState } from "react";
import { auth } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
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
      setMsg(err.message);
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
        background: "linear-gradient(135deg, #0b1220, #0f1b35)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#ffffff",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 20px 40px rgba(0,0,0,.25)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* LOGO */}
        <img
          src={logo}
          alt="Logo"
          style={{
            width: 140,
            marginBottom: 20,
          }}
        />

        <h2 style={{ marginBottom: 16 }}>Entrar</h2>

        <form
          onSubmit={handle}
          style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            style={inputStyle}
          />

          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            type="password"
            placeholder="Senha"
            style={inputStyle}
          />

          {msg && (
            <div style={{ color: "red", fontSize: 13, textAlign: "center" }}>
              {msg}
            </div>
          )}

          <button style={primaryBtn}>Entrar</button>

          <button
            type="button"
            onClick={onRegister}
            style={secondaryBtn}
          >
            Criar conta
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  height: 44,
  borderRadius: 10,
  border: "1px solid #ccc",
  padding: "0 12px",
  fontSize: 14,
};

const primaryBtn = {
  height: 44,
  borderRadius: 12,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn = {
  height: 40,
  borderRadius: 12,
  border: "1px solid #ccc",
  background: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
