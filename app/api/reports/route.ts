import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReportConfirmation } from "@/lib/email";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

type ReportSubmission = {
  qrToken: string;
  reporterName: string;
  reporterEmail: string;
  reporterPhone: string;
  description: string;
  photos: File[];
};

function getReportNumber(reportId: string) {
  return reportId.substring(0, 8).toUpperCase();
}

async function parseSubmission(request: NextRequest): Promise<ReportSubmission> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();

    return {
      qrToken: String(formData.get("qrToken") || "").trim(),
      reporterName: String(formData.get("reporterName") || "").trim(),
      reporterEmail: String(formData.get("reporterEmail") || "").trim(),
      reporterPhone: String(formData.get("reporterPhone") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      photos: formData.getAll("photos").filter((value): value is File => value instanceof File),
    };
  }

  const body = await request.json();

  return {
    qrToken: String(body.qrToken || "").trim(),
    reporterName: String(body.reporterName || "").trim(),
    reporterEmail: String(body.reporterEmail || "").trim(),
    reporterPhone: String(body.reporterPhone || "").trim(),
    description: String(body.description || "").trim(),
    photos: [],
  };
}

async function savePhotos(reportId: string, photos: File[]) {
  if (photos.length === 0) {
    return [];
  }

  const uploadRoot = path.join(process.cwd(), "public", "uploads", reportId);
  await mkdir(uploadRoot, { recursive: true });

  const savedPhotos: { filename: string; path: string; size: number }[] = [];

  for (const photo of photos) {
    if (!photo.type.startsWith("image/")) {
      throw new Error("Wszystkie pliki muszą być obrazami");
    }

    if (photo.size > 10 * 1024 * 1024) {
      throw new Error("Jeden z plików przekracza limit 10 MB");
    }

    const extension = path.extname(photo.name || "").toLowerCase() || ".jpg";
    const filename = `${crypto.randomUUID()}${extension}`;
    const filePath = path.join(uploadRoot, filename);
    const relativePath = `/uploads/${reportId}/${filename}`;
    const buffer = Buffer.from(await photo.arrayBuffer());

    await writeFile(filePath, buffer);
    savedPhotos.push({
      filename: photo.name || filename,
      path: relativePath,
      size: photo.size,
    });
  }

  return savedPhotos;
}

export async function POST(request: NextRequest) {
  try {
    const { qrToken, reporterName, reporterEmail, reporterPhone, description, photos } =
      await parseSubmission(request);

    if (!qrToken || !reporterName || !reporterEmail || !reporterPhone || !description) {
      return NextResponse.json(
        { error: "Brak wymaganych danych zgłoszenia" },
        { status: 400 }
      );
    }

    const location = await prisma.location.findUnique({
      where: { qrToken },
    });

    if (!location) {
      return NextResponse.json(
        { error: "Invalid QR code" },
        { status: 404 }
      );
    }

    const reportId = crypto.randomUUID();
    const uploadRoot = path.join(process.cwd(), "public", "uploads", reportId);

    try {
      const report = await prisma.report.create({
        data: {
          id: reportId,
          locationId: location.id,
          organizationId: location.organizationId,
          reportLatitude: location.latitude,
          reportLongitude: location.longitude,
          reportAddress: location.address,
          reportPlaceName: location.name,
          reporterName,
          reporterEmail,
          reporterPhone,
          description,
          status: "NEW",
        },
      });

      const savedPhotos = await savePhotos(report.id, photos);

      if (savedPhotos.length > 0) {
        await prisma.reportPhoto.createMany({
          data: savedPhotos.map((photo) => ({
            reportId: report.id,
            filename: photo.filename,
            path: photo.path,
            size: photo.size,
          })),
        });
      }

      try {
        await sendReportConfirmation(
          reporterEmail,
          reporterName,
          location.name,
          getReportNumber(report.id)
        );
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
      }

      return NextResponse.json(
        {
          success: true,
          reportId: report.id,
          reportNumber: getReportNumber(report.id),
        },
        { status: 201 }
      );
    } catch (error) {
      await prisma.report.deleteMany({ where: { id: reportId } });
      await rm(uploadRoot, { recursive: true, force: true });
      throw error;
    }
  } catch (error) {
    console.error("Error creating report:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
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

    const reports = await prisma.report.findMany({
      where,
      include: {
        location: true,
        photos: true,
        statusHistories: {
          orderBy: { createdAt: "desc" },
          include: {
            changedBy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(reports);
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
