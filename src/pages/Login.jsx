import React, { useState } from "react";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";

import logo from "../assets/logo.png"; // ✅ logo aqui

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");

  async function handle(e) {
    e.preventDefault();
    setMsg("");

    try {
      const r =
        mode === "login"
          ? await signInWithEmailAndPassword(auth, email, pass)
          : await createUserWithEmailAndPassword(auth, email, pass);

      onLogin?.(r.user);
    } catch (err) {
      setMsg("E-mail ou senha inválidos.");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* LOGO */}
        <img src={logo} alt="Logo" style={styles.logo} />

        <h2 style={styles.title}>
          {mode === "login" ? "Entrar" : "Criar conta"}
        </h2>

        <form onSubmit={handle} style={styles.form}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            type="email"
            required
            style={styles.input}
          />

          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Senha (mín. 6)"
            type="password"
            required
            style={styles.input}
          />

          {msg && <div style={styles.error}>{msg}</div>}

          <button type="submit" style={styles.primaryBtn}>
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>

          <button
            type="button"
            onClick={() =>
              setMode(mode === "login" ? "signup" : "login")
            }
            style={styles.linkBtn}
          >
            {mode === "login"
              ? "Não tem conta? Criar"
              : "Já tem conta? Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ================= STYLES ================= */

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0b1220, #111827)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#ffffff",
    borderRadius: 16,
    padding: "32px 28px",
    boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
    textAlign: "center",
  },
  logo: {
    width: 140,
    margin: "0 auto 20px",
    display: "block",
  },
  title: {
    marginBottom: 20,
    color: "#111827",
  },
  form: {
    display: "grid",
    gap: 12,
  },
  input: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #d1d5db",
    padding: "0 14px",
    fontSize: 14,
  },
  primaryBtn: {
    height: 46,
    borderRadius: 12,
    border: 0,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  linkBtn: {
    marginTop: 6,
    background: "transparent",
    border: 0,
    color: "#2563eb",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    background: "#fee2e2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    padding: 10,
    borderRadius: 10,
    fontSize: 13,
  },
};
