// src/pages/Login.jsx
import React, { useState } from "react";
import { auth } from "../firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import logo from "../assets/logo.png";
import "./Login.css";

export default function Login({ onRegister }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      console.error("AUTH ERROR:", err);
      setMsg("E-mail ou senha inválidos.");
      setBusy(false);
    }
  }

  async function handleReset() {
    setMsg("");
    if (!email) return setMsg("Informe seu e-mail para recuperar a senha.");
    try {
      setBusy(true);
      await sendPasswordResetEmail(auth, email);
      setMsg("Link de recuperação enviado para seu e-mail.");
    } catch (err) {
      console.error("RESET ERROR:", err);
      setMsg("Erro ao enviar e-mail de recuperação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="loginBg">
      <div className="loginCard">
        {/* LOGO GRANDE (RETÂNGULO) */}
        <div className="logoBox">
          <img src={logo} alt="Logo" className="logoImg" />
        </div>

        <h1 className="title">Entrar</h1>

        <form onSubmit={handleLogin} className="form">
          <div className="field">
            <label className="label">E-mail</label>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              type="email"
              required
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label className="label">Senha</label>
            <input
              className="input"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              type="password"
              required
              autoComplete="current-password"
            />

            {/* ESQUECI SENHA (embaixo da senha, à direita) */}
            <button type="button" className="forgot" onClick={handleReset} disabled={busy}>
              Esqueci minha senha
            </button>
          </div>

          {msg && <div className="alert">{msg}</div>}

          <button type="submit" className="btnPrimary" disabled={busy}>
            {busy ? "Entrando..." : "Entrar"}
          </button>

          <button type="button" className="btnSecondary" onClick={onRegister} disabled={busy}>
            Criar conta
          </button>

          <div className="footerHint">Segurança • Simples • Rápido</div>
        </form>
      </div>
    </div>
  );
}
