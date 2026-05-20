import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

export function getEmailTransporter() {
  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  return transporter;
}

export async function sendReportConfirmation(
  email: string,
  reporterName: string,
  locationName: string,
  reportNumber: string
) {
  const transporter = getEmailTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Potwierdzenie zgłoszenia - Bezpieczne Miasto",
    html: `
      <h2>Dziękujemy za zgłoszenie!</h2>
      <p>Witaj ${reporterName},</p>
      <p>Twoje zgłoszenie zostało pomyślnie przyjęte.</p>
      <p><strong>Numer zgłoszenia:</strong> ${reportNumber}</p>
      <p><strong>Lokalizacja:</strong> ${locationName}</p>
      <p>Będziemy Cię informować o zmianach statusu zgłoszenia.</p>
      <hr />
      <p>Bezpieczne Miasto</p>
    `,
  });
}

export async function sendStatusUpdateEmail(
  email: string,
  reporterName: string,
  reportNumber: string,
  newStatus: string,
  note?: string
) {
  const transporter = getEmailTransporter();
  const statusMap: Record<string, string> = {
    NEW: "Nowe",
    ANALYSIS: "Podjęte do analizy",
    IN_PROGRESS: "W trakcie rozwiązywania",
    RESOLVED: "Rozwiązane",
  };

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: `Aktualizacja zgłoszenia #${reportNumber} - Bezpieczne Miasto`,
    html: `
      <h2>Aktualizacja Twojego zgłoszenia</h2>
      <p>Witaj ${reporterName},</p>
      <p>Status Twojego zgłoszenia <strong>#${reportNumber}</strong> został zmieniony.</p>
      <p><strong>Nowy status:</strong> ${statusMap[newStatus] || newStatus}</p>
      ${note ? `<p><strong>Notatka:</strong> ${note}</p>` : ""}
      <p>Dziękujemy za zainteresowanie.</p>
      <hr />
      <p>Bezpieczne Miasto</p>
    `,
  });
}
