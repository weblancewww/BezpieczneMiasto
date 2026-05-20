import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value);
}

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const where =
      session.user.role === "SUPER_ADMIN"
        ? {}
        : { organizationId: session.user.organizationId };

    const locations = await prisma.location.findMany({
      where,
      include: {
        organization: true,
        _count: {
          select: {
            reports: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = String(body.name || "").trim();
    const address = String(body.address || "").trim();
    const description = String(body.description || "").trim();
    const latitude = toNumber(body.latitude);
    const longitude = toNumber(body.longitude);
    const providedOrganizationId = String(body.organizationId || "").trim();
    let organizationId =
      session.user.role === "SUPER_ADMIN" && providedOrganizationId
        ? providedOrganizationId
        : session.user.organizationId;

    if (!name || !address) {
      return NextResponse.json({ error: "Nazwa i adres są wymagane" }, { status: 400 });
    }

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return NextResponse.json({ error: "Nieprawidłowe współrzędne" }, { status: 400 });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: "Współrzędne poza zakresem" }, { status: 400 });
    }

    let organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization && session.user.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          organizationId: true,
          organization: {
            select: {
              id: true,
            },
          },
        },
      });

      if (user?.organization?.id) {
        organizationId = user.organization.id;
        organization = await prisma.organization.findUnique({
          where: { id: organizationId },
        });
      }
    }

    if (!organization) {
      return NextResponse.json({ error: "Organizacja nie istnieje" }, { status: 400 });
    }

    const location = await prisma.location.create({
      data: {
        name,
        address,
        description: description || null,
        latitude,
        longitude,
        organizationId,
      },
      include: {
        organization: true,
      },
    });

    return NextResponse.json({ success: true, location }, { status: 201 });
  } catch (error) {
    console.error("Error creating location:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}