"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map as GoogleMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  Check,
  ChevronLeft,
  Construction,
  Droplets,
  Footprints,
  Info,
  Leaf,
  Lightbulb,
  MapPin,
  Plus,
  Shield,
  X,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { id: "Nawierzchnia i drogi", icon: Construction },
  { id: "Oświetlenie", icon: Lightbulb },
  { id: "Chodnik i przejścia", icon: Footprints },
  { id: "Zieleń i czystość", icon: Leaf },
  { id: "Wodno-kanalizacyjne", icon: Droplets },
  { id: "Inne", icon: Info },
] as const;

const STATUS_STEPS = [
  { label: "Nowe", cls: "new", desc: "czeka na przyjęcie przez jednostkę." },
  { label: "Podjęte do analizy", cls: "analysis", desc: "trwa ocena i przypisanie do realizacji." },
  { label: "W trakcie rozwiązywania", cls: "progress", desc: "trwają prace naprawcze." },
  { label: "Rozwiązane", cls: "resolved", desc: "usterka została usunięta." },
];

export type WizardLocation = {
  name: string;
  organizationName: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
};

type Props = {
  mode: "qr" | "geolocation";
  qrToken?: string;
  initialLocation?: WizardLocation | null;
};

type Photo = { file: File; url: string };

function WizardInner({ mode, qrToken, initialLocation }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const geocodingLib = useMapsLibrary("geocoding");

  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [location, setLocation] = useState<WizardLocation | null>(initialLocation ?? null);
  const [geoError, setGeoError] = useState("");
  const [isLocating, setIsLocating] = useState(mode === "geolocation");
  const [geoResult, setGeoResult] = useState<{
    key: number;
    address: string;
    areas: string[];
  } | null>(null);

  const [showErrors, setShowErrors] = useState(false);
  const [ticket, setTicket] = useState<{ number: string; organization: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const photosRef = useRef<Photo[]>([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    },
    []
  );

  /* ---------- geolokalizacja ---------- */
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Twoja przeglądarka nie wspiera geolokalizacji.");
      setIsLocating(false);
      return;
    }

    setGeoError("");
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation((current) => ({
          name: current?.name ?? "Twoja lokalizacja",
          organizationName: current?.organizationName ?? "",
          address: current?.address ?? "",
          ...coords,
        }));
        setGeoResult(null);
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGeoError("Brak zgody na lokalizację. Zezwól na dostęp i spróbuj ponownie.");
          return;
        }
        setGeoError("Nie udało się pobrać Twojej lokalizacji.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, []);

  useEffect(() => {
    if (mode !== "geolocation") return;
    queueMicrotask(() => requestLocation());
  }, [mode, requestLocation]);

  useEffect(() => {
    if (mode !== "geolocation" || !location?.latitude || !location?.longitude || !geocodingLib) {
      return;
    }

    const key = location.latitude + location.longitude;
    const geocoder = new geocodingLib.Geocoder();
    let cancelled = false;

    geocoder.geocode(
      { location: { lat: location.latitude, lng: location.longitude } },
      (results, status) => {
        if (cancelled) return;

        if (status === "OK" && results && results.length > 0) {
          const result = results[0];
          const areas = result.address_components
            .filter(
              (component) =>
                component.types.includes("administrative_area_level_2") ||
                component.types.includes("administrative_area_level_3") ||
                component.types.includes("locality") ||
                component.types.includes("sublocality")
            )
            .map((component) => component.long_name);

          setGeoResult({ key, address: result.formatted_address ?? "", areas });
          setLocation((current) =>
            current
              ? {
                  ...current,
                  name: areas[0] ?? current.name,
                  address: result.formatted_address ?? current.address,
                }
              : current
          );
          return;
        }

        setGeoResult({ key, address: "", areas: [] });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [mode, location?.latitude, location?.longitude, geocodingLib]);

  const geocodedAreas = useMemo(
    () => (geoResult && location && geoResult.key === location.latitude! + location.longitude! ? geoResult.areas : []),
    [geoResult, location]
  );
  const address =
    geoResult && location && geoResult.key === location.latitude! + location.longitude!
      ? geoResult.address
      : location?.address ?? "";

  /* ---------- walidacja ---------- */
  const descTooShort = description.trim().length < 10;
  const emailInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  function validateStep(current: number) {
    if (current === 1) return Boolean(category);
    if (current === 2) return !descTooShort;
    if (current === 3) return Boolean(name.trim()) && !emailInvalid && consent;
    return true;
  }

  function next() {
    if (!validateStep(step)) {
      setShowErrors(true);
      return;
    }

    setShowErrors(false);
    setStep((current) => Math.min(current + 1, 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setShowErrors(false);
    setStep((current) => Math.max(current - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, Math.max(0, 5 - photos.length));
    setPhotos((current) => [
      ...current,
      ...next.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  }

  function removePhoto(url: string) {
    setPhotos((current) => {
      const target = current.find((photo) => photo.url === url);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((photo) => photo.url !== url);
    });
  }

  async function submit() {
    if (!validateStep(3)) {
      setShowErrors(true);
      return;
    }

    if (mode === "geolocation" && (!location?.latitude || !location?.longitude)) {
      toast.error("Najpierw udostępnij lokalizację.");
      return;
    }

    setSubmitting(true);

    try {
      const descriptionWithCategory = `[${category}] ${description.trim()}`;
      const payload = new FormData();
      payload.append("reporterName", name.trim());
      payload.append("reporterEmail", email.trim());
      payload.append("reporterPhone", phone.trim());
      payload.append("description", descriptionWithCategory);
      photos.forEach((photo) => payload.append("photos", photo.file));

      let endpoint = "/api/reports";

      if (mode === "qr") {
        payload.append("qrToken", qrToken ?? "");
      } else {
        endpoint = "/api/reports/from-map";
        payload.append("lat", String(location!.latitude));
        payload.append("lng", String(location!.longitude));
        payload.append("address", address);
        payload.append("geocodedAreas", JSON.stringify(geocodedAreas));
      }

      const response = await fetch(endpoint, { method: "POST", body: payload });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się wysłać zgłoszenia");
      }

      setTicket({
        number: result.reportNumber ?? "—",
        organization: result.organizationName ?? location?.organizationName ?? "",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd wysyłania zgłoszenia");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setTicket(null);
    setStep(1);
    setCategory(null);
    setDescription("");
    setPhotos([]);
    setName("");
    setEmail("");
    setPhone("");
    setConsent(false);
    setShowErrors(false);
  }

  const progress = step === 1 ? 33 : step === 2 ? 66 : 100;
  const hasCoordinates = Boolean(location?.latitude && location?.longitude);

  /* ---------- widok sukcesu ---------- */
  if (ticket) {
    return (
      <div className="done on">
        <div className="sico">
          <Check />
        </div>
        <h2>Zgłoszenie przyjęte</h2>
        <p>
          Dziękujemy. Twoje zgłoszenie zostało zarejestrowane i przekazane do właściwej jednostki.
        </p>
        <div className="ticket">
          <span className="tl">Numer zgłoszenia</span>
          <span className="tv">#{ticket.number}</span>
        </div>
        {ticket.organization ? (
          <p className="hintline" style={{ marginTop: -6, marginBottom: 18 }}>
            Jednostka: {ticket.organization}
          </p>
        ) : null}
        <div className="statuscard">
          <div className="sc-head">
            <b>Przebieg zgłoszenia</b>
            <span>Nowe</span>
          </div>
          <div className="sc-track">
            <span className="sc-fill" style={{ width: "8%" }} />
          </div>
          <div className="steps-mini">
            {STATUS_STEPS.map((status) => (
              <div className="sm" key={status.cls}>
                <span className="d" style={{ background: `var(--${status.cls})` }} />
                <span>
                  <b>{status.label}</b> — {status.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
        <button className="btn btn-ghost" type="button" onClick={reset}>
          Zgłoś kolejną usterkę
        </button>
      </div>
    );
  }

  return (
    <>
      <header className="appbar">
        <div className="appbar-in">
          <div className="brand">
            <span className="logo">
              <Shield />
            </span>
            <div>
              <div className="bn">Bezpieczne Miasto</div>
              <div className="bs">{location?.organizationName || "Zgłoszenie usterki"}</div>
            </div>
          </div>
          <span className="spacer" />
        </div>
        <div className="prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Postęp zgłoszenia">
          <div className="prog-head">
            <span className="pl">Krok {step} z 3</span>
            <span className="pp">{progress}%</span>
          </div>
          <div className="prog-track">
            <i className="prog-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <main className="stage">
        {step === 1 ? (
          <section className="step anim-f">
            <div className="shead">
              <div className="kicker">Krok 1 z 3</div>
              <h1>Co chcesz zgłosić?</h1>
              <p>Wybierz kategorię usterki — zgłoszenie trafi automatycznie do właściwej gminy.</p>
            </div>

            <div className="hero-card">
              <HeroMap
                hasCoordinates={hasCoordinates}
                latitude={location?.latitude ?? null}
                longitude={location?.longitude ?? null}
                apiKey={apiKey}
              />
              <div className="hero-body">
                <span className="hlab">Punkt zgłoszenia</span>
                <span className="hname">
                  {isLocating
                    ? "Ustalanie lokalizacji…"
                    : location?.name || "Punkt zgłoszenia"}
                </span>
                {location?.organizationName ? (
                  <span className="hero-chip">
                    <MapPin />
                    {location.organizationName}
                  </span>
                ) : null}
              </div>
            </div>

            {mode === "geolocation" ? (
              <div className="bare">
                <div className="bare" style={{ marginTop: 12 }}>
                  <p className="hintline" style={{ marginTop: 0 }}>
                    {geoError ? geoError : address || "Adres zostanie ustalony automatycznie."}
                  </p>
                  <div className="inline" style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-ghost" onClick={requestLocation}>
                      <MapPin />
                      Zmień lokalizację
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="bare">
              <span className="fieldlabel">
                Kategoria usterki <span className="opt">— wybierz jedną</span>
              </span>
              <div className="cats">
                {CATEGORIES.map((item) => {
                  const Icon = item.icon;
                  const isOn = category === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`cat${isOn ? " on" : ""}`}
                      aria-pressed={isOn}
                      onClick={() => {
                        setCategory(item.id);
                        setShowErrors(false);
                      }}
                    >
                      <span className="check">
                        <Check />
                      </span>
                      <span className="ico">
                        <Icon />
                      </span>
                      {item.id}
                    </button>
                  );
                })}
              </div>
              {showErrors && !category ? (
                <span className="err" style={{ display: "block" }}>
                  Wybierz kategorię usterki.
                </span>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="step anim-f">
            <div className="shead">
              <div className="kicker">Krok 2 z 3</div>
              <h1>Opisz usterkę</h1>
              <p>
                Im więcej szczegółów, tym szybciej jednostka zajmie się sprawą. Zdjęcie jest
                opcjonalne, ale bardzo pomaga.
              </p>
            </div>

            <div className="bare">
              <div className={`field${showErrors && descTooShort ? " invalid" : ""}`}>
                <label htmlFor="desc">Opis usterki</label>
                <textarea
                  id="desc"
                  className="textarea"
                  maxLength={600}
                  placeholder="Np. latarnia przy przejściu dla pieszych nie świeci od kilku dni. Teren jest ciemny wieczorem…"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <div className="counter">
                  <span>{description.length}</span>/600
                </div>
                <span className="err">Opisz usterkę w co najmniej 10 znakach.</span>
              </div>
            </div>

            <div className="bare">
              <span className="fieldlabel">
                Zdjęcie <span className="opt">— opcjonalnie, do 5 plików</span>
              </span>
              <label className="drop" htmlFor="files">
                <span className="cico">
                  <Plus />
                </span>
                <b>Zrób lub wybierz zdjęcie</b>
                <span>JPG lub PNG, maks. 5 MB każdy plik</span>
                <input
                  ref={fileInputRef}
                  className="sr"
                  type="file"
                  id="files"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    addPhotos(event.target.files);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
              </label>
              <div className="thumbs">
                {photos.map((photo) => (
                  <div className="thumb" key={photo.url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={photo.file.name} />
                    <button type="button" onClick={() => removePhoto(photo.url)} aria-label="Usuń zdjęcie">
                      <X />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="step anim-f">
            <div className="shead">
              <div className="kicker">Krok 3 z 3</div>
              <h1>Jak się z Tobą skontaktować?</h1>
              <p>Dane posłużą wyłącznie do kontaktu w sprawie tego zgłoszenia.</p>
            </div>

            <div className="card card-pad">
              <div className="fieldlabel" style={{ marginBottom: 16 }}>
                Podsumowanie zgłoszenia
              </div>
              <div className="metarow">
                <div className="m">
                  <div className="ml">Punkt</div>
                  <div className="mv">{location?.name || "Punkt zgłoszenia"}</div>
                </div>
                <div className="m">
                  <div className="ml">Kategoria</div>
                  <div className="mv">{category || "—"}</div>
                </div>
                <div className="m">
                  <div className="ml">Jednostka</div>
                  <div className="mv">{location?.organizationName || "Zostanie ustalona"}</div>
                </div>
              </div>
            </div>

            <div className="card card-pad">
              <p className="reqnote">
                Pola oznaczone <b>*</b> są wymagane.
              </p>

              <div className={`field${showErrors && !name.trim() ? " invalid" : ""}`}>
                <label htmlFor="name">
                  Imię i nazwisko <b style={{ color: "var(--new)" }}>*</b>
                </label>
                <input
                  id="name"
                  className="input"
                  placeholder="Jan Kowalski"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <span className="err">Podaj imię i nazwisko.</span>
              </div>

              <div className={`field${showErrors && emailInvalid ? " invalid" : ""}`}>
                <label htmlFor="email">
                  E-mail <b style={{ color: "var(--new)" }}>*</b>
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  inputMode="email"
                  placeholder="jan.kowalski@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <span className="err">Podaj poprawny adres e-mail.</span>
              </div>

              <div className="field">
                <label htmlFor="phone">
                  Telefon <span className="opt">— opcjonalnie</span>
                </label>
                <input
                  id="phone"
                  className="input"
                  type="tel"
                  inputMode="tel"
                  placeholder="512 340 118"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <div className={`consent${showErrors && !consent ? " invalid" : ""}`}>
                  <input
                    type="checkbox"
                    id="rodo"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <label htmlFor="rodo">
                    Wyrażam zgodę na przetwarzanie moich danych w celu obsługi zgłoszenia.
                    Administratorem danych jest właściwa jednostka samorządu.
                  </label>
                </div>
                {showErrors && !consent ? (
                  <span className="err" style={{ display: "block" }}>
                    Zgoda jest wymagana do wysłania zgłoszenia.
                  </span>
                ) : null}
              </div>
            </div>

            <div className="foot">
              <span>Bezpieczne Miasto — publiczny formularz zgłoszenia usterki.</span>
            </div>
          </section>
        ) : null}
      </main>

      <div className="actionbar">
        <div className="actionbar-in">
          {step > 1 ? (
            <button className="btn btn-icon" type="button" onClick={back} aria-label="Wróć do poprzedniego kroku">
              <ChevronLeft />
            </button>
          ) : null}
          {step < 3 ? (
            <button className="btn btn-primary" type="button" onClick={next}>
              Dalej
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={submit} disabled={submitting}>
              {submitting ? "Wysyłanie…" : "Wyślij zgłoszenie"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function HeroMap({
  hasCoordinates,
  latitude,
  longitude,
  apiKey,
}: {
  hasCoordinates: boolean;
  latitude: number | null;
  longitude: number | null;
  apiKey?: string;
}) {
  if (!apiKey || !hasCoordinates || latitude === null || longitude === null) {
    return (
      <div className="hero-map" aria-hidden="true">
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(90% 70% at 30% 10%, color-mix(in oklch, var(--accent) 14%, transparent), transparent 60%), var(--surface-2)",
          }}
        />
        <span className="scrim" />
        <span className="hpin" />
      </div>
    );
  }

  return (
    <div className="hero-map" aria-hidden="true">
      <GoogleMap
        defaultCenter={{ lat: latitude, lng: longitude }}
        defaultZoom={16}
        mapId="public-report-map"
        gestureHandling="none"
        disableDefaultUI
        clickableIcons={false}
        disableDoubleClickZoom
        keyboardShortcuts={false}
        style={{ width: "100%", height: "100%" }}
      />
      <span className="scrim" />
      <span className="hpin" />
    </div>
  );
}

export function ReportWizard(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return (
    <div className="cm-public">
      <APIProvider apiKey={apiKey || "missing-key"}>
        <WizardInner {...props} />
      </APIProvider>
    </div>
  );
}
