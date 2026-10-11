import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { boundaryFromGeoJson, parseBoundary } from "@/lib/geo";

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

    /* Granice zwracamy raz na organizację. Wcześniejsze `include: { parent, children }`
       doklejało pełne rekordy sąsiadów, więc granica powiatu (po imporcie z OSM
       ~6900 wierzchołków) wracała jeszcze raz w `parent` i `children` każdej
       gminy — odpowiedź rosła z ~190 KB do ponad 640 KB. Nikt z klientów nie
       używa tych relacji (drzewo budują z `parentId`). */
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
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        description: true,
        adminArea: true,
        boundary: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
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
    const boundaryInput = body.boundary;

    if (!name || !slug || !isAllowedType(type)) {
      return NextResponse.json({ error: "Brak wymaganych danych organizacji" }, { status: 400 });
    }

    // Granica jest opcjonalna, ale jeśli podana — musi być poprawnym GeoJSON-em.
    let boundary: Prisma.InputJsonValue | undefined;

    if (boundaryInput !== undefined && boundaryInput !== null) {
      const parsed =
        typeof boundaryInput === "string"
          ? boundaryFromGeoJson(boundaryInput)
          : parseBoundary(boundaryInput);

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

      boundary = parsed as unknown as Prisma.InputJsonValue;
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
        boundary,
        parentId,
      },
    });

    return NextResponse.json({ success: true, organization }, { status: 201 });
  } catch (error) {
    console.error("Error creating organization:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}