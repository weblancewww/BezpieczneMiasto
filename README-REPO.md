# Bezpieczne Miasto

Aplikacja Next.js do zarządzania zgłoszeniami, lokalizacjami i organizacjami (gminy/powiaty) z mapą Google, Prisma, NextAuth, Tailwind, MariaDB.

## Wymagania produkcyjne

1. Node.js 20+
2. Baza MariaDB/MySQL
3. Poprawnie ustawione zmienne środowiskowe (patrz `.env.example`)
4. Trwały storage dla katalogu uploadów `public/uploads`

## Start

1. Skonfiguruj `.env.local` z kluczami do bazy i Google Maps.
2. `npm install`
3. `npx prisma db push && npx prisma db seed`
4. `npm run dev`

Repozytorium zostało zainicjowane lokalnie (`git init`).

---

Jeśli chcesz wrzucić repo na GitHub:

1. Stwórz nowe repo na github.com
2. Skopiuj polecenia z sekcji "push an existing repository..."
3. Dodaj `.env.local` do `.gitignore` (nie wrzucaj kluczy!)

## Deploy na Coolify

1. Wgraj repo na GitHub/GitLab.
2. W Coolify wybierz New Resource -> Application -> From Git Repository.
3. Ustaw gałąź (np. `main`) i typ builda: Nixpacks (Node).
4. Ustaw komendy:
	- Install Command: `npm ci`
	- Build Command: `npm run build`
	- Start Command: `npm run db:deploy && npm run start`
5. Ustaw port aplikacji: `3000`.
6. Dodaj domenę i HTTPS (Coolify/Traefik).
7. Dodaj wszystkie zmienne środowiskowe z pliku `.env.example`.
8. Dodaj Persistent Volume mapowany do ścieżki `/app/public/uploads`.
9. Wykonaj pierwszy deploy.

## Uwagi bezpieczeństwa

1. Nie trzymaj prawdziwych sekretów w `.env` i `.env.local` w repo.
2. Po publikacji repo wygeneruj nowe hasła i klucze (DB, SMTP, NEXTAUTH_SECRET, Google API).
3. Ogranicz klucz Google Maps do domeny produkcyjnej.
