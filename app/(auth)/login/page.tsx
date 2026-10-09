"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Shield } from "lucide-react";

function getLoginErrorMessage(error?: string) {
  if (!error) {
    return "Logowanie nie powiodło się";
  }

  if (error === "CredentialsSignin" || error === "Configuration") {
    return "Nieprawidłowy e-mail lub hasło";
  }

  return error;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn("credentials", { email, password, redirect: false });

      if (result?.error) {
        toast.error(getLoginErrorMessage(result.error));
      } else if (result?.ok) {
        toast.success("Zalogowano pomyślnie");
        router.push("/");
        router.refresh();
      }
    } catch (error) {
      toast.error("Błąd podczas logowania");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <span
          className="mark"
          style={{
            width: 46,
            height: 46,
            borderRadius: 15,
            background:
              "linear-gradient(180deg, var(--accent), color-mix(in oklch, var(--accent) 82%, oklch(74% 0.12 105)))",
            color: "var(--accent-ink)",
            display: "grid",
            placeItems: "center",
            flex: "none",
            boxShadow: "0 10px 24px -10px var(--accent)",
          }}
        >
          <Shield size={24} />
        </span>
        <span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, letterSpacing: "-0.02em", display: "block", lineHeight: 1.1 }}>
            Bezpieczne Miasto
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginTop: 4,
              display: "block",
            }}
          >
            Panel Operacyjny
          </span>
        </span>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", margin: "0 0 6px" }}>
        Zaloguj się
      </h1>
      <p className="hintline" style={{ marginBottom: 24 }}>
        Dostęp do panelu administracyjnego i rejestru zgłoszeń.
      </p>

      <form onSubmit={handleSubmit} className="stack" style={{ gap: 16 }}>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            className="input"
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={isLoading}
            autoComplete="username"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Hasło</label>
          <input
            id="password"
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={isLoading}
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ width: "100%" }}>
          {isLoading ? "Logowanie…" : "Zaloguj się"}
        </button>
      </form>

      <div
        style={{
          marginTop: 22,
          padding: "14px 16px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--hairline)",
          background: "var(--surface-2)",
          fontSize: 12.5,
          color: "var(--muted)",
        }}
      >
        <div style={{ fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>
          Dane demonstracyjne
        </div>
        <div className="mono">admin@powiat.pl</div>
        <div className="mono">password123</div>
      </div>
    </div>
  );
}
