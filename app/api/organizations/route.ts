import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const allowedTypes = ["POWIAT", "GMINA"] as const;

function isAllowedType(value: string): value is (typeof allowedTypes)[number] {
  return allowedTypes.includes(value as (typeof allowedTypes)[number]);
}

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizations = await prisma.organization.findMany({
      where:
        session.user.role === "SUPER_ADMIN"
          ? {}
          : {
              OR: [
                { id: session.user.organizationId },
                { parentId: session.user.organizationId },
              ],
            },
      include: {
        parent: true,
        children: true,
        _count: {
          select: {
            users: true,
            locations: true,
          },
        },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(organizations);
  } catch (error) {
    console.error("Error fetching organizations:", error);
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
    const name = String(body.name || "").trim();
    const slug = String(body.slug || "").trim().toLowerCase();
    const type = String(body.type || "").trim();
    const description = String(body.description || "").trim();
    const adminArea = String(body.adminArea || "").trim();
    const requestedParentId = String(body.parentId || "").trim();

    if (!name || !slug || !isAllowedType(type)) {
      return NextResponse.json({ error: "Brak wymaganych danych organizacji" }, { status: 400 });
    }

    const existingSlug = await prisma.organization.findUnique({ where: { slug } });
    if (existingSlug) {
      return NextResponse.json({ error: "Slug jest już zajęty" }, { status: 400 });
    }

    let parentId: string | null = requestedParentId || null;

    if (session.user.role !== "SUPER_ADMIN") {
      parentId = session.user.organizationId;
    }

    if (parentId) {
      const parent = await prisma.organization.findUnique({ where: { id: parentId } });

      if (!parent) {
        return NextResponse.json({ error: "Organizacja nadrzędna nie istnieje" }, { status: 400 });
      }
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        slug,
        type,
        description: description || null,
        adminArea: adminArea || null,
        parentId,
      },
      include: {
        parent: true,
        children: true,
      },
    });

    return NextResponse.json({ success: true, organization }, { status: 201 });
  } catch (error) {
    console.error("Error creating organization:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}