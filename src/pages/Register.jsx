import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import logo from "../assets/logo.svg";

export default function Register({ onBack }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");

  async function criarConta(e) {
    e.preventDefault();
    setError("");

    try {
      await createUserWithEmailAndPassword(auth, email, senha);
      onBack(); // volta para login após criar conta
  } catch (err) {
  console.log(err);
  setError(err.message);
}
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src={logo} alt="Minhas Finanças" style={styles.logo} />
        <h2>Criar conta</h2>

        <form onSubmit={criarConta} style={styles.form}>
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

          {error && <div style={styles.error}>{error}</div>}

          <button style={styles.button}>Criar conta</button>
        </form>

        <p style={styles.footer}>
          Já tem conta?{" "}
          <span style={styles.link} onClick={onBack}>
            Entrar
          </span>
        </p>
      </div>
    </div>
  );
}

/* ================== ESTILOS ================== */
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
    width: 360,
    background: "#fff",
    padding: 30,
    borderRadius: 12,
    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
    textAlign: "center",
  },
  logo: {
    width: 64,
    marginBottom: 10,
  },
  form: {
    display: "grid",
    gap: 12,
    marginTop: 15,
  },
  input: {
    padding: 12,
    borderRadius: 8,
    border: "1px solid #cfd8ff",
    fontSize: 14,
  },
  button: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: "bold",
    cursor: "pointer",
  },
  footer: {
    marginTop: 15,
    fontSize: 14,
  },
  link: {
    color: "#2563eb",
    cursor: "pointer",
    fontWeight: "bold",
  },
  error: {
    color: "red",
    fontSize: 13,
  },
};