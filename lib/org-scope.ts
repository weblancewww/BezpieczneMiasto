/**
 * Zakres widoczności danych dla jednostki organizacyjnej.
 *
 * Powiat jest jednostką nadrzędną dla gmin ("Jednostka nadrzędna dla gmin
 * i raportowania w regionie"), więc administrator powiatu powinien widzieć
 * zgłoszenia, lokalizacje i konta swoich gmin — a nie wyłącznie te przypisane
 * wprost do powiatu.
 *
 * Ten sam zakres obowiązywał już w `/api/organizations` oraz przy przypisywaniu
 * zgłoszeń, ale listy zgłoszeń, lokalizacji i kont filtrowały tylko po własnym
 * `organizationId`. Efekt: admin powiatu widział 1 zgłoszenie na 10, mimo że
 * pozostałe 9 należało do podległych mu gmin.
 *
 * Zasada: SUPER_ADMIN — bez ograniczeń, ADMIN i MODERATOR — własna jednostka
 * plus wszystkie jednostki podrzędne.
 */
import { prisma } from "./prisma";

export type SessionUserScope = {
  role?: string | null;
  organizationId?: string | null;
};

/**
 * Id własnej jednostki i wszystkich jednostek podrzędnych (dowolna głębokość).
 *
 * Hierarchia jest płaska (powiat → gminy), więc pętla wykonuje zwykle jedno
 * zapytanie, ale schodzimy poziom po poziomie, żeby nie zaszywać założenia
 * o maksymalnie dwóch poziomach.
 */
export async function getOrganizationSubtreeIds(rootId: string): Promise<string[]> {
  const ids: string[] = [rootId];
  let frontier: string[] = [rootId];

  // Zabezpieczenie przed cyklem w danych — hierarchia ma maksymalnie kilka
  // poziomów, więc 16 iteracji to zapas bez ryzyka pętli nieskończonej.
  for (let depth = 0; depth < 16 && frontier.length > 0; depth++) {
    const children = await prisma.organization.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });

    const next = children
      .map((child) => child.id)
      .filter((id) => !ids.includes(id));

    if (next.length === 0) break;

    ids.push(...next);
    frontier = next;
  }

  return ids;
}

/**
 * Id organizacji widocznych dla użytkownika.
 *
 * Zwraca `null`, gdy użytkownik nie ma ograniczeń (SUPER_ADMIN) — wołający
 * powinien wtedy pominąć filtr `organizationId`.
 */
export async function getOrganizationScopeIds(
  user: SessionUserScope
): Promise<string[] | null> {
  if (user.role === "SUPER_ADMIN") return null;
  if (!user.organizationId) return [];
  if (user.role !== "ADMIN" && user.role !== "MODERATOR") return [user.organizationId];

  return getOrganizationSubtreeIds(user.organizationId);
}

/**
 * Czy organizacja mieści się w zakresie użytkownika.
 *
 * `organizationId = null` oznacza zgłoszenie nieprzypisane (poza wszystkimi
 * granicami) — takie może obsłużyć wyłącznie SUPER_ADMIN.
 */
export async function isWithinOrganizationScope(
  user: SessionUserScope,
  organizationId: string | null
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (!organizationId || !user.organizationId) return false;

  const scopeIds = await getOrganizationScopeIds(user);
  return scopeIds?.includes(organizationId) ?? false;
}
