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
3. Ustaw gałąź (np. `main`) i sposób budowania: **Docker Compose** — repo zawiera
	`docker-compose.yml`, z którego Coolify uruchomi dwa kontenery: `app` oraz `db`.
4. Nie ustawiaj własnych komend startowych. Kontener `app` ma entrypoint
	(`docker-entrypoint.sh`), który sam synchronizuje schemat bazy, a przy pierwszym
	starcie wypełnia ją danymi demonstracyjnymi.
5. **Nie używaj `npm run db:deploy`.** Projekt nie ma katalogu `prisma/migrations`,
	więc `prisma migrate deploy` nie ma czego wdrożyć, a na niepustej bazie kończy się
	błędem `P3005`. Schemat jest utrzymywany przez `prisma db push` w entrypoincie.
6. Ustaw port aplikacji: `3000`.
7. Dodaj domenę i HTTPS (Coolify/Traefik).
8. Dodaj zmienne środowiskowe wg `.env.example`. Klucz
	`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` oznacz jako **Build Variable** — jest on
	wbudowywany w aplikację na etapie budowania, więc jako zwykła zmienna runtime
	trafi tylko do serwera i mapa w przeglądarce się nie pojawi.
9. Dodaj Persistent Volume mapowany do ścieżki `/app/public/uploads`.
10. Wykonaj pierwszy deploy.

## Docker Compose (lokalnie lub na VPS)

1. Skopiuj `.env.docker.example` do `.env.docker` i ustaw własne wartości.
2. Uruchom stack:
	- `docker compose --env-file .env.docker up -d --build`
3. Aplikacja będzie dostępna pod `http://localhost:3000`.
4. Zatrzymanie stacka:
	- `docker compose --env-file .env.docker down`

### Co robi ten setup

1. Uruchamia MariaDB w kontenerze `db`.
2. Buduje i uruchamia aplikację Next.js w kontenerze `app`.
3. Przy starcie aplikacji synchronizuje schemat bazy (`prisma db push`) i przy
   pierwszym uruchomieniu zasila ją danymi demonstracyjnymi.
4. Zachowuje dane bazy i uploady w trwałych wolumenach Docker.
5. Sama komenda `docker compose` nie pobiera repo z GitHuba. Repo pobiera Coolify albo robisz `git clone`, a compose uruchamia już lokalny checkout.

### Unikalne katalogi danych

1. Domyślnie używane są ścieżki:
	- `./.docker-data/bezpieczne-miasto/mariadb`
	- `./.docker-data/bezpieczne-miasto/uploads`
2. Możesz je nadpisać zmiennymi `MARIADB_DATA_DIR` i `UPLOADS_DATA_DIR` w `.env.docker`.
3. Dzięki temu dane są trzymane w jasno nazwanych, oddzielnych katalogach.

### Pierwsze seedowanie danych (opcjonalnie)

1. `docker compose --env-file .env.docker exec app npm run db:seed`

## Uwagi bezpieczeństwa

1. Nie trzymaj prawdziwych sekretów w `.env` i `.env.local` w repo.
2. Po publikacji repo wygeneruj nowe hasła i klucze (DB, SMTP, NEXTAUTH_SECRET, Google API).
3. Ogranicz klucz Google Maps do domeny produkcyjnej.
