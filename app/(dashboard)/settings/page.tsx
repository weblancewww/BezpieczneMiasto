"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organization: {
    name: string;
  };
};

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: "",
    currentPassword: "",
    newPassword: "",
  });
  const [smtpTestRecipient, setSmtpTestRecipient] = useState("");

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const response = await fetch("/api/users/me", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Nie udało się pobrać profilu użytkownika");
        }

        const data = (await response.json()) as CurrentUser;

        if (!active) {
          return;
        }

        setUser(data);
        setProfileForm((current) => ({ ...current, name: data.name }));
        setSmtpTestRecipient(data.email);
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Błąd ładowania");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProfile(true);

    try {
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się zapisać profilu");
      }

      setUser(result.user);
      setProfileForm({ name: result.user.name, currentPassword: "", newPassword: "" });
      toast.success("Profil został zaktualizowany");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd zapisu");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function testSmtp() {
    setIsTestingSmtp(true);

    try {
      const response = await fetch("/api/settings/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: smtpTestRecipient }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się wysłać testu SMTP");
      }

      toast.success("Wysłano wiadomość testową SMTP");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd testu SMTP");
    } finally {
      setIsTestingSmtp(false);
    }
  }

  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-head">
          <h2>Profil administratora</h2>
        </div>
        <div className="card-body">
          <form onSubmit={saveProfile} className="stack" style={{ gap: 16 }}>
            <div className="field">
              <label htmlFor="profile-name">Imię i nazwisko</label>
              <input
                id="profile-name"
                className="input"
                value={profileForm.name}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, name: event.target.value }))
                }
                disabled={isLoading}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="profile-email">Adres e-mail</label>
              <input
                id="profile-email"
                className="input"
                value={user?.email ?? ""}
                readOnly
                disabled
              />
            </div>
            <hr className="rule" />
            <div className="field">
              <label htmlFor="profile-current-password">Aktualne hasło</label>
              <input
                id="profile-current-password"
                className="input"
                type="password"
                placeholder="••••••••"
                value={profileForm.currentPassword}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, currentPassword: event.target.value }))
                }
                disabled={isLoading}
              />
            </div>
            <div className="field">
              <label htmlFor="profile-new-password">Nowe hasło</label>
              <input
                id="profile-new-password"
                className="input"
                type="password"
                placeholder="••••••••"
                value={profileForm.newPassword}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, newPassword: event.target.value }))
                }
                disabled={isLoading}
              />
              <span className="hintline">
                Pozostaw puste, jeśli nie chcesz zmieniać hasła.
              </span>
            </div>
            <div className="inline justify-end">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || isSavingProfile}
              >
                {isSavingProfile ? "Zapisywanie…" : "Zapisz profil"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Konfiguracja SMTP</h2>
        </div>
        <div className="card-body">
          <div className="stack" style={{ gap: 16 }}>
            <p className="hintline">
              Test opiera się na aktualnych zmiennych środowiskowych SMTP aplikacji.
            </p>
            <div className="field">
              <label htmlFor="smtp-test-recipient">Adres testowy</label>
              <input
                id="smtp-test-recipient"
                className="input"
                type="email"
                placeholder="adres@example.com"
                value={smtpTestRecipient}
                onChange={(event) => setSmtpTestRecipient(event.target.value)}
                required
              />
            </div>
            <div className="inline justify-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={testSmtp}
                disabled={isTestingSmtp || !smtpTestRecipient}
              >
                {isTestingSmtp ? "Wysyłanie…" : "Wyślij test SMTP"}
              </button>
            </div>
            <div
              style={{
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--bg)",
                fontSize: 12.5,
                color: "var(--muted)",
              }}
            >
              <strong style={{ color: "var(--fg)" }}>Organizacja: </strong>
              {user?.organization?.name ?? "—"}
              <br />
              <strong style={{ color: "var(--fg)" }}>Rola: </strong>
              {user?.role ?? "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
