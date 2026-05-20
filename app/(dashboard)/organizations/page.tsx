"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AdminAreaPickerMap } from "@/components/map/admin-area-picker-map";
import { toast } from "sonner";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  type: "POWIAT" | "GMINA";
  parentId: string | null;
  description: string | null;
  adminArea: string | null;
  _count: {
    users: number;
    locations: number;
  };
};

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAreaOrgId, setEditingAreaOrgId] = useState<string | null>(null);
  const [editingAreaValue, setEditingAreaValue] = useState("");
  const [isAreaSaving, setIsAreaSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    type: "GMINA",
    parentId: "",
    description: "",
    adminArea: "",
  });

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const response = await fetch("/api/organizations", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Nie udało się pobrać organizacji");
        }

        const data = (await response.json()) as OrganizationRow[];

        if (!active) {
          return;
        }

        setOrganizations(data);
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

  const roots = useMemo(
    () => organizations.filter((org) => !org.parentId),
    [organizations]
  );

  const byParent = useMemo(() => {
    const map = new Map<string, OrganizationRow[]>();

    organizations.forEach((org) => {
      if (!org.parentId) {
        return;
      }

      const current = map.get(org.parentId) || [];
      current.push(org);
      map.set(org.parentId, current);
    });

    return map;
  }, [organizations]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          parentId: formData.parentId || undefined,
          slug: formData.slug.trim().toLowerCase(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się utworzyć organizacji");
      }

      setOrganizations((current) => [...current, result.organization]);
      setFormData({ name: "", slug: "", type: "GMINA", parentId: "", description: "", adminArea: "" });
      toast.success("Organizacja została utworzona");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Błąd zapisu";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  function openAreaEditor(organization: OrganizationRow) {
    setEditingAreaOrgId(organization.id);
    setEditingAreaValue(organization.adminArea || "");
  }

  function closeAreaEditor() {
    setEditingAreaOrgId(null);
    setEditingAreaValue("");
  }

  async function handleAreaSave(organizationId: string) {
    setIsAreaSaving(true);

    try {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminArea: editingAreaValue }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się zapisać obszaru");
      }

      setOrganizations((current) =>
        current.map((org) =>
          org.id === organizationId
            ? {
                ...org,
                adminArea: result.organization.adminArea,
              }
            : org
        )
      );

      toast.success("Obszar organizacji zaktualizowany");
      closeAreaEditor();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Błąd zapisu obszaru";
      toast.error(message);
    } finally {
      setIsAreaSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Organizacje</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nowa organizacja</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Nazwa</Label>
              <Input
                id="org-name"
                value={formData.name}
                onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={formData.slug}
                onChange={(event) => setFormData((current) => ({ ...current, slug: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-type">Typ</Label>
              <select
                id="org-type"
                value={formData.type}
                onChange={(event) => setFormData((current) => ({ ...current, type: event.target.value }))}
                className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="POWIAT">Powiat</option>
                <option value="GMINA">Gmina</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-parent">Organizacja nadrzędna</Label>
              <select
                id="org-parent"
                value={formData.parentId}
                onChange={(event) => setFormData((current) => ({ ...current, parentId: event.target.value }))}
                className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="">Brak</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="org-admin-area">Obszar (gminy/powiaty do auto-przypisania)</Label>
              <Input
                id="org-admin-area"
                value={formData.adminArea}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, adminArea: event.target.value }))
                }
                placeholder="np. Gmina Gorlice, Powiat Gorlicki"
              />
              <p className="text-xs text-muted-foreground">Nazwy oddzielone przecinkami – używane do automatycznego dopasowania zgłoszeń z mapy.</p>
              <AdminAreaPickerMap
                value={formData.adminArea}
                onChange={(value) =>
                  setFormData((current) => ({ ...current, adminArea: value }))
                }
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="org-description">Opis</Label>
              <Textarea
                id="org-description"
                value={formData.description}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            <div>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Zapisywanie..." : "Utwórz organizację"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hierarchia organizacji</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-600">Ładowanie organizacji...</p>
          ) : roots.length === 0 ? (
            <p className="text-slate-600">Brak organizacji.</p>
          ) : (
            <div className="space-y-4">
              {roots.map((root) => (
                <div key={root.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{root.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {root.type} · użytkownicy: {root._count.users} · lokalizacje: {root._count.locations}
                      </p>
                      {root.adminArea && (
                        <p className="text-xs text-muted-foreground">Obszar: {root.adminArea}</p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">/{root.slug}</span>
                  </div>

                  <div className="mt-3">
                    {editingAreaOrgId === root.id ? (
                      <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
                        <Label htmlFor={`edit-area-${root.id}`}>Obszar organizacji</Label>
                        <Input
                          id={`edit-area-${root.id}`}
                          value={editingAreaValue}
                          onChange={(event) => setEditingAreaValue(event.target.value)}
                          placeholder="np. Gmina Gorlice, Powiat Gorlicki"
                        />
                        <AdminAreaPickerMap value={editingAreaValue} onChange={setEditingAreaValue} />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={() => handleAreaSave(root.id)}
                            disabled={isAreaSaving}
                          >
                            {isAreaSaving ? "Zapisywanie..." : "Zapisz obszar"}
                          </Button>
                          <Button type="button" variant="outline" onClick={closeAreaEditor}>
                            Anuluj
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" onClick={() => openAreaEditor(root)}>
                        Edytuj obszar na mapie
                      </Button>
                    )}
                  </div>

                  {(byParent.get(root.id) || []).length > 0 && (
                    <div className="mt-3 space-y-2">
                      {(byParent.get(root.id) || []).map((child) => (
                        <div
                          key={child.id}
                          className="ml-4 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                        >
                          <p className="font-medium text-slate-800">{child.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {child.type} · użytkownicy: {child._count.users} · lokalizacje: {child._count.locations}
                          </p>
                          {child.adminArea && (
                            <p className="text-xs text-muted-foreground">Obszar: {child.adminArea}</p>
                          )}

                          <div className="mt-2">
                            {editingAreaOrgId === child.id ? (
                              <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
                                <Label htmlFor={`edit-area-${child.id}`}>Obszar organizacji</Label>
                                <Input
                                  id={`edit-area-${child.id}`}
                                  value={editingAreaValue}
                                  onChange={(event) => setEditingAreaValue(event.target.value)}
                                  placeholder="np. Gmina Gorlice, Powiat Gorlicki"
                                />
                                <AdminAreaPickerMap value={editingAreaValue} onChange={setEditingAreaValue} />
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    onClick={() => handleAreaSave(child.id)}
                                    disabled={isAreaSaving}
                                  >
                                    {isAreaSaving ? "Zapisywanie..." : "Zapisz obszar"}
                                  </Button>
                                  <Button type="button" variant="outline" onClick={closeAreaEditor}>
                                    Anuluj
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button type="button" variant="outline" onClick={() => openAreaEditor(child)}>
                                Edytuj obszar na mapie
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
