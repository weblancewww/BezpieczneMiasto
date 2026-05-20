"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MODERATOR";
  createdAt: string;
  organization: {
    id: string;
    name: string;
  };
};

type OrganizationOption = {
  id: string;
  name: string;
};

const roleLabels: Record<UserRow["role"], string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MODERATOR: "Moderator",
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "MODERATOR",
    organizationId: "",
  });

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const [usersResponse, organizationsResponse] = await Promise.all([
          fetch("/api/users", { cache: "no-store" }),
          fetch("/api/organizations", { cache: "no-store" }),
        ]);

        if (!usersResponse.ok) {
          throw new Error("Nie udało się pobrać użytkowników");
        }

        if (!organizationsResponse.ok) {
          throw new Error("Nie udało się pobrać organizacji");
        }

        const usersData = (await usersResponse.json()) as UserRow[];
        const organizationsData = (await organizationsResponse.json()) as OrganizationOption[];

        if (!active) {
          return;
        }

        setUsers(usersData);
        setOrganizations(organizationsData);
      } catch (error) {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : "Błąd ładowania";
        toast.error(message);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się utworzyć użytkownika");
      }

      setUsers((current) => [result.user, ...current]);
      setFormData({ name: "", email: "", password: "", role: "MODERATOR", organizationId: "" });
      toast.success("Użytkownik został utworzony");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Błąd zapisu";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Użytkownicy</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nowe konto</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-name">Imię i nazwisko</Label>
              <Input
                id="user-name"
                value={formData.name}
                onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={formData.email}
                onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">Hasło</Label>
              <Input
                id="user-password"
                type="password"
                value={formData.password}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">Rola</Label>
              <select
                id="user-role"
                value={formData.role}
                onChange={(event) => setFormData((current) => ({ ...current, role: event.target.value }))}
                className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="MODERATOR">Moderator</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="user-org">Organizacja</Label>
              <select
                id="user-org"
                value={formData.organizationId}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, organizationId: event.target.value }))
                }
                className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="">Domyślna (Twoja organizacja)</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Zapisywanie..." : "Utwórz użytkownika"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zarządzanie użytkownikami</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-600">Ładowanie użytkowników...</p>
          ) : users.length === 0 ? (
            <p className="text-slate-600">Brak użytkowników.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imię i nazwisko</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rola</TableHead>
                  <TableHead>Organizacja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{roleLabels[user.role]}</TableCell>
                    <TableCell>{user.organization.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
