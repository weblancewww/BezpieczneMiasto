export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(80% 60% at 50% 0%, color-mix(in oklch, var(--glow) 16%, transparent), transparent 70%)",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 440 }}>
        {children}
      </div>
    </div>
  );
}
