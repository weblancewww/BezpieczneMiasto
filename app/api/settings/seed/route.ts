import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyDemoSeed, DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-seed";

export const runtime = "nodejs";

/**
 * „Zastosuj SEED" — przywraca bazę do stanu demonstracyjnego.
 *
 * Operacja jest destrukcyjna: usuwa wszystkie zgłoszenia, lokalizacje, konta
 * i organizacje, a następnie tworzy zestaw prezentacyjny (powiat + gminy
 * z prawdziwymi granicami). Dlatego dostęp ma wyłącznie SUPER_ADMIN.
 *
 * Tej samej logiki używa `npm run db:seed` — obie ścieżki wołają applyDemoSeed.
 */
export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Tylko Super Admin może przywrócić dane demonstracyjne" },
        { status: 403 }
      );
    }

    const summary = await applyDemoSeed(prisma);

    return NextResponse.json({
      success: true,
      message: "Dane demonstracyjne zostały przywrócone",
      summary,
      accounts: DEMO_ACCOUNTS,
      password: DEMO_PASSWORD,
    });
  } catch (error) {
    console.error("Error applying demo seed:", error);
    return NextResponse.json(
      { error: "Nie udało się przywrócić danych demonstracyjnych" },
      { status: 500 }
    );
  }
}
