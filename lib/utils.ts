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

export function reportStatusSelectClass(status: ReportStatus) {
  switch (status) {
    case "NEW":
      return "border-rose-700 bg-rose-700 text-white"
    case "ANALYSIS":
      return "border-amber-600 bg-amber-600 text-white"
    case "IN_PROGRESS":
      return "border-sky-700 bg-sky-700 text-white"
    case "RESOLVED":
      return "border-emerald-700 bg-emerald-700 text-white"
  }
}

export function reportStatusOptionClass(status: ReportStatus) {
  switch (status) {
    case "NEW":
      return "bg-rose-700 text-white focus:bg-rose-800 focus:text-white"
    case "ANALYSIS":
      return "bg-amber-600 text-white focus:bg-amber-700 focus:text-white"
    case "IN_PROGRESS":
      return "bg-sky-700 text-white focus:bg-sky-800 focus:text-white"
    case "RESOLVED":
      return "bg-emerald-700 text-white focus:bg-emerald-800 focus:text-white"
  }
}
