import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const allowedRoles = ["SUPER_ADMIN", "ADMIN", "MODERATOR"] as const;

function isAllowedRole(value: string): value is (typeof allowedRoles)[number] {
  return allowedRoles.includes(value as (typeof allowedRoles)[number]);
}

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      where:
        session.user.role === "SUPER_ADMIN"
          ? {}
          : { organizationId: session.user.organizationId },
      include: {
        organization: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        organization: user.organization,
      }))
    );
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "").trim();
    const role = String(body.role || "").trim();
    const requestedOrganizationId = String(body.organizationId || "").trim();

    if (!email || !name || !password || !isAllowedRole(role)) {
      return NextResponse.json({ error: "Brak wymaganych danych użytkownika" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Hasło musi mieć min. 8 znaków" }, { status: 400 });
    }

    if (session.user.role !== "SUPER_ADMIN" && role === "SUPER_ADMIN") {
      return NextResponse.json({ error: "Brak uprawnień do tej roli" }, { status: 403 });
    }

    const organizationId =
      session.user.role === "SUPER_ADMIN" && requestedOrganizationId
        ? requestedOrganizationId
        : session.user.organizationId;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "Użytkownik o tym e-mailu już istnieje" }, { status: 400 });
    }

    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      return NextResponse.json({ error: "Organizacja nie istnieje" }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: await hash(password, 10),
        role,
        organizationId,
      },
      include: {
        organization: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organization: user.organization,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}