import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendReportConfirmation } from "@/lib/email";

export const runtime = "nodejs";

function getReportNumber(reportId: string) {
  return reportId.substring(0, 8).toUpperCase();
}

async function savePhotos(reportId: string, photos: File[]) {
  if (photos.length === 0) return [];

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
    savedPhotos.push({ filename: photo.name || filename, path: relativePath, size: photo.size });
  }

  return savedPhotos;
}

function normalizeStr(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    const formData = await request.formData();
    const lat = Number(formData.get("lat") || "");
    const lng = Number(formData.get("lng") || "");
    const address = String(formData.get("address") || "").trim();
    const geocodedAreasRaw = String(formData.get("geocodedAreas") || "[]");
    const reporterName = String(formData.get("reporterName") || "").trim();
    const reporterEmail = String(formData.get("reporterEmail") || "").trim();
    const reporterPhone = String(formData.get("reporterPhone") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const photos = formData
      .getAll("photos")
      .filter((v): v is File => v instanceof File && v.size > 0);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !reporterName ||
      !reporterEmail ||
      !reporterPhone ||
      !description
    ) {
      return NextResponse.json({ error: "Brak wymaganych danych zgłoszenia" }, { status: 400 });
    }

    let geocodedAreas: string[] = [];
    try {
      const parsed = JSON.parse(geocodedAreasRaw);
      if (Array.isArray(parsed)) {
        geocodedAreas = parsed.map(String);
      }
    } catch {
      geocodedAreas = [];
    }

    // If user is logged in and scoped to an organization, prefer their scope.
    // For public submissions, match against all organizations.
    const restrictedScope =
      session?.user?.organizationId && session.user.role !== "SUPER_ADMIN"
        ? {
            OR: [
              { id: session.user.organizationId },
              { parentId: session.user.organizationId },
            ],
          }
        : {};

    let candidateOrgs = await prisma.organization.findMany({ where: restrictedScope });

    if (candidateOrgs.length === 0 && Object.keys(restrictedScope).length > 0) {
      candidateOrgs = await prisma.organization.findMany();
    }

    const normAreas = geocodedAreas.map(normalizeStr);

    function matchesOrgArea(adminArea: string | null): boolean {
      if (!adminArea) return false;
      const orgAreas = adminArea.split(",").map(normalizeStr);
      return normAreas.some((ga) =>
        orgAreas.some((oa) => oa.includes(ga) || ga.includes(oa))
      );
    }

    // Prefer GMINA over POWIAT for specificity
    const gminaMatch = candidateOrgs.find(
      (org) => org.type === "GMINA" && matchesOrgArea(org.adminArea)
    );
    const powiatMatch = candidateOrgs.find(
      (org) => org.type === "POWIAT" && matchesOrgArea(org.adminArea)
    );
    const bestOrg = gminaMatch ?? powiatMatch ?? candidateOrgs[0];

    if (!bestOrg) {
      return NextResponse.json(
        { error: "Brak dostępnych organizacji do przypisania zgłoszenia" },
        { status: 400 }
      );
    }

    const pointName = address || `Punkt (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

    const reportId = crypto.randomUUID();
    const uploadRoot = path.join(process.cwd(), "public", "uploads", reportId);

    try {
      const report = await prisma.report.create({
        data: {
          id: reportId,
          organizationId: bestOrg.id,
          reportLatitude: lat,
          reportLongitude: lng,
          reportAddress: address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          reportPlaceName: pointName,
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
          pointName,
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
          organizationName: bestOrg.name,
        },
        { status: 201 }
      );
    } catch (createError) {
      await rm(uploadRoot, { recursive: true, force: true }).catch(() => {});
      throw createError;
    }
  } catch (error) {
    console.error("Error creating map report:", error);
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
