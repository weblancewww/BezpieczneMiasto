import nodemailer from "nodemailer";
import {
  renderReportConfirmationEmail,
  renderStatusUpdateEmail,
  type ReportEmailContext,
  type ReportStatus,
} from "./email-templates";
import { renderStaticMap } from "./map-image";
import {
  describeSmtpGap,
  formatSender,
  getSmtpSettings,
  isSmtpConfigured,
  type SmtpSettings,
} from "./smtp-settings";

/**
 * Transport trzymamy w pamięci, ale kluczujemy go odciskiem konfiguracji.
 * Dzięki temu zmiana danych SMTP w panelu działa od razu, bez restartu
 * aplikacji, a jednocześnie nie tworzymy nowego połączenia przy każdym mailu.
 */
let cached: { fingerprint: string; transporter: nodemailer.Transporter } | null = null;

function fingerprintOf(settings: SmtpSettings): string {
  return [
    settings.host,
    settings.port,
    settings.secure ? "secure" : "plain",
    settings.username,
    // Hasło wpływa na odcisk, żeby zmiana hasła przebudowała transport.
    settings.password,
  ].join("|");
}

export class SmtpNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpNotConfiguredError";
  }
}

/** Transport gotowy do wysyłki. Rzuca, gdy konfiguracja jest niekompletna. */
export async function getEmailTransporter() {
  const settings = await getSmtpSettings();
  const gap = describeSmtpGap(settings);

  if (gap) {
    throw new SmtpNotConfiguredError(gap);
  }

  const fingerprint = fingerprintOf(settings);

  if (cached?.fingerprint === fingerprint) {
    return cached.transporter;
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.username
      ? { user: settings.username, pass: settings.password }
      : undefined,
  });

  cached = { fingerprint, transporter };
  return transporter;
}

/** Sprawdza połączenie i uwierzytelnienie bez wysyłania wiadomości. */
export async function verifyEmailTransport() {
  const transporter = await getEmailTransporter();
  await transporter.verify();
}

/** Czy w ogóle da się wysłać pocztę (do rozgałęzień w API). */
export async function isEmailEnabled(): Promise<boolean> {
  return isSmtpConfigured(await getSmtpSettings());
}

async function send(mail: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; cid: string; contentType?: string }[];
}) {
  const settings = await getSmtpSettings();

  /* Brak konfiguracji to nie awaria — po prostu nie wysyłamy. Zgłaszamy błąd
     dopiero, gdy konfiguracja jest kompletna, ale serwer ją odrzucił
     (np. błędne hasło), bo wtedy warto o tym wiedzieć. */
  if (!isSmtpConfigured(settings)) return;

  const transporter = await getEmailTransporter();

  const info = await transporter.sendMail({
    from: formatSender(settings),
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    attachments: mail.attachments,
  });

  /* Serwer potrafi przyjąć wiadomość i jednocześnie odmówić dostarczenia do
     odbiorcy (np. „relay denied"). `sendMail` w takim wypadku NIE rzuca błędu,
     więc bez tej kontroli odrzucenie wyglądałoby jak sukces. */
  const rejected = (info.rejected ?? []).map(String);

  if (rejected.length > 0) {
    throw new Error(
      `Serwer poczty odrzucił odbiorcę: ${rejected.join(", ")}` +
        (typeof info.response === "string" ? ` (${info.response})` : "")
    );
  }

  console.log(
    `[email] wysłano "${mail.subject}" do ${mail.to} ` +
      `(id: ${info.messageId ?? "brak"}, załączniki: ${mail.attachments?.length ?? 0})`
  );
}

/**
 * Mapa dla punktu zgłoszenia. Zwraca `null`, gdy nie ma współrzędnych albo
 * pobranie obrazka się nie powiodło — wtedy mail idzie bez mapy, bo brak
 * grafiki nie jest powodem, żeby wstrzymywać powiadomienie.
 */
async function fetchMap(data: ReportEmailContext) {
  if (typeof data.latitude !== "number" || typeof data.longitude !== "number") {
    return null;
  }

  return renderStaticMap({
    latitude: data.latitude,
    longitude: data.longitude,
    label: data.placeName,
  });
}

/** Zamienia obrazek mapy na załącznik inline (widoczny przez `cid:`). */
function mapAttachments(map: Awaited<ReturnType<typeof fetchMap>>) {
  if (!map) return undefined;

  return [
    {
      filename: "mapa.png",
      content: map.content,
      cid: map.cid,
      contentType: map.contentType,
    },
  ];
}

/** Mail potwierdzający przyjęcie zgłoszenia. */
export async function sendReportConfirmation(
  email: string,
  data: ReportEmailContext
) {
  const map = await fetchMap(data);
  const html = renderReportConfirmationEmail(data, map);

  await send({
    to: email,
    subject: `Potwierdzenie zgłoszenia #${data.reportNumber} - Bezpieczne Miasto`,
    html,
    attachments: mapAttachments(map),
  });
}

/** Mail informujący o zmianie statusu zgłoszenia. */
export async function sendStatusUpdateEmail(
  email: string,
  data: ReportEmailContext & {
    previousStatus?: ReportStatus | null;
    newStatus: ReportStatus;
    note?: string | null;
  }
) {
  const map = await fetchMap(data);
  const html = renderStatusUpdateEmail(data, map);

  await send({
    to: email,
    subject: `Aktualizacja zgłoszenia #${data.reportNumber} - Bezpieczne Miasto`,
    html,
    attachments: mapAttachments(map),
  });
}
