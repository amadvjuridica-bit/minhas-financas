import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import logo from "../assets/logo.svg";

export default function Login({ onRegister }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  async function entrar(e) {
    e.preventDefault();
    setErro("");

    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (err) {
      setErro("Email ou senha inválidos.");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src={logo} alt="Logo" style={styles.logo} />
        <h2 style={styles.title}>Entrar</h2>

        <form onSubmit={entrar} style={styles.form}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            style={styles.input}
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />

          {erro && <div style={styles.error}>{erro}</div>}

          <button style={styles.button} type="submit">
            Entrar
          </button>
        </form>

        <p style={styles.footer}>
          Não tem conta?{" "}
          <button
            type="button"
            onClick={() => {
              if (onRegister) onRegister();
              else alert("onRegister não está vindo do App.jsx");
            }}
            style={styles.linkBtn}
          >
            Criar conta
          </button>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
  minHeight: "100vh",
  width: "100vw",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "radial-gradient(circle at top, #0b1220 0%, #050810 70%)",
},
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 18,
    padding: "26px 26px 18px",
    boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
    textAlign: "center",
  },
  logo: { width: 58, height: 58, margin: "0 auto 10px", display: "block" },
  title: { margin: "6px 0 18px", fontSize: 22 },
  form: { display: "grid", gap: 10 },
  input: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #dbe3ff",
    padding: "0 12px",
    outline: "none",
    fontSize: 14,
  },
  button: {
    height: 42,
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
  },
  error: {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#9f1239",
    padding: "8px 10px",
    borderRadius: 10,
    fontSize: 13,
  },
  footer: { marginTop: 14, fontSize: 13, color: "#111827" },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: "#2563eb",
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
  },
};