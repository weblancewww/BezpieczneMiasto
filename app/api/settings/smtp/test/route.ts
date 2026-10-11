import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SmtpNotConfiguredError, getEmailTransporter } from "@/lib/email";
import { describeSmtpGap, formatSender, getSmtpSettings } from "@/lib/smtp-settings";

export const runtime = "nodejs";

/**
 * Test poczty wychodzącej.
 *
 * `mode: "verify"` sprawdza samo połączenie i uwierzytelnienie (nic nie wysyła),
 * `mode: "send"` dodatkowo wysyła wiadomość na podany adres. Rozdzielenie jest
 * przydatne, gdy ktoś chce potwierdzić poprawność hasła bez wysyłania maila.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Tylko Super Admin może testować konfigurację poczty" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "send" ? "send" : "verify";
    const to = String(body.to || "").trim() || session.user.email || "";

    const settings = await getSmtpSettings();
    const gap = describeSmtpGap(settings);

    if (gap) {
      return NextResponse.json({ error: gap }, { status: 400 });
    }

    const transporter = await getEmailTransporter();

    // Łączymy się i uwierzytelniamy — to wychwytuje większość pomyłek.
    await transporter.verify();

    if (mode === "verify") {
      return NextResponse.json({
        success: true,
        message: `Połączenie z ${settings.host}:${settings.port} działa poprawnie`,
      });
    }

    if (!to) {
      return NextResponse.json(
        { error: "Podaj adres, na który wysłać wiadomość testową" },
        { status: 400 }
      );
    }

    const info = await transporter.sendMail({
      from: formatSender(settings),
      to,
      subject: "Test SMTP - Bezpieczne Miasto",
      html: `
        <h2>Test SMTP zakończony powodzeniem</h2>
        <p>To jest wiadomość testowa wysłana z panelu administracyjnego.</p>
        <p>Serwer: <strong>${settings.host}:${settings.port}</strong></p>
      `,
    });

    /* Samo przyjęcie wiadomości nie znaczy, że trafi do odbiorcy — serwer może
       odmówić dostarczenia. Bez tej kontroli „sukces" bywał mylący. */
    const rejected = (info.rejected ?? []).map(String);

    if (rejected.length > 0) {
      return NextResponse.json(
        {
          error:
            `Serwer odrzucił odbiorcę: ${rejected.join(", ")}` +
            (typeof info.response === "string" ? ` (${info.response})` : ""),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Wiadomość testowa wysłana na ${to}`,
      accepted: (info.accepted ?? []).map(String),
      response: typeof info.response === "string" ? info.response : null,
    });
  } catch (error) {
    console.error("Error testing SMTP:", error);

    if (error instanceof SmtpNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Błąd serwera poczty jest najczęściej sednem problemu — przekazujemy go dalej.
    const message =
      error instanceof Error ? error.message : "Nie udało się przetestować poczty";

    return NextResponse.json({ error: `Błąd serwera poczty: ${message}` }, { status: 400 });
  }
}
