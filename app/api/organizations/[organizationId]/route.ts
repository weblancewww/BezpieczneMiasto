import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
