import { ReportWizard } from "@/components/public/report-wizard";

export const metadata = {
  title: "Zgłoś usterkę — Bezpieczne Miasto",
};

export default function ReportFromLocationPage() {
  return <ReportWizard mode="geolocation" />;
}
