/**
 * Konfiguracja poczty (SMTP) trzymana w bazie i edytowana z panelu.
 *
 * Wcześniej parametry brały się wyłącznie ze zmiennych środowiskowych, więc
 * zmiana serwera poczty wymagała edycji `.env` i restartu aplikacji. Teraz
 * źródłem prawdy jest tabela `SmtpSetting`, a zmienne środowiskowe służą już
 * tylko jako wartości startowe, gdy w bazie nie ma jeszcze konfiguracji
 * (przydatne przy wdrożeniach kontenerowych).
 */
import { prisma } from "./prisma";

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

export type SmtpSettingsInput = Partial<Record<keyof SmtpSettings, unknown>>;

/** Czy konfiguracja jest kompletna — inaczej nie ma po co wysyłać. */
export function isSmtpConfigured(settings: SmtpSettings): boolean {
  return Boolean(settings.host && settings.port && settings.fromEmail);
}

/** Adres nadawcy w formacie `Nazwa <adres>` albo sam adres. */
export function formatSender(settings: SmtpSettings): string {
  return settings.fromName
    ? `${settings.fromName} <${settings.fromEmail}>`
    : settings.fromEmail;
}

/** Precyzyjny powód, dlaczego nie da się wysłać poczty — do komunikatów w UI. */
export function describeSmtpGap(settings: SmtpSettings): string | null {
  const missing: string[] = [];

  if (!settings.host) missing.push("serwer (host)");
  if (!settings.port) missing.push("port");
  if (!settings.fromEmail) missing.push("adres nadawcy");

  if (missing.length === 0) return null;
  return `Uzupełnij konfigurację SMTP: ${missing.join(", ")}`;
}

function fromEnv(): SmtpSettings {
  const port = Number(process.env.SMTP_PORT || 587);

  return {
    host: process.env.SMTP_HOST || "",
    port: Number.isFinite(port) && port > 0 ? port : 587,
    // 465 to SMTP po TLS od pierwszej ramki, 587 startuje jawnie.
    secure: port === 465,
    username: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    fromEmail: process.env.SMTP_FROM || "",
    fromName: "",
  };
}

/**
 * Zapisana konfiguracja z bazy, a gdy jej nie ma — wartości ze zmiennych
 * środowiskowych (żeby istniejące wdrożenia nie przestały wysyłać poczty).
 */
export async function getSmtpSettings(): Promise<SmtpSettings> {
  const row = await prisma.smtpSetting.findUnique({ where: { id: 1 } });

  if (!row) return fromEnv();

  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    password: row.password,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
  };
}

/** Czy konfiguracja pochodzi z bazy, czy dopiero ze zmiennych środowiskowych. */
export async function hasStoredSmtpSettings(): Promise<boolean> {
  const row = await prisma.smtpSetting.findUnique({
    where: { id: 1 },
    select: { id: true },
  });

  return Boolean(row);
}

function parsePort(value: unknown): number {
  const port = Number(value);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("Port musi być liczbą z zakresu 1–65535");
  }
  return Math.trunc(port);
}

/**
 * Zapisuje konfigurację. Pola nieobecne w `input` zachowują dotychczasową
 * wartość — dzięki temu formularz może wysłać samo hasło, nie znając reszty.
 */
export async function saveSmtpSettings(
  input: SmtpSettingsInput,
  updatedBy?: string
): Promise<SmtpSettings> {
  const current = await getSmtpSettings();
  const port = input.port === undefined ? current.port : parsePort(input.port);

  const next: SmtpSettings = {
    host: input.host === undefined ? current.host : String(input.host).trim(),
    port,
    /* Tryb szyfrowania wynika z portu: 465 to połączenie szyfrowane od razu,
       587 i 25 startują jawnie (STARTTLS). Gdy użytkownik nie podał portu,
       zostawiamy wcześniejsze ustawienie bez zmian. */
    secure:
      input.port === undefined
        ? current.secure
        : input.secure === undefined
          ? port === 465
          : Boolean(input.secure),
    username:
      input.username === undefined ? current.username : String(input.username).trim(),
    // Hasła nie przycinamy — spacja na końcu bywa częścią hasła.
    password:
      input.password === undefined ? current.password : String(input.password),
    fromEmail:
      input.fromEmail === undefined
        ? current.fromEmail
        : String(input.fromEmail).trim(),
    fromName:
      input.fromName === undefined ? current.fromName : String(input.fromName).trim(),
  };

  await prisma.smtpSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...next, updatedBy: updatedBy ?? null },
    update: { ...next, updatedBy: updatedBy ?? null },
  });

  return next;
}
