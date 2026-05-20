import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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
      include: { organization: true },
    });

    if (!location) {
      return NextResponse.json({ error: "Lokalizacja nie istnieje" }, { status: 404 });
    }

    if (
      session.user.role !== "SUPER_ADMIN" &&
      location.organizationId !== session.user.organizationId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || new URL(request.url).origin;
    const reportUrl = `${baseUrl}/r/${location.qrToken}`;
    const pngBuffer = await QRCode.toBuffer(reportUrl, {
      type: "png",
      width: 1024,
      margin: 1,
      errorCorrectionLevel: "M",
    });

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="qr-${location.name.replace(/\s+/g, "-").toLowerCase()}.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating location QR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}