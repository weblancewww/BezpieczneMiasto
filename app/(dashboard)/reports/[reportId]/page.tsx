import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Camera, MapPin } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusForm } from "@/components/reports/status-form";
import type { ReportStatus } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nowe",
  ANALYSIS: "Podjęte do analizy",
  IN_PROGRESS: "W trakcie rozwiązywania",
  RESOLVED: "Rozwiązane",
};

const STATUS_CLASS: Record<string, string> = {
  NEW: "new",
  ANALYSIS: "analysis",
  IN_PROGRESS: "progress",
  RESOLVED: "resolved",
};

function formatDate(date: Date) {
  return new Date(date).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(date: Date) {
  return new Date(date).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function ReportDetailsPage(props: {
  params: Promise<{ reportId: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    redirect("/login");
  }

  const { reportId } = await props.params;
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      location: { include: { organization: true } },
      organization: true,
      photos: { orderBy: { createdAt: "desc" } },
      statusHistories: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { id: true, name: true, email: true } } },
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
  const status = report.status as ReportStatus;

  return (
    <>
      <section>
        <div className="toolbar">
          <Link className="btn btn-secondary btn-sm" href="/reports">
            <ArrowLeft size={15} />
            Wróć do listy
          </Link>
          <div className="spacer" />
          <span className="pill" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
            #{report.id.substring(0, 8).toUpperCase()}
          </span>
        </div>
      </section>

      <div className="detail-grid">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2>Szczegóły zgłoszenia</h2>
              <span className={`pill ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>
            </div>
            <div className="card-body stack" style={{ gap: 18 }}>
              <div>
                <div className="sec-title" style={{ margin: "0 0 10px" }}>
                  Opis problemu
                </div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {report.description}
                </p>
              </div>

              <dl className="kv">
                <dt>Miejsce</dt>
                <dd>{placeName}</dd>
                <dt>Adres</dt>
                <dd>{placeAddress}</dd>
                <dt>Jednostka</dt>
                <dd>{orgName}</dd>
                <dt>Data zgłoszenia</dt>
                <dd className="num">{formatDate(report.createdAt)}</dd>
                <dt>Współrzędne</dt>
                <dd className="num">
                  {report.reportLatitude !== null && report.reportLongitude !== null
                    ? `${report.reportLatitude.toFixed(5)}, ${report.reportLongitude.toFixed(5)}`
                    : report.location
                      ? `${report.location.latitude.toFixed(5)}, ${report.location.longitude.toFixed(5)}`
                      : "—"}
                </dd>
              </dl>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Załączone zdjęcia</h2>
              <span className="hint">{report.photos.length}</span>
            </div>
            <div className="card-body">
              {report.photos.length === 0 ? (
                <div className="photo-empty">
                  <Camera />
                  <span>Brak zdjęć dołączonych do tego zgłoszenia.</span>
                </div>
              ) : (
                <div
                  className="thumbs"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
                >
                  {report.photos.map((photo) => (
                    <a
                      key={photo.id}
                      href={photo.path}
                      target="_blank"
                      rel="noreferrer"
                      className="thumb"
                    >
                      <Image
                        src={photo.path}
                        alt={photo.filename}
                        width={400}
                        height={400}
                        unoptimized
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2>Zgłaszający</h2>
            </div>
            <div className="card-body">
              <dl className="kv">
                <dt>Osoba</dt>
                <dd>{report.reporterName}</dd>
                <dt>E-mail</dt>
                <dd style={{ overflowWrap: "anywhere" }}>{report.reporterEmail}</dd>
                <dt>Telefon</dt>
                <dd className="num">{report.reporterPhone || "—"}</dd>
              </dl>
              <div className="sec-title">Lokalizacja</div>
              <p className="hintline" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <MapPin size={15} style={{ color: "var(--accent)", flex: "none", marginTop: 3 }} />
                <span>
                  {placeName}, {placeAddress}
                </span>
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Historia statusów</h2>
              <span className="hint">{report.statusHistories.length}</span>
            </div>
            <div className="card-body">
              {report.statusHistories.length === 0 ? (
                <p className="hintline">Brak wpisów w historii statusów.</p>
              ) : (
                <ul className="timeline">
                  {report.statusHistories.map((history) => (
                    <li
                      key={history.id}
                      className={history.status === "RESOLVED" ? "done" : undefined}
                    >
                      <div className="tl-top">{STATUS_LABELS[history.status] || history.status}</div>
                      <div className="tl-meta">
                        {formatDay(history.createdAt)} · {history.changedBy.name}
                      </div>
                      {history.note ? <div className="tl-note">{history.note}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Zmień status</h2>
            </div>
            <div className="card-body">
              <StatusForm reportId={report.id} currentStatus={status} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
