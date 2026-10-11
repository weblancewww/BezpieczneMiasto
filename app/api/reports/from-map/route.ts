import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReportConfirmation } from "@/lib/email";
import {
  findOrganizationForPoint,
  parseBoundary,
  type OrganizationBoundary,
} from "@/lib/geo";

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const lat = Number(formData.get("lat") || "");
    const lng = Number(formData.get("lng") || "");
    const address = String(formData.get("address") || "").trim();
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

    // Przypisanie wyłącznie po geometrii granic. Brak dopasowania =
    // zgłoszenie nieprzypisane (organizationId = null) i trafia do kolejki
    // widocznej dla Super Admina.
    //
    // Świadomie NIE ma tu dopasowania po nazwach ani fallbacku na pierwszą
    // organizację z listy — to właśnie ten fallback sprawiał, że zgłoszenie
    // z Krakowa czy Łącka lądowało w Powiecie Gorlickim.
    const allOrganizations = await prisma.organization.findMany({
      select: { id: true, name: true, type: true, boundary: true },
    });

    const boundaries: OrganizationBoundary[] = allOrganizations.flatMap((organization) => {
      const boundary = parseBoundary(organization.boundary);

      if (!boundary) return [];

      return [
        {
          id: organization.id,
          name: organization.name,
          type: organization.type,
          boundary,
        },
      ];
    });

    const bestOrg = findOrganizationForPoint(boundaries, lat, lng);

    const pointName = address || `Punkt (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

    const reportId = crypto.randomUUID();
    const uploadRoot = path.join(process.cwd(), "public", "uploads", reportId);

    try {
      const report = await prisma.report.create({
        data: {
          id: reportId,
          organizationId: bestOrg?.id ?? null,
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
        await sendReportConfirmation(reporterEmail, {
          reportNumber: getReportNumber(report.id),
          reporterName,
          placeName: pointName,
          address: address || null,
          latitude: lat,
          longitude: lng,
          description,
          organizationName: bestOrg?.name ?? null,
          createdAt: report.createdAt,
          photoCount: savedPhotos.length,
        });
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
      }

      return NextResponse.json(
        {
          success: true,
          reportId: report.id,
          reportNumber: getReportNumber(report.id),
          organizationName: bestOrg?.name ?? null,
          assigned: Boolean(bestOrg),
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
