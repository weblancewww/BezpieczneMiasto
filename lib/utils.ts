import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type ReportStatus = "NEW" | "ANALYSIS" | "IN_PROGRESS" | "RESOLVED"

export const reportStatusLabel: Record<ReportStatus, string> = {
  NEW: "Nowe",
  ANALYSIS: "Podjęte do analizy",
  IN_PROGRESS: "W trakcie rozwiązywania",
  RESOLVED: "Rozwiązane",
}

export function reportStatusClass(status: ReportStatus) {
  switch (status) {
    case "NEW":
      return "neo-pill status-new"
    case "ANALYSIS":
      return "neo-pill status-analysis"
    case "IN_PROGRESS":
      return "neo-pill status-in-progress"
    case "RESOLVED":
      return "neo-pill status-resolved"
  }
}
