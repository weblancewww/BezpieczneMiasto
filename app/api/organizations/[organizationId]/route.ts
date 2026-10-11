import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { boundaryFromGeoJson, parseBoundary } from "@/lib/geo";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ organizationId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { organizationId } = await ctx.params;
    const payload = await request.json();
    const adminArea = String(payload.adminArea || "").trim();

    // boundary: obiekt GeoJSON (z edytora), tekst GeoJSON do wklejenia,
    // null albo brak pola (wtedy granica pozostaje bez zmian).
    let boundaryUpdate: { boundary?: Prisma.InputJsonValue | typeof Prisma.DbNull } = {};

    if ("boundary" in payload) {
      const input = payload.boundary as unknown;

      if (input === null) {
        boundaryUpdate = { boundary: Prisma.DbNull };
      } else {
        const parsed =
          typeof input === "string" ? boundaryFromGeoJson(input) : parseBoundary(input);

        if (parsed === null || "error" in parsed) {
          return NextResponse.json(
            {
              error:
                parsed && "error" in parsed
                  ? parsed.error
                  : "Niepoprawna granica — wymagany GeoJSON Polygon lub MultiPolygon.",
            },
            { status: 400 }
          );
        }

        boundaryUpdate = { boundary: parsed as unknown as Prisma.InputJsonValue };
      }
    }

    const existing = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Organizacja nie istnieje" }, { status: 404 });
    }

    if (
      session.user.role !== "SUPER_ADMIN" &&
      existing.id !== session.user.organizationId &&
      existing.parentId !== session.user.organizationId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        adminArea: adminArea || null,
        ...boundaryUpdate,
      },
      include: {
        _count: {
          select: {
            users: true,
            locations: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, organization });
  } catch (error) {
    console.error("Error updating organization area:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
