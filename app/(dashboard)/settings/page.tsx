"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : "Błąd ładowania";
        toast.error(message);
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
      const message = error instanceof Error ? error.message : "Błąd zapisu";
      toast.error(message);
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
      const message = error instanceof Error ? error.message : "Błąd testu SMTP";
      toast.error(message);
    } finally {
      setIsTestingSmtp(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Ustawienia</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>
            {isLoading
              ? "Ładowanie danych użytkownika..."
              : `${user?.email || ""} · ${user?.organization?.name || ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4 max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Imię i nazwisko</Label>
              <Input
                id="profile-name"
                value={profileForm.name}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, name: event.target.value }))
                }
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-current-password">Aktualne hasło</Label>
              <Input
                id="profile-current-password"
                type="password"
                value={profileForm.currentPassword}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, currentPassword: event.target.value }))
                }
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-new-password">Nowe hasło</Label>
              <Input
                id="profile-new-password"
                type="password"
                value={profileForm.newPassword}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, newPassword: event.target.value }))
                }
                disabled={isLoading}
              />
              <p className="text-xs text-slate-500">
                Pozostaw puste, jeśli nie chcesz zmieniać hasła.
              </p>
            </div>
            <Button type="submit" disabled={isLoading || isSavingProfile}>
              {isSavingProfile ? "Zapisywanie..." : "Zapisz profil"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Konfiguracja SMTP</CardTitle>
          <CardDescription>
            Test opiera się na aktualnych zmiennych środowiskowych SMTP aplikacji.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <Label htmlFor="smtp-test-recipient">Adres testowy</Label>
            <Input
              id="smtp-test-recipient"
              type="email"
              value={smtpTestRecipient}
              onChange={(event) => setSmtpTestRecipient(event.target.value)}
              required
            />
          </div>
          <Button onClick={testSmtp} disabled={isTestingSmtp || !smtpTestRecipient}>
            {isTestingSmtp ? "Wysyłanie..." : "Wyślij test SMTP"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
