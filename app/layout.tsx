import type { Metadata } from "next";
import { Lato, Merriweather, Roboto_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AppSessionProvider } from "@/components/providers/session-provider";
import { AppThemeProvider } from "@/components/providers/theme-provider";
import "./globals.css";

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "700", "900"],
});

const merriweather = Merriweather({
  variable: "--font-merriweather",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Bezpieczne Miasto",
  description: "Aplikacja do zgłaszania usterek w przestrzeni publicznej",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning className={`${lato.variable} ${merriweather.variable} ${robotoMono.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased text-foreground">
        <AppThemeProvider>
          <AppSessionProvider>{children}</AppSessionProvider>
        </AppThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
