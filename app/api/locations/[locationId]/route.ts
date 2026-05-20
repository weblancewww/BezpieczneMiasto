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

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ locationId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { locationId } = await ctx.params;
    const existing = await prisma.location.findUnique({ where: { id: locationId } });

    if (!existing) {
      return NextResponse.json({ error: "Lokalizacja nie istnieje" }, { status: 404 });
    }

    if (session.user.role !== "SUPER_ADMIN" && existing.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const name = body.name !== undefined ? String(body.name || "").trim() : existing.name;
    const address = body.address !== undefined ? String(body.address || "").trim() : existing.address;
    const description =
      body.description !== undefined ? String(body.description || "").trim() : existing.description || "";
    const latitude = body.latitude !== undefined ? toNumber(body.latitude) : existing.latitude;
    const longitude = body.longitude !== undefined ? toNumber(body.longitude) : existing.longitude;

    if (!name || !address) {
      return NextResponse.json({ error: "Nazwa i adres są wymagane" }, { status: 400 });
    }

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return NextResponse.json({ error: "Nieprawidłowe współrzędne" }, { status: 400 });
    }

    const location = await prisma.location.update({
      where: { id: locationId },
      data: {
        name,
        address,
        description: description || null,
        latitude,
        longitude,
      },
      include: {
        organization: true,
      },
    });

    return NextResponse.json({ success: true, location });
  } catch (error) {
    console.error("Error updating location:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ locationId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { locationId } = await ctx.params;
    const existing = await prisma.location.findUnique({ where: { id: locationId } });

    if (!existing) {
      return NextResponse.json({ error: "Lokalizacja nie istnieje" }, { status: 404 });
    }

    if (session.user.role !== "SUPER_ADMIN" && existing.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.location.delete({ where: { id: locationId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting location:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ locationId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { locationId } = await ctx.params;
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: {
        organization: true,
        _count: {
          select: {
            reports: true,
          },
        },
      },
    });

    if (!location) {
      return NextResponse.json({ error: "Lokalizacja nie istnieje" }, { status: 404 });
    }

    if (session.user.role !== "SUPER_ADMIN" && location.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(location);
  } catch (error) {
    console.error("Error fetching location:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}