"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Users as UsersIcon, X } from "lucide-react";
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

const ROLE_LABELS: Record<UserRow["role"], string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MODERATOR: "Moderator",
};

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
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

        if (active) {
          setUsers(usersData);
          setOrganizations(organizationsData);
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
      setIsModalOpen(false);
      toast.success("Konto zostało utworzone");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd zapisu");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section>
        <div className="toolbar">
          <span className="hintline num">{users.length} kont</span>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={17} />
            Nowe konto
          </button>
        </div>
      </section>

      <section className="card" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div className="empty">
            <p>Ładowanie użytkowników…</p>
          </div>
        ) : users.length === 0 ? (
          <div className="empty">
            <UsersIcon />
            <p>Brak użytkowników.</p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Osoba</th>
                <th>Rola</th>
                <th>Organizacja</th>
                <th>Utworzono</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ cursor: "default" }}>
                  <td>
                    <div className="t-main">{user.name}</div>
                    <div className="t-sub">{user.email}</div>
                  </td>
                  <td>
                    <span className="tag">{ROLE_LABELS[user.role]}</span>
                  </td>
                  <td>
                    <span className="t-sub" style={{ fontSize: 13 }}>
                      {user.organization?.name ?? "—"}
                    </span>
                  </td>
                  <td className="num-col" style={{ textAlign: "left", fontSize: 12.5 }}>
                    {formatDay(user.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className={`modal${isModalOpen ? " open" : ""}`} role="dialog" aria-modal="true">
        {isModalOpen ? (
          <>
            <div className="scrim" onClick={() => setIsModalOpen(false)} aria-hidden="true" />
            <div className="modal-card">
              <div className="modal-head">
                <div>
                  <h2>Nowe konto</h2>
                  <p>Konto zostanie utworzone w wybranej organizacji.</p>
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
                      <label htmlFor="user-name">Imię i nazwisko</label>
                      <input
                        id="user-name"
                        className="input"
                        placeholder="Jan Kowalski"
                        value={formData.name}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, name: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="user-email">E-mail</label>
                      <input
                        id="user-email"
                        className="input"
                        type="email"
                        placeholder="jan.kowalski@example.com"
                        value={formData.email}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, email: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="user-password">Hasło</label>
                      <input
                        id="user-password"
                        className="input"
                        type="password"
                        placeholder="minimum 8 znaków"
                        value={formData.password}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, password: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="user-role">Rola</label>
                      <select
                        id="user-role"
                        className="select"
                        value={formData.role}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, role: event.target.value }))
                        }
                      >
                        <option value="MODERATOR">Moderator</option>
                        <option value="ADMIN">Admin</option>
                        <option value="SUPER_ADMIN">Super Admin</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="user-org">Organizacja</label>
                      <select
                        id="user-org"
                        className="select"
                        value={formData.organizationId}
                        onChange={(event) =>
                          setFormData((current) => ({
                            ...current,
                            organizationId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Domyślna (Twoja organizacja)</option>
                        {organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.name}
                          </option>
                        ))}
                      </select>
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
                    {isSaving ? "Zapisywanie…" : "Utwórz konto"}
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
