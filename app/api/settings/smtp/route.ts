import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  describeSmtpGap,
  formatSender,
  getSmtpSettings,
  hasStoredSmtpSettings,
  saveSmtpSettings,
} from "@/lib/smtp-settings";

export const runtime = "nodejs";

/**
 * Konfiguracja poczty wychodzącej (SMTP).
 *
 * Dane są globalne dla całej aplikacji (nie per organizacja), dlatego odczyt
 * i zapis ma wyłącznie SUPER_ADMIN — tak samo jak przywracanie danych
 * demonstracyjnych.
 */
async function requireSuperAdmin() {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (session.user.role !== "SUPER_ADMIN") {
    return {
      error: NextResponse.json(
        { error: "Tylko Super Admin może zarządzać konfiguracją poczty" },
        { status: 403 }
      ),
    };
  }

  return { userId: session.user.id };
}

export async function GET() {
  try {
    const guard = await requireSuperAdmin();
    if (guard.error) return guard.error;

    const settings = await getSmtpSettings();
    const stored = await hasStoredSmtpSettings();

    return NextResponse.json({
      settings: {
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        username: settings.username,
        // Hasła nigdy nie odsyłamy — klient dostaje tylko informację, że jest.
        hasPassword: Boolean(settings.password),
        fromEmail: settings.fromEmail,
        fromName: settings.fromName,
      },
      stored,
      sender: settings.fromEmail ? formatSender(settings) : null,
      gap: describeSmtpGap(settings),
    });
  } catch (error) {
    console.error("Error reading SMTP settings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireSuperAdmin();
    if (guard.error) return guard.error;

    const body = await request.json();

    /* Puste pole hasła oznacza „nie zmieniaj" — inaczej zapis formularza bez
       ponownego wpisania hasła skasowałby je. Aby jawnie wyczyścić hasło,
       klient wysyła `clearPassword: true`. */
    const passwordInput =
      body.clearPassword === true
        ? ""
        : typeof body.password === "string" && body.password.length > 0
          ? body.password
          : undefined;

    const saved = await saveSmtpSettings(
      {
        host: body.host,
        port: body.port,
        secure: body.secure,
        username: body.username,
        fromEmail: body.fromEmail,
        fromName: body.fromName,
        ...(passwordInput === undefined ? {} : { password: passwordInput }),
      },
      guard.userId
    );

    return NextResponse.json({
      success: true,
      message: "Konfiguracja poczty została zapisana",
      settings: {
        host: saved.host,
        port: saved.port,
        secure: saved.secure,
        username: saved.username,
        hasPassword: Boolean(saved.password),
        fromEmail: saved.fromEmail,
        fromName: saved.fromName,
      },
      gap: describeSmtpGap(saved),
    });
  } catch (error) {
    console.error("Error saving SMTP settings:", error);

    const message =
      error instanceof Error ? error.message : "Nie udało się zapisać konfiguracji";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
