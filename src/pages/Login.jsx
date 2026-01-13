// src/pages/Login.jsx
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
      setMsg(`${err?.code || "erro"} — ${err?.message || "sem mensagem"}`);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src={logo} alt="Logo" style={styles.logo} />

        <h2 style={styles.title}>Entrar</h2>

        <form onSubmit={handle} style={styles.form}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            style={styles.input}
          />
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            type="password"
            placeholder="Senha"
            style={styles.input}
          />

          {msg && <div style={styles.error}>{msg}</div>}

          <button type="submit" style={styles.primaryBtn}>
            Entrar
          </button>

          <button type="button" onClick={onRegister} style={styles.secondaryBtn}>
            Criar conta
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    position: "fixed",
    inset: 0,
    width: "100vw",
    height: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 16,
    background: "linear-gradient(135deg, #0b1220 0%, #0f1b35 60%, #0b1220 100%)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 20px 50px rgba(0,0,0,.30)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  logo: {
    width: 150,
    height: "auto",
    marginBottom: 14,
    display: "block",
  },
  title: { margin: 0, marginBottom: 16 },
  form: { width: "100%", display: "grid", gap: 12 },
  input: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: "0 12px",
    fontSize: 14,
    outline: "none",
  },
  primaryBtn: {
    height: 44,
    borderRadius: 12,
    border: 0,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryBtn: {
    height: 40,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  error: {
    background: "#fee2e2",
    border: "1px solid #fecaca",
    padding: 10,
    borderRadius: 10,
    color: "#991b1b",
    fontSize: 13,
    textAlign: "center",
  },
};
