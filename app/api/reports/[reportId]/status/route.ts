import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendStatusUpdateEmail } from "@/lib/email";
import { isWithinOrganizationScope } from "@/lib/org-scope";

export const runtime = "nodejs";

const allowedStatuses = ["NEW", "ANALYSIS", "IN_PROGRESS", "RESOLVED"] as const;
type AllowedStatus = (typeof allowedStatuses)[number];

function isAllowedStatus(value: string): value is AllowedStatus {
  return allowedStatuses.includes(value as AllowedStatus);
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ reportId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reportId } = await ctx.params;
    const body = await request.json();
    const status = String(body.status || "").trim();
    const note = String(body.note || "").trim();

    if (!isAllowedStatus(status)) {
      return NextResponse.json({ error: "Nieprawidłowy status" }, { status: 400 });
    }

    const existingReport = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        organizationId: true,
        // Poprzedni status — mail pokazuje przejście „z → na".
        status: true,
        reporterEmail: true,
        reporterName: true,
      },
    });

    if (!existingReport) {
      return NextResponse.json({ error: "Zgłoszenie nie istnieje" }, { status: 404 });
    }

    if (
      !(await isWithinOrganizationScope(session.user, existingReport.organizationId))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updatedReport = await prisma.$transaction(async (tx) => {
      const report = await tx.report.update({
        where: { id: reportId },
        data: { status },
        include: {
          location: true,
          organization: true,
          photos: true,
          statusHistories: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      await tx.statusHistory.create({
        data: {
          reportId,
          status,
          note: note || null,
          changedById: session.user.id,
        },
      });

      return report;
    });

    try {
      await sendStatusUpdateEmail(updatedReport.reporterEmail, {
        reportNumber: updatedReport.id.substring(0, 8).toUpperCase(),
        reporterName: updatedReport.reporterName,
        placeName:
          updatedReport.reportPlaceName ||
          updatedReport.location?.name ||
          "Punkt zgłoszenia",
        address: updatedReport.reportAddress || updatedReport.location?.address || null,
        latitude: updatedReport.reportLatitude ?? updatedReport.location?.latitude ?? null,
        longitude:
          updatedReport.reportLongitude ?? updatedReport.location?.longitude ?? null,
        description: updatedReport.description,
        organizationName: updatedReport.organization?.name ?? null,
        createdAt: updatedReport.createdAt,
        photoCount: updatedReport.photos.length,
        previousStatus: existingReport.status,
        newStatus: updatedReport.status,
        note: note || null,
      });
    } catch (emailError) {
      console.error("Status update email failed:", emailError);
    }

    return NextResponse.json({ success: true, report: updatedReport });
  } catch (error) {
    console.error("Error updating report status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}