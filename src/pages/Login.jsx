import React, { useState } from "react";
import { auth, BUILD_TAG, firebaseConfig } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";

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
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b1220", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 460, background: "#fff", borderRadius: 14, padding: 18 }}>
        <h2 style={{ margin: 0, marginBottom: 10 }}>
          {mode === "login" ? "Entrar" : "Criar conta"}
        </h2>

        {/* ✅ PAINEL DE DEBUG (isso vai matar a dúvida em 10s) */}
        <div style={{ background: "#f1f5f9", borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 12 }}>
          <div><b>BUILD_TAG:</b> {BUILD_TAG}</div>
          <div><b>Origin:</b> {typeof window !== "undefined" ? window.location.origin : "-"}</div>
          <div><b>projectId:</b> {firebaseConfig.projectId}</div>
          <div><b>authDomain:</b> {firebaseConfig.authDomain}</div>
          <div>
            <b>apiKey (início):</b>{" "}
            {firebaseConfig.apiKey ? firebaseConfig.apiKey.slice(0, 8) + "..." : "VAZIO"}
          </div>
        </div>

        <form onSubmit={handle} style={{ display: "grid", gap: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            style={{ height: 42, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 12px" }}
          />
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="senha (mín. 6)"
            type="password"
            style={{ height: 42, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 12px" }}
          />

          {msg && (
            <div style={{ background: "#fee2e2", border: "1px solid #fecaca", padding: 10, borderRadius: 10, color: "#991b1b" }}>
              {msg}
            </div>
          )}

          <button type="submit" style={{ height: 44, borderRadius: 12, border: 0, background: "#2563eb", color: "#fff", fontWeight: 900 }}>
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            style={{ height: 38, borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 900 }}
          >
            {mode === "login" ? "Não tem conta? Criar" : "Já tem conta? Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
