"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Landmark, MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AdminAreaPickerMap } from "@/components/map/admin-area-picker-map";

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
  const [isModalOpen, setIsModalOpen] = useState(false);
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

        if (active) {
          setOrganizations(data);
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Błąd ładowania");
        }
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

  const roots = useMemo(() => organizations.filter((org) => !org.parentId), [organizations]);

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
      setFormData({
        name: "",
        slug: "",
        type: "GMINA",
        parentId: "",
        description: "",
        adminArea: "",
      });
      setIsModalOpen(false);
      toast.success("Organizacja została utworzona");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd zapisu");
    } finally {
      setIsSaving(false);
    }
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
            ? { ...org, adminArea: result.organization.adminArea }
            : org
        )
      );

      toast.success("Obszar organizacji zaktualizowany");
      setEditingAreaOrgId(null);
      setEditingAreaValue("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd zapisu obszaru");
    } finally {
      setIsAreaSaving(false);
    }
  }

  function renderNode(org: OrganizationRow, isChild: boolean) {
    const Icon = org.type === "POWIAT" ? Landmark : Building2;
    const isEditing = editingAreaOrgId === org.id;

    return (
      <li key={org.id}>
        <div className="node">
          <span className="n-ico">
            <Icon />
          </span>
          <span className="n-main">
            <div className="n-name">
              {org.name}{" "}
              <span
                className={`tag ${org.type === "POWIAT" ? "type-POWIAT" : "type-GMINA"}`}
                style={{ marginLeft: 6 }}
              >
                {org.type === "POWIAT" ? "Powiat" : "Gmina"}
              </span>
            </div>
            <div className="n-desc">{org.description || "—"}</div>
            {org.adminArea ? (
              <div className="n-desc" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <MapPin size={12} style={{ color: "var(--accent)" }} />
                {org.adminArea}
              </div>
            ) : null}
          </span>
          <span className="n-meta">
            {org._count.users} kont · {org._count.locations} lok.
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (isEditing) {
                setEditingAreaOrgId(null);
                setEditingAreaValue("");
              } else {
                setEditingAreaOrgId(org.id);
                setEditingAreaValue(org.adminArea || "");
              }
            }}
          >
            {isEditing ? "Zamknij" : "Obszar"}
          </button>
        </div>

        {isEditing ? (
          <div style={{ padding: "4px 22px 20px 74px" }}>
            <div className="stack" style={{ gap: 12 }}>
              <div className="field">
                <label htmlFor={`area-${org.id}`}>Obszar organizacji</label>
                <input
                  id={`area-${org.id}`}
                  className="input"
                  value={editingAreaValue}
                  onChange={(event) => setEditingAreaValue(event.target.value)}
                  placeholder="np. Gmina Gorlice, Powiat Gorlicki"
                />
              </div>
              <AdminAreaPickerMap value={editingAreaValue} onChange={setEditingAreaValue} />
              <div className="inline justify-end">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingAreaOrgId(null);
                    setEditingAreaValue("");
                  }}
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isAreaSaving}
                  onClick={() => handleAreaSave(org.id)}
                >
                  <Check size={17} />
                  {isAreaSaving ? "Zapisywanie…" : "Zapisz obszar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!isChild && (byParent.get(org.id) || []).length > 0 ? (
          <ul className="tree child">
            {(byParent.get(org.id) || []).map((child) => renderNode(child, true))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <>
      <section>
        <div className="toolbar">
          <span className="hintline num">{organizations.length} organizacji</span>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={17} />
            Nowa organizacja
          </button>
        </div>
      </section>

      <section className="card" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div className="empty">
            <p>Ładowanie organizacji…</p>
          </div>
        ) : roots.length === 0 ? (
          <div className="empty">
            <Building2 />
            <p>Brak organizacji.</p>
          </div>
        ) : (
          <ul className="tree">{roots.map((root) => renderNode(root, false))}</ul>
        )}
      </section>

      <div className={`modal${isModalOpen ? " open" : ""}`} role="dialog" aria-modal="true">
        {isModalOpen ? (
          <>
            <div className="scrim" onClick={() => setIsModalOpen(false)} aria-hidden="true" />
            <div className="modal-card wide">
              <div className="modal-head">
                <div>
                  <h2>Nowa organizacja</h2>
                  <p>Dodaj powiat lub gminę do hierarchii.</p>
                </div>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label="Zamknij"
                  onClick={() => setIsModalOpen(false)}
                >
                  <X />
                </button>
              </div>
              <form onSubmit={handleCreate}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="field full">
                      <label htmlFor="org-name">Nazwa</label>
                      <input
                        id="org-name"
                        className="input"
                        placeholder="np. Gmina Gorlice"
                        value={formData.name}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, name: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="org-slug">Slug</label>
                      <input
                        id="org-slug"
                        className="input"
                        placeholder="gmina-gorlice"
                        value={formData.slug}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, slug: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="org-type">Typ</label>
                      <select
                        id="org-type"
                        className="select"
                        value={formData.type}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, type: event.target.value }))
                        }
                      >
                        <option value="GMINA">Gmina</option>
                        <option value="POWIAT">Powiat</option>
                      </select>
                    </div>
                    <div className="field full">
                      <label htmlFor="org-parent">Organizacja nadrzędna</label>
                      <select
                        id="org-parent"
                        className="select"
                        value={formData.parentId}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, parentId: event.target.value }))
                        }
                      >
                        <option value="">Brak</option>
                        {organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field full">
                      <label htmlFor="org-admin-area">Obszar (gminy/powiaty do auto-przypisania)</label>
                      <input
                        id="org-admin-area"
                        className="input"
                        placeholder="np. Gmina Gorlice, Powiat Gorlicki"
                        value={formData.adminArea}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, adminArea: event.target.value }))
                        }
                      />
                      <span className="hintline">
                        Nazwy oddzielone przecinkami – używane do automatycznego dopasowania zgłoszeń
                        z mapy.
                      </span>
                      <AdminAreaPickerMap
                        value={formData.adminArea}
                        onChange={(value) =>
                          setFormData((current) => ({ ...current, adminArea: value }))
                        }
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="org-description">Opis</label>
                      <textarea
                        id="org-description"
                        className="textarea"
                        value={formData.description}
                        onChange={(event) =>
                          setFormData((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-foot">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Anuluj
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSaving}>
                    <Check size={17} />
                    {isSaving ? "Zapisywanie…" : "Utwórz organizację"}
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
