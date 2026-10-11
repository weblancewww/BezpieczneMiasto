/**
 * Szablony maili do klientów.
 *
 * Klienty pocztowe są znacznie bardziej ograniczone niż przeglądarka, dlatego:
 *  - układ opieramy o tabele (Outlook nie rozumie flexboxa ani grida),
 *  - kolory podajemy w hex — `oklch()` i `color-mix()` nie są obsługiwane,
 *  - style wklejamy inline, bo część klientów obcina `<style>` z nagłówka,
 *  - mapę wysyłamy jako załącznik inline (CID), nie link do zasobu.
 *
 * Paleta jest przeliczona z tokenów `app/globals.css`, żeby mail wyglądał tak
 * samo jak panel (ciemny motyw, limonkowy akcent).
 */
import type { StaticMapImage } from "./map-image";

const COLOR = {
  pageBg: "#060604",
  cardBg: "#12100D",
  panelBg: "#1A1815",
  border: "#2F2E29",
  hairline: "#2B2926",
  fg: "#F4F3F0",
  muted: "#ADABA3",
  accent: "#EBEA97",
  accentInk: "#21200C",
} as const;

const FONT =
  "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

export type ReportStatus = "NEW" | "ANALYSIS" | "IN_PROGRESS" | "RESOLVED";

const STATUS_META: Record<
  ReportStatus,
  { label: string; color: string; background: string }
> = {
  NEW: { label: "Nowe", color: "#FDA0A3", background: "#3C2A28" },
  ANALYSIS: { label: "Podjęte do analizy", color: "#ECD386", background: "#393323" },
  IN_PROGRESS: { label: "W trakcie rozwiązywania", color: "#8CC4F4", background: "#283037" },
  RESOLVED: { label: "Rozwiązane", color: "#9DD8A9", background: "#2B3429" },
};

/** Kolejność i znaczenie statusów — sekcja „Co dalej?". */
const STATUS_FLOW: { status: ReportStatus; description: string }[] = [
  { status: "NEW", description: "Zgłoszenie trafiło do rejestru i czeka na przydział." },
  { status: "ANALYSIS", description: "Jednostka weryfikuje zgłoszenie i planuje działania." },
  { status: "IN_PROGRESS", description: "Trwają prace związane z usunięciem usterki." },
  { status: "RESOLVED", description: "Usterka została usunięta, zgłoszenie zamknięte." },
];

/** Treść zgłoszenia potrzebna do zbudowania wiadomości. */
export type ReportEmailContext = {
  reportNumber: string;
  reporterName: string;
  placeName: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  organizationName?: string | null;
  createdAt?: Date | null;
  photoCount?: number;
};

/** Zamienia znaki specjalne na encje. Treść pochodzi od mieszkańca, więc
 *  bez tego ktoś mógłby wstrzyknąć do maila własny HTML albo link. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Zamienia entery z opisu na łamania linii po escapowaniu. */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function formatDateTime(value?: Date | null): string | null {
  if (!value) return null;

  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // Bez tego data zależy od strefy serwera, a mieszkańcy są w Polsce.
    timeZone: "Europe/Warsaw",
  }).format(value);
}

function statusBadge(status: ReportStatus): string {
  const meta = STATUS_META[status];

  return `<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${meta.background};color:${meta.color};font-size:12px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap;">${meta.label}</span>`;
}

/** Znaczek marki — kropka w kolorze akcentu plus nazwa. Bez obrazka, żeby nie
 *  zależeć od zewnętrznego hostingu grafiki. */
function brandHeader(): string {
  return `
        <tr>
          <td style="padding:22px 28px;border-bottom:1px solid ${COLOR.hairline};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:11px;" valign="middle">
                  <div style="width:11px;height:11px;border-radius:50%;background:${COLOR.accent};"></div>
                </td>
                <td valign="middle">
                  <div style="font-size:15px;font-weight:600;color:${COLOR.fg};letter-spacing:-0.01em;font-family:${FONT};">
                    Bezpieczne Miasto
                  </div>
                  <div style="font-size:11px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:0.08em;font-family:${FONT};">
                    Panel operacyjny
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

/** Nagłówek sekcji — mała etykieta nad treścią. */
function sectionLabel(text: string): string {
  return `<div style="font-size:11px;font-weight:600;color:${COLOR.muted};text-transform:uppercase;letter-spacing:0.09em;padding-bottom:12px;font-family:${FONT};">${escapeHtml(text)}</div>`;
}

/** Lista szczegółów w formie tabeli: etykieta po lewej, wartość po prawej. */
function detailRows(rows: { label: string; value: string }[]): string {
  const cells = rows
    .map(
      (row, index) => `
                <tr>
                  <td style="padding:${index === 0 ? "0" : "11px"} 0 11px;border-top:${index === 0 ? "0" : `1px solid ${COLOR.hairline}`};font-size:13px;color:${COLOR.muted};font-family:${FONT};width:132px;vertical-align:top;">
                    ${escapeHtml(row.label)}
                  </td>
                  <td style="padding:${index === 0 ? "0" : "11px"} 0 11px;border-top:${index === 0 ? "0" : `1px solid ${COLOR.hairline}`};font-size:13.5px;color:${COLOR.fg};font-family:${FONT};vertical-align:top;">
                    ${row.value}
                  </td>
                </tr>`
    )
    .join("");

  return `
        <tr>
          <td style="padding:22px 28px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${cells}
            </table>
          </td>
        </tr>`;
}

/**
 * Mapa z podpisem. Gdy nie udało się jej pobrać, pokazujemy sam adres —
 * wiadomość nie może wyglądać na urwaną.
 */
function mapBlock(image: StaticMapImage | null, data: ReportEmailContext): string {
  const showAddress = Boolean(data.address && data.address !== data.placeName);
  const caption =
    escapeHtml(data.placeName) +
    (showAddress ? ` &middot; ${escapeHtml(data.address as string)}` : "");

  const coordinates =
    typeof data.latitude === "number" && typeof data.longitude === "number"
      ? `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`
      : null;

  const map = image
    ? `
            <img src="cid:${image.cid}"
                 alt="Mapa z lokalizacją zgłoszenia: ${captureAlt(data.placeName)}"
                 width="${image.width}" height="${image.height}"
                 style="display:block;width:100%;max-width:${image.width}px;height:auto;border:0;border-radius:14px;" />`
    : `
            <div style="padding:26px 18px;background:${COLOR.panelBg};border:1px solid ${COLOR.border};border-radius:14px;text-align:center;font-size:13px;color:${COLOR.muted};font-family:${FONT};">
              Podglądu mapy nie udało się dołączyć.
            </div>`;

  return `
        <tr>
          <td style="padding:22px 28px 0;">
            ${sectionLabel("Miejsce zgłoszenia")}
            ${map}
            <div style="padding:12px 2px 0;">
              <div style="font-size:13.5px;color:${COLOR.fg};font-family:${FONT};">
                <span style="color:${COLOR.accent};">&#9679;</span>
                ${caption}
              </div>
              ${
                coordinates
                  ? `<div style="font-size:12px;color:${COLOR.muted};font-family:${MONO};padding-top:4px;">${coordinates}</div>`
                  : ""
              }
            </div>
          </td>
        </tr>`;
}

/** Wartość atrybutu `alt` — bez cudzysłowów, żeby nie rozerwać znacznika. */
function captureAlt(value: string): string {
  return escapeHtml(value).replace(/"/g, "");
}

/** Numer zgłoszenia w monospace, w ramce — najważniejsza informacja w mailu. */
function ticketBox(reportNumber: string, status?: ReportStatus): string {
  return `
        <tr>
          <td style="padding:0 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.panelBg};border:1px solid ${COLOR.border};border-radius:14px;">
              <tr>
                <td style="padding:16px 18px;">
                  <div style="font-size:11px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:0.08em;padding-bottom:6px;font-family:${FONT};">
                    Numer zgłoszenia
                  </div>
                  <div style="font-size:22px;font-weight:600;color:${COLOR.accent};font-family:${MONO};letter-spacing:0.02em;">
                    #${escapeHtml(reportNumber)}
                  </div>
                </td>
                ${
                  status
                    ? `<td align="right" style="padding:16px 18px;" valign="top">${statusBadge(status)}</td>`
                    : ""
                }
              </tr>
            </table>
          </td>
        </tr>`;
}

/** Sekcja „Co dalej?" — wyjaśnia mieszkaniowi, co oznaczają statusy. */
function statusFlow(active: ReportStatus): string {
  const rows = STATUS_FLOW.map(({ status, description }) => {
    const meta = STATUS_META[status];
    const isActive = status === active;

    return `
                <tr>
                  <td style="width:18px;padding:0 12px 14px 0;" valign="top">
                    <div style="width:9px;height:9px;margin-top:4px;border-radius:50%;background:${isActive ? meta.color : COLOR.border};"></div>
                  </td>
                  <td style="padding:0 0 14px;font-family:${FONT};">
                    <span style="font-size:13px;font-weight:600;color:${isActive ? COLOR.fg : COLOR.muted};">${meta.label}</span>
                    <span style="font-size:12.5px;color:${COLOR.muted};"> — ${description}</span>
                  </td>
                </tr>`;
  }).join("");

  return `
        <tr>
          <td style="padding:22px 28px 6px;border-top:1px solid ${COLOR.hairline};">
            ${sectionLabel("Co dalej?")}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${rows}
            </table>
          </td>
        </tr>`;
}

function footer(): string {
  return `
        <tr>
          <td style="padding:20px 28px;border-top:1px solid ${COLOR.hairline};">
            <div style="font-size:12px;color:${COLOR.muted};line-height:1.6;font-family:${FONT};">
              Ta wiadomość została wysłana automatycznie — prosimy na nią nie odpowiadać.
              Status swojego zgłoszenia możesz potwierdzić w urzędzie, podając numer podany wyżej.
            </div>
          </td>
        </tr>`;
}

/** Pełny dokument HTML w ciemnym motywie panelu. */
function layout(options: { title: string; preheader: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${escapeHtml(options.title)}</title>
<style>
  /* Część klientów honoruje te reguły — dla pozostałych wszystko jest inline. */
  body { margin: 0; padding: 0; background: ${COLOR.pageBg}; }
  img { -ms-interpolation-mode: bicubic; }
  a { color: ${COLOR.accent}; }
  @media (max-width: 620px) {
    .wrap { width: 100% !important; }
    .pad { padding-left: 18px !important; padding-right: 18px !important; }
    .hero-title { font-size: 21px !important; }
    .detail-label { display: block !important; width: auto !important; padding-bottom: 4px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLOR.pageBg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.pageBg};font-size:1px;">
    ${escapeHtml(options.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.pageBg}" style="background:${COLOR.pageBg};">
    <tr>
      <td align="center" style="padding:28px 12px 32px;">
        <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.cardBg}" style="width:600px;max-width:600px;background:${COLOR.cardBg};border:1px solid ${COLOR.border};border-radius:20px;overflow:hidden;">
${options.body}
        </table>
        <div style="max-width:600px;padding:16px 12px 0;font-size:11px;color:${COLOR.muted};text-align:center;font-family:${FONT};">
          Bezpieczne Miasto &middot; zgłoszenia usterek i interwencji
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Składa listę szczegółów zgłoszenia (pomija puste pozycje). */
function reportDetails(data: ReportEmailContext, status: ReportStatus): string {
  const rows: { label: string; value: string }[] = [];

  rows.push({ label: "Miejsce", value: escapeHtml(data.placeName) });

  if (data.address && data.address !== data.placeName) {
    rows.push({ label: "Adres", value: escapeHtml(data.address) });
  }

  rows.push({
    label: "Jednostka",
    value: data.organizationName
      ? escapeHtml(data.organizationName)
      : `<span style="color:${COLOR.muted};">w trakcie przydziału do właściwej jednostki</span>`,
  });

  const createdAt = formatDateTime(data.createdAt);
  if (createdAt) {
    rows.push({ label: "Data zgłoszenia", value: escapeHtml(createdAt) });
  }

  rows.push({ label: "Status", value: statusBadge(status) });

  if (typeof data.photoCount === "number" && data.photoCount > 0) {
    rows.push({
      label: "Zdjęcia",
      value: `${data.photoCount} ${data.photoCount === 1 ? "załącznik" : "załączniki"}`,
    });
  }

  if (data.description) {
    rows.push({
      label: "Opis problemu",
      value: `<span style="line-height:1.6;">${escapeMultiline(data.description)}</span>`,
    });
  }

  return detailRows(rows);
}

/** Mail potwierdzający przyjęcie zgłoszenia. */
export function renderReportConfirmationEmail(
  data: ReportEmailContext,
  map: StaticMapImage | null
): string {
  const body = `
${brandHeader()}
        <tr>
          <td class="pad" style="padding:26px 28px 22px;">
            <div style="font-size:11px;font-weight:600;color:${COLOR.accent};text-transform:uppercase;letter-spacing:0.09em;font-family:${FONT};">
              Potwierdzenie zgłoszenia
            </div>
            <div class="hero-title" style="font-size:24px;font-weight:600;color:${COLOR.fg};letter-spacing:-0.02em;line-height:1.25;padding-top:10px;font-family:${FONT};">
              Dziękujemy za zgłoszenie!
            </div>
            <div style="font-size:14px;color:${COLOR.muted};line-height:1.65;padding-top:12px;font-family:${FONT};">
              Witaj ${escapeHtml(data.reporterName)}, przyjęliśmy Twoje zgłoszenie i przekazaliśmy je do właściwej jednostki. Zachowaj numer poniżej — posłuży do sprawdzenia statusu sprawy.
            </div>
          </td>
        </tr>
${ticketBox(data.reportNumber, "NEW")}
${mapBlock(map, data)}
        <tr>
          <td style="padding:22px 28px 4px;">
            ${sectionLabel("Szczegóły zgłoszenia")}
          </td>
        </tr>
${reportDetails(data, "NEW")}
${statusFlow("NEW")}
${footer()}`;

  return layout({
    title: `Potwierdzenie zgłoszenia #${data.reportNumber}`,
    preheader: `Przyjęliśmy zgłoszenie ${data.reportNumber} z lokalizacji ${data.placeName}.`,
    body,
  });
}

/** Mail informujący o zmianie statusu zgłoszenia. */
export function renderStatusUpdateEmail(
  data: ReportEmailContext & {
    newStatus: ReportStatus;
    previousStatus?: ReportStatus | null;
    note?: string | null;
  },
  map: StaticMapImage | null
): string {
  const previous = data.previousStatus
    ? `${statusBadge(data.previousStatus)}<span style="color:${COLOR.muted};padding:0 8px;font-size:14px;">&#8594;</span>`
    : "";

  const noteBlock = data.note
    ? `
        <tr>
          <td style="padding:18px 28px 4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.panelBg};border-left:3px solid ${COLOR.accent};border-radius:0 12px 12px 0;">
              <tr>
                <td style="padding:14px 16px;">
                  <div style="font-size:11px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:0.08em;padding-bottom:6px;font-family:${FONT};">
                    Notatka od jednostki
                  </div>
                  <div style="font-size:13.5px;color:${COLOR.fg};line-height:1.6;font-family:${FONT};">
                    ${escapeMultiline(data.note)}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : "";

  const body = `
${brandHeader()}
        <tr>
          <td class="pad" style="padding:26px 28px 20px;">
            <div style="font-size:11px;font-weight:600;color:${COLOR.accent};text-transform:uppercase;letter-spacing:0.09em;font-family:${FONT};">
              Aktualizacja zgłoszenia
            </div>
            <div class="hero-title" style="font-size:24px;font-weight:600;color:${COLOR.fg};letter-spacing:-0.02em;line-height:1.25;padding-top:10px;font-family:${FONT};">
              Status Twojej sprawy się zmienił
            </div>
            <div style="font-size:14px;color:${COLOR.muted};line-height:1.65;padding-top:12px;font-family:${FONT};">
              Witaj ${escapeHtml(data.reporterName)}, poniżej znajdziesz nowy stan zgłoszenia oraz szczegóły sprawy.
            </div>
          </td>
        </tr>
${ticketBox(data.reportNumber, data.newStatus)}
        <tr>
          <td style="padding:16px 28px 0;">
            <div style="font-size:12px;color:${COLOR.muted};padding-bottom:8px;font-family:${FONT};">
              Zmiana statusu
            </div>
            <div style="font-size:0;">${previous}${statusBadge(data.newStatus)}</div>
          </td>
        </tr>
${noteBlock}
${mapBlock(map, data)}
        <tr>
          <td style="padding:22px 28px 4px;">
            ${sectionLabel("Szczegóły zgłoszenia")}
          </td>
        </tr>
${reportDetails(data, data.newStatus)}
${statusFlow(data.newStatus)}
${footer()}`;

  return layout({
    title: `Aktualizacja zgłoszenia #${data.reportNumber}`,
    preheader: `Zgłoszenie ${data.reportNumber}: nowy status — ${STATUS_META[data.newStatus].label}.`,
    body,
  });
}
