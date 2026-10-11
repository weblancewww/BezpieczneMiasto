"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
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

type SeedResult = {
  message: string;
  summary: {
    organizations: number;
    users: number;
    locations: number;
    reports: number;
    unassigned: number;
    statusHistory: number;
    uploadsCleared: boolean;
  };
  accounts: { email: string; label: string }[];
  password: string;
};

type SmtpForm = {
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

type SmtpResponse = {
  settings: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    hasPassword: boolean;
    fromEmail: string;
    fromName: string;
  };
  stored: boolean;
  sender: string | null;
  gap: string | null;
};

const EMPTY_SMTP_FORM: SmtpForm = {
  host: "",
  port: "587",
  secure: false,
  username: "",
  password: "",
  fromEmail: "",
  fromName: "",
};

/** Mapowanie odpowiedzi API na stan formularza (hasła celowo nie odsyłamy). */
function toSmtpForm(data: SmtpResponse): SmtpForm {
  return {
    host: data.settings.host,
    port: String(data.settings.port),
    secure: data.settings.secure,
    username: data.settings.username,
    password: "",
    fromEmail: data.settings.fromEmail,
    fromName: data.settings.fromName,
  };
}

export default function SettingsPage() {
  const { data: session } = useSession();

  /* Rolę do pokazania karty SEED bierzemy z sesji (JWT), a nie z /api/users/me.
     Po resecie konta powstają od nowa, więc zapytanie o profil zwraca 404 dla
     starej sesji — gdyby karta zależała od niego, przycisk znikałby dokładnie
     w momencie, w którym jest najbardziej potrzebny. */
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedModalOpen, setSeedModalOpen] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: "",
    currentPassword: "",
    newPassword: "",
  });

  const [smtpForm, setSmtpForm] = useState<SmtpForm>(EMPTY_SMTP_FORM);
  const [smtpInfo, setSmtpInfo] = useState<SmtpResponse | null>(null);
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);
  const [isVerifyingSmtp, setIsVerifyingSmtp] = useState(false);
  const [smtpTestRecipient, setSmtpTestRecipient] = useState("");

  /** Wczytuje zapisaną konfigurację poczty (tylko Super Admin). */
  async function loadSmtp() {
    try {
      const response = await fetch("/api/settings/smtp", { cache: "no-store" });
      if (!response.ok) return;

      const data = (await response.json()) as SmtpResponse;
      setSmtpInfo(data);
      setSmtpForm(toSmtpForm(data));
    } catch {
      // Brak konfiguracji nie jest błędem — formularz zostaje pusty.
    }
  }

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
        setProfileError(null);
      } catch (error) {
        if (active) {
          setProfileError(
            error instanceof Error ? error.message : "Błąd ładowania profilu"
          );
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

  /* Konfigurację poczty pobieramy dopiero, gdy wiemy, że użytkownik jest
     Super Adminem — dla pozostałych endpoint zwraca 403. */
  useEffect(() => {
    if (!isSuperAdmin) return;

    let active = true;

    async function bootstrapSmtp() {
      try {
        const response = await fetch("/api/settings/smtp", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as SmtpResponse;
        if (!active) return;

        setSmtpInfo(data);
        setSmtpForm(toSmtpForm(data));
      } catch {
        // Brak konfiguracji nie jest błędem — formularz zostaje pusty.
      }
    }

    void bootstrapSmtp();

    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

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

  async function saveSmtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingSmtp(true);

    try {
      const response = await fetch("/api/settings/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...smtpForm,
          port: Number(smtpForm.port),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się zapisać konfiguracji");
      }

      toast.success(result.message ?? "Konfiguracja poczty zapisana");
      await loadSmtp();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd zapisu");
    } finally {
      setIsSavingSmtp(false);
    }
  }

  async function testSmtp(mode: "verify" | "send") {
    if (mode === "verify") {
      setIsVerifyingSmtp(true);
    } else {
      setIsTestingSmtp(true);
    }

    try {
      const response = await fetch("/api/settings/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, to: smtpTestRecipient }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Test nie powiódł się");
      }

      toast.success(result.message ?? "Test zakończony powodzeniem");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd testu SMTP");
    } finally {
      setIsVerifyingSmtp(false);
      setIsTestingSmtp(false);
    }
  }

  async function applySeed() {
    setIsSeeding(true);

    try {
      const response = await fetch("/api/settings/seed", { method: "POST" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się przywrócić danych");
      }

      setSeedResult(result as SeedResult);
      toast.success((result as SeedResult).message);
    } catch (error) {
      setSeedModalOpen(false);
      toast.error(error instanceof Error ? error.message : "Błąd przywracania danych");
    } finally {
      setIsSeeding(false);
    }
  }

  return (
    <div className="stack">
      {profileError && !isLoading ? (
        <div
          className="card"
          style={{
            borderColor: "color-mix(in oklch, var(--danger) 30%, transparent)",
            background: "color-mix(in oklch, var(--danger) 10%, var(--surface))",
          }}
        >
          <div className="card-body">
            <div className="stack" style={{ gap: 10 }}>
              <span>
                <strong style={{ color: "var(--danger)" }}>{profileError}. </strong>
                {isSuperAdmin
                  ? "Konto tej sesji nie istnieje w bazie — najprawdopodobniej zostały przywrócone dane demonstracyjne. Możesz uruchomić SEED ponownie albo zalogować się od nowa."
                  : "Zaloguj się ponownie, aby kontynuować."}
              </span>
              <div className="inline">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  Przejdź do logowania
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
          <h2>Konfiguracja poczty (SMTP)</h2>
        </div>
        <div className="card-body">
          {isSuperAdmin ? (
            <form onSubmit={saveSmtp} className="stack" style={{ gap: 16 }}>
              <p className="hintline">
                Dane konta pocztowego, z którego aplikacja wysyła powiadomienia.
                Zapisują się w bazie, więc zmiana działa od razu — bez edycji plików
                i restartu.
              </p>

              {smtpInfo?.gap ? (
                <div
                  className="hintline"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)",
                    borderRadius: "var(--radius)",
                    background: "color-mix(in oklch, var(--danger) 10%, var(--bg))",
                  }}
                >
                  {smtpInfo.gap} — do tego czasu aplikacja nie wysyła poczty.
                </div>
              ) : null}

              <div className="grid-2" style={{ gap: 16 }}>
                <div className="field">
                  <label htmlFor="smtp-host">Serwer (host)</label>
                  <input
                    id="smtp-host"
                    className="input"
                    placeholder="s167.cyber-folks.pl"
                    value={smtpForm.host}
                    onChange={(event) =>
                      setSmtpForm((current) => ({ ...current, host: event.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="smtp-port">Port</label>
                  <input
                    id="smtp-port"
                    className="input"
                    type="number"
                    min={1}
                    max={65535}
                    placeholder="587"
                    value={smtpForm.port}
                    onChange={(event) =>
                      setSmtpForm((current) => ({ ...current, port: event.target.value }))
                    }
                  />
                  <span className="hintline">
                    465 = połączenie szyfrowane od razu, 587 = STARTTLS.
                  </span>
                </div>
              </div>

              <div className="field">
                <label htmlFor="smtp-username">Nazwa użytkownika</label>
                <input
                  id="smtp-username"
                  className="input"
                  autoComplete="off"
                  placeholder="devs@weblance.pl"
                  value={smtpForm.username}
                  onChange={(event) =>
                    setSmtpForm((current) => ({ ...current, username: event.target.value }))
                  }
                />
              </div>

              <div className="field">
                <label htmlFor="smtp-password">
                  Hasło{" "}
                  <span className="hintline">
                    {smtpInfo?.settings.hasPassword
                      ? "(zapisane — pozostaw puste, aby nie zmieniać)"
                      : "(brak)"}
                  </span>
                </label>
                <input
                  id="smtp-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  placeholder={smtpInfo?.settings.hasPassword ? "••••••••" : "Wpisz hasło"}
                  value={smtpForm.password}
                  onChange={(event) =>
                    setSmtpForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </div>

              <hr className="rule" />

              <div className="grid-2" style={{ gap: 16 }}>
                <div className="field">
                  <label htmlFor="smtp-from-email">Adres nadawcy</label>
                  <input
                    id="smtp-from-email"
                    className="input"
                    type="email"
                    placeholder="devs@weblance.pl"
                    value={smtpForm.fromEmail}
                    onChange={(event) =>
                      setSmtpForm((current) => ({ ...current, fromEmail: event.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="smtp-from-name">Nazwa nadawcy</label>
                  <input
                    id="smtp-from-name"
                    className="input"
                    placeholder="Bezpieczne Miasto"
                    value={smtpForm.fromName}
                    onChange={(event) =>
                      setSmtpForm((current) => ({ ...current, fromName: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="inline justify-end">
                <button type="submit" className="btn btn-primary" disabled={isSavingSmtp}>
                  {isSavingSmtp ? "Zapisywanie…" : "Zapisz konfigurację"}
                </button>
              </div>

              <hr className="rule" />

              <div className="field">
                <label htmlFor="smtp-test-recipient">Testowanie</label>
                <input
                  id="smtp-test-recipient"
                  className="input"
                  type="email"
                  placeholder="adres@example.com"
                  value={smtpTestRecipient}
                  onChange={(event) => setSmtpTestRecipient(event.target.value)}
                />
                <span className="hintline">
                  Najpierw sprawdź połączenie — to wychwytuje literówki w haśle bez
                  wysyłania wiadomości.
                </span>
              </div>

              <div className="inline justify-end" style={{ gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => testSmtp("verify")}
                  disabled={isVerifyingSmtp || isTestingSmtp}
                >
                  {isVerifyingSmtp ? "Sprawdzanie…" : "Sprawdź połączenie"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => testSmtp("send")}
                  disabled={isVerifyingSmtp || isTestingSmtp || !smtpTestRecipient}
                >
                  {isTestingSmtp ? "Wysyłanie…" : "Wyślij test"}
                </button>
              </div>

              {smtpInfo ? (
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
                  <strong style={{ color: "var(--fg)" }}>Źródło konfiguracji: </strong>
                  {smtpInfo.stored
                    ? "baza danych (zapisane w panelu)"
                    : "zmienne środowiskowe"}
                  <br />
                  <strong style={{ color: "var(--fg)" }}>Nadawca: </strong>
                  {smtpInfo.sender ?? "—"}
                  <br />
                  <strong style={{ color: "var(--fg)" }}>Hasło: </strong>
                  {smtpInfo.settings.hasPassword ? "ustawione" : "brak"}
                </div>
              ) : null}
            </form>
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              <p className="hintline">
                Konfiguracja poczty jest wspólna dla całej aplikacji, dlatego zmienia
                ją tylko Super Admin.
              </p>
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
          )}
        </div>
      </div>
      </div>

      {isSuperAdmin ? (
        <div className="card">
          <div className="card-head">
            <h2>Dane demonstracyjne</h2>
          </div>
          <div className="card-body">
            <div className="stack" style={{ gap: 16 }}>
              <p className="hintline">
                Przywraca bazę do stanu prezentacyjnego: usuwa wszystkie zgłoszenia,
                lokalizacje, konta i organizacje, a następnie tworzy zestaw
                demonstracyjny. Granice jednostek (powiat i gminy) są prawdziwymi
                obszarami z OpenStreetMap, więc zgłoszenia przypisują się do
                właściwych jednostek na podstawie położenia.
              </p>

              <div
                style={{
                  padding: "12px 14px",
                  border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)",
                  borderRadius: "var(--radius)",
                  background: "color-mix(in oklch, var(--danger) 10%, var(--bg))",
                  fontSize: 12.5,
                  color: "var(--muted)",
                }}
              >
                <strong style={{ color: "var(--danger)" }}>Uwaga: </strong>
                operacja nieodwracalnie usuwa wszystkie dane operacyjne, w tym
                zgłoszenia przyjęte od mieszkańców.
              </div>

              <div className="inline justify-end">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    setSeedResult(null);
                    setSeedModalOpen(true);
                  }}
                  disabled={isSeeding}
                >
                  Zastosuj SEED
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`modal${seedModalOpen ? " open" : ""}`} role="dialog" aria-modal="true">
        {seedModalOpen ? (
          <>
            <div
              className="scrim"
              onClick={() => {
                if (!isSeeding && !seedResult) setSeedModalOpen(false);
              }}
              aria-hidden="true"
            />
            <div className="modal-card">
              <div className="modal-head">
                <div>
                  <h2>{seedResult ? "Dane demonstracyjne gotowe" : "Zastosować SEED?"}</h2>
                  <p>
                    {seedResult
                      ? "Baza została wypełniona zestawem prezentacyjnym."
                      : "Wszystkie obecne dane zostaną trwale usunięte."}
                  </p>
                </div>
              </div>

              <div className="modal-body stack" style={{ gap: 16 }}>
                {seedResult ? (
                  <>
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
                      <strong style={{ color: "var(--fg)" }}>Utworzono: </strong>
                      {seedResult.summary.organizations} organizacji ·{" "}
                      {seedResult.summary.users} kont · {seedResult.summary.locations} lokalizacji
                      · {seedResult.summary.reports} zgłoszeń · {seedResult.summary.statusHistory}{" "}
                      wpisów historii
                      <br />
                      <strong style={{ color: "var(--fg)" }}>Zdjęcia: </strong>
                      {seedResult.summary.uploadsCleared
                        ? "katalog public/uploads wyczyszczony"
                        : "nie udało się wyczyścić katalogu zdjęć"}
                      {seedResult.summary.unassigned > 0 ? (
                        <>
                          <br />
                          <strong style={{ color: "var(--fg)" }}>Poza granicami: </strong>
                          {seedResult.summary.unassigned} zgłoszeń w kolejce
                          &bdquo;Nieprzypisane&rdquo;
                        </>
                      ) : null}
                    </div>

                    <div>
                      <p className="hintline" style={{ marginBottom: 8 }}>
                        Konta zostały utworzone od nowa, więc Twoja obecna sesja wskazuje
                        na usunięte konto. Zaloguj się ponownie jednym z kont poniżej
                        (hasło: <strong style={{ color: "var(--fg)" }}>{seedResult.password}</strong>).
                      </p>
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
                        {seedResult.accounts.map((account) => (
                          <div key={account.email}>
                            <strong style={{ color: "var(--fg)" }}>{account.email}</strong>{" "}
                            — {account.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="hintline">
                    Utworzonych zostanie 4 organizacje z prawdziwymi granicami
                    (Powiat Gorlicki oraz gminy Gorlice, Ropa i Biecz), 6 kont,
                    8 lokalizacji i 10 przykładowych zgłoszeń.
                  </p>
                )}
              </div>

              <div className="modal-foot">
                {seedResult ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                  >
                    Przejdź do logowania
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setSeedModalOpen(false)}
                      disabled={isSeeding}
                    >
                      Anuluj
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={applySeed}
                      disabled={isSeeding}
                    >
                      {isSeeding ? "Przywracanie…" : "Tak, usuń i przywróć"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
