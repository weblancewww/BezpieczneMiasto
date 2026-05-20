import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 hero-glow" />
      <div className="absolute -top-32 -left-24 w-80 h-80 rounded-full bg-primary/12 blur-3xl" />
      <div className="absolute top-1/2 -translate-y-1/2 left-1/4 w-72 h-72 rounded-full bg-accent/25 blur-3xl" />
      <div className="absolute -bottom-40 -right-28 w-[28rem] h-[28rem] rounded-full bg-secondary/45 blur-3xl" />
      <div className="absolute top-5 right-5 z-20">
        <ThemeToggle />
      </div>
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
