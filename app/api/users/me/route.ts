import { NextRequest, NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { organization: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Użytkownik nie istnieje" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organization: user.organization,
    });
  } catch (error) {
    console.error("Error fetching current user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = String(body.name || "").trim();
    const currentPassword = String(body.currentPassword || "").trim();
    const newPassword = String(body.newPassword || "").trim();

    if (!name) {
      return NextResponse.json({ error: "Imię i nazwisko jest wymagane" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "Użytkownik nie istnieje" }, { status: 404 });
    }

    let nextPassword = existingUser.password;

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Podaj aktualne hasło, aby ustawić nowe" },
          { status: 400 }
        );
      }

      const isCurrentValid = await compare(currentPassword, existingUser.password);

      if (!isCurrentValid) {
        return NextResponse.json({ error: "Aktualne hasło jest nieprawidłowe" }, { status: 400 });
      }

      if (newPassword.length < 8) {
        return NextResponse.json({ error: "Nowe hasło musi mieć min. 8 znaków" }, { status: 400 });
      }

      nextPassword = await hash(newPassword, 10);
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name,
        password: nextPassword,
      },
      include: {
        organization: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organization: user.organization,
      },
    });
  } catch (error) {
    console.error("Error updating current user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}