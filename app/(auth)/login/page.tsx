"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(result.error || "Logowanie nie powiodło się");
      } else if (result?.ok) {
        toast.success("Zalogowano pomyślnie!");
        router.push("/");
        router.refresh();
      }
    } catch (error) {
      toast.error("Błąd podczas logowania");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full glass-panel rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="inline-flex items-center justify-center text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-3 py-1 mx-auto border border-primary/25">
          Panel Operacyjny
        </div>
        <CardTitle className="text-3xl font-bold text-center text-foreground">
          Bezpieczne Miasto
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          Zaloguj się do panelu administracyjnego
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? "Logowanie..." : "Zaloguj się"}
          </Button>
        </form>

        <div className="mt-6 p-4 rounded-xl text-sm text-muted-foreground border border-border bg-muted">
          <p className="font-semibold mb-2 text-foreground">Demo credentials:</p>
          <p>Email: admin@powiat.pl</p>
          <p>Hasło: password123</p>
        </div>
      </CardContent>
    </Card>
  );
}
