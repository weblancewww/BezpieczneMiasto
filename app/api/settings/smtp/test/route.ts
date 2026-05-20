import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmailTransporter } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const to = String(body.to || "").trim();

    if (!to) {
      return NextResponse.json({ error: "Adres odbiorcy jest wymagany" }, { status: 400 });
    }

    if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_FROM) {
      return NextResponse.json(
        { error: "Brak konfiguracji SMTP w zmiennych środowiskowych" },
        { status: 400 }
      );
    }

    const transporter = getEmailTransporter();

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: "Test SMTP - Bezpieczne Miasto",
      html: `
        <h2>Test SMTP zakończony powodzeniem</h2>
        <p>To jest wiadomość testowa wysłana z panelu administracyjnego.</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error testing SMTP:", error);
    return NextResponse.json({ error: "Nie udało się wysłać wiadomości testowej" }, { status: 500 });
  }
}