import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isWithinOrganizationScope } from "@/lib/org-scope";

export const runtime = "nodejs";

/**
 * Ręczne przypisanie zgłoszenia do organizacji.
 *
 * Używane głównie dla zgłoszeń z kolejki „Nieprzypisane" — czyli takich,
 * których punkt nie leżał w żadnej skonfigurowanej granicy.
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ reportId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { reportId } = await ctx.params;
    const body = await request.json();
    const organizationId = String(body.organizationId || "").trim();

    if (!organizationId) {
      return NextResponse.json({ error: "Wybierz organizację" }, { status: 400 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, parentId: true },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organizacja nie istnieje" }, { status: 404 });
    }

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, organizationId: true },
    });

    if (!report) {
      return NextResponse.json({ error: "Zgłoszenie nie istnieje" }, { status: 404 });
    }

    // Admin może przypisywać tylko w obrębie swojej organizacji i jej jednostek
    // podrzędnych (powiat → podległe gminy). Zgłoszenia nieprzypisanego
    // (organizationId = null) nie da się przypisać poza własny zakres.
    if (!(await isWithinOrganizationScope(session.user, organization.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.report.update({
      where: { id: reportId },
      data: {
        organizationId: organization.id,
        assignedManually: true,
      },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, report: updated });
  } catch (error) {
    console.error("Error assigning report:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
