import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date) {
  return new Date(date).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusLabels: Record<string, string> = {
  NEW: "Nowe",
  ANALYSIS: "Podjęte do analizy",
  IN_PROGRESS: "W trakcie rozwiązywania",
  RESOLVED: "Rozwiązane",
};

export default async function ReportDetailsPage(
  props: { params: Promise<{ reportId: string }> }
) {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    redirect("/login");
  }

  const { reportId } = await props.params;
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      location: {
        include: {
          organization: true,
        },
      },
      organization: true,
      photos: {
        orderBy: { createdAt: "desc" },
      },
      statusHistories: {
        orderBy: { createdAt: "desc" },
        include: {
          changedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  if (!report) {
    notFound();
  }

  if (
    session.user.role !== "SUPER_ADMIN" &&
    report.organizationId !== session.user.organizationId
  ) {
    notFound();
  }

  const placeName = report.reportPlaceName || report.location?.name || "Punkt zgłoszenia";
  const placeAddress = report.reportAddress || report.location?.address || "Brak adresu";
  const orgName = report.organization?.name || report.location?.organization?.name || "Brak organizacji";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">
          Zgłoszenie #{report.id.substring(0, 8).toUpperCase()}
        </h1>
        <Link href="/reports">
          <Button variant="outline">Wróć do listy</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Szczegóły zgłoszenia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><strong>Status:</strong> {statusLabels[report.status] || report.status}</p>
              <p><strong>Data zgłoszenia:</strong> {formatDate(report.createdAt)}</p>
              <p><strong>Lokalizacja:</strong> {placeName}</p>
              <p><strong>Adres:</strong> {placeAddress}</p>
              <p><strong>Organizacja:</strong> {orgName}</p>
              <div>
                <p className="font-semibold mb-1">Opis problemu</p>
                <p className="text-slate-700 whitespace-pre-wrap">{report.description}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Załączone zdjęcia ({report.photos.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {report.photos.length === 0 ? (
                <p className="text-slate-600">Brak załączonych zdjęć.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {report.photos.map((photo) => (
                    <a
                      href={photo.path}
                      key={photo.id}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg overflow-hidden border border-slate-200"
                    >
                      <Image
                        src={photo.path}
                        alt={photo.filename}
                        width={800}
                        height={600}
                        className="w-full h-48 object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Zgłaszający</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Imię i nazwisko:</strong> {report.reporterName}</p>
              <p><strong>Email:</strong> {report.reporterEmail}</p>
              <p><strong>Telefon:</strong> {report.reporterPhone}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historia statusów</CardTitle>
            </CardHeader>
            <CardContent>
              {report.statusHistories.length === 0 ? (
                <p className="text-slate-600">Brak wpisów w historii statusów.</p>
              ) : (
                <div className="space-y-3">
                  {report.statusHistories.map((history) => (
                    <div key={history.id} className="rounded-md border border-slate-200 p-3">
                      <p className="font-semibold text-slate-900">
                        {statusLabels[history.status] || history.status}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(history.createdAt)}</p>
                      <p className="text-xs text-slate-600 mt-1">
                        Zmienił: {history.changedBy.name} ({history.changedBy.email})
                      </p>
                      {history.note && (
                        <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                          {history.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}