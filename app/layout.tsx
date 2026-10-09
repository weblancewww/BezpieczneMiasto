import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { AppSessionProvider } from "@/components/providers/session-provider";
import "./globals.css";

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bezpieczne Miasto — Panel Operacyjny",
  description: "System zgłaszania i obsługi usterek w przestrzeni publicznej",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning className={`${workSans.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">
        <AppSessionProvider>{children}</AppSessionProvider>
        <Toaster theme="dark" position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
