import React, { useMemo, useState } from "react";
import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";

function traduzErroFirebase(code) {
  const map = {
    "auth/invalid-api-key": "API KEY inválida. Verifique o firebaseConfig (apiKey).",
    "auth/unauthorized-domain": "Domínio não autorizado no Firebase. Adicione seu domínio do Vercel em Authentication > Settings > Authorized domains.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "Credencial inválida (email/senha incorretos ou usuário removido).",
    "auth/email-already-in-use": "Este e-mail já está em uso.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "Senha fraca (mínimo 6 caracteres).",
  };
  return map[code] || `Erro: ${code}`;
}

function humanizeAuthError(code) {
  const map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado (crie a conta primeiro).",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential":
      "Credenciais inválidas. Confira e-mail/senha. (Pode ser domínio não autorizado ou método desativado.)",
    "auth/email-already-in-use": "Esse e-mail já está em uso. Tente fazer login.",
    "auth/weak-password": "Senha fraca. Use pelo menos 6 caracteres.",
    "auth/operation-not-allowed":
      "Método de login não habilitado no Firebase. Ative 'E-mail/senha' em Authentication.",
    "auth/unauthorized-domain":
      "Domínio não autorizado. Adicione seu domínio da Vercel em Authentication > Settings > Authorized domains.",
    "auth/network-request-failed":
      "Falha de rede. Verifique internet / bloqueios do navegador.",
    "auth/too-many-requests":
      "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  };
  return map[code] || "Erro ao autenticar.";
}

export default function Login() {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && senha.length >= 6 && !loading;
  }, [email, senha, loading]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
      // se deu certo, o App deve trocar automaticamente pra tela principal pelo onAuthStateChanged
    } catch (err) {
      console.error("LOGIN ERROR:", err);
      const code = err?.code || "";
      alert(
        `${humanizeAuthError(code)}\n\nCódigo: ${code}\nMensagem: ${err?.message || ""}`
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), senha);
      // sucesso -> já loga automaticamente
    } catch (err) {
  console.error(err);
  setError(traduzErroFirebase(err.code));
}
      const code = err?.code || "";
      alert(
        `${humanizeAuthError(code)}\n\nCódigo: ${code}\nMensagem: ${err?.message || ""}`
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    const em = email.trim();
    if (!em) {
      alert("Digite seu e-mail no campo para enviar o reset.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, em);
      alert("Enviei um e-mail para redefinir sua senha. Verifique a caixa de entrada e o spam.");
    } catch (err) {
  console.error(err);
  setError(traduzErroFirebase(err.code));
}
      const code = err?.code || "";
      alert(
        `${humanizeAuthError(code)}\n\nCódigo: ${code}\nMensagem: ${err?.message || ""}`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <div style={styles.logoCircle}>💰</div>
          <div>
            <div style={styles.appName}>Minhas Finanças</div>
            <div style={styles.subtitle}>
              {mode === "login" ? "Entrar" : "Criar conta"}
            </div>
          </div>
        </div>

        <form onSubmit={mode === "login" ? handleLogin : handleRegister} style={styles.form}>
          <label style={styles.label}>E-mail</label>
          <input
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seuemail@gmail.com"
            type="email"
            autoComplete="email"
          />

          <label style={styles.label}>Senha (mínimo 6)</label>
          <input
            style={styles.input}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          <button
            type="submit"
            disabled={!canSubmit}
            style={{ ...styles.button, opacity: canSubmit ? 1 : 0.6 }}
          >
            {loading
              ? "Aguarde..."
              : mode === "login"
              ? "Entrar"
              : "Criar conta"}
          </button>

          <div style={styles.rowBetween}>
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              style={styles.linkBtn}
              disabled={loading}
            >
              {mode === "login"
                ? "Criar conta"
                : "Já tenho conta"}
            </button>

            <button
              type="button"
              onClick={handleResetPassword}
              style={styles.linkBtn}
              disabled={loading}
            >
              Esqueci a senha
            </button>
          </div>

          <div style={styles.tip}>
            Se aparecer “domínio não autorizado”, você precisa liberar seu domínio da Vercel em:
            <br />
            <b>Firebase → Authentication → Settings → Authorized domains</b>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#0b1220",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#ffffff",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 18px 50px rgba(0,0,0,0.30)",
    border: "1px solid #e6eaf2",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  logoCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "#1d4ed8",
    color: "white",
    fontSize: 22,
  },
  appName: { fontWeight: 1000, fontSize: 18, color: "#0b1b2b" },
  subtitle: { fontWeight: 800, fontSize: 13, color: "#64748b", marginTop: 2 },
  form: { display: "grid", gap: 10, marginTop: 10 },
  label: { fontSize: 12, fontWeight: 900, color: "#475569" },
  input: {
    height: 42,
    borderRadius: 12,
    border: "1px solid #dbe3f0",
    padding: "0 12px",
    outline: "none",
    fontSize: 14,
  },
  button: {
    height: 44,
    borderRadius: 12,
    border: 0,
    background: "#2563eb",
    color: "white",
    fontWeight: 1000,
    cursor: "pointer",
    marginTop: 6,
  },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  linkBtn: {
    background: "transparent",
    border: 0,
    color: "#1d4ed8",
    fontWeight: 900,
    cursor: "pointer",
    padding: 0,
  },
  tip: {
    marginTop: 10,
    background: "#f8fafc",
    border: "1px solid #e6eaf2",
    borderRadius: 12,
    padding: 10,
    color: "#475569",
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 700,
  },
};