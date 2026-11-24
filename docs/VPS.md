# MCPLinker na własnym serwerze (VPS, Coolify, PostgreSQL)

Ten tryb uruchamia MCPLinker bez Vercel i bez Supabase. Potrzebne są dwa elementy: aplikacja (Node 22+) i zwykła baza PostgreSQL 13+. Tryb włącza zmienna `DATABASE_URL`. Bez niej aplikacja działa jak dotąd z Supabase, więc ta sama gałąź `main` obsługuje obie instalacje.

## Co zastępuje Supabase

| Funkcja | Supabase (Vercel) | Własny serwer |
|---|---|---|
| Baza danych | PostgREST | bezpośrednie zapytania SQL (`lib/pg.mjs`), te same tabele i funkcje |
| Logowanie do panelu | Supabase Auth | własne: hasło scrypt, sesje z haszowanymi tokenami (`lib/local-auth.mjs`) |
| Pliki dla Instagrama | Supabase Storage | tabele `media` i `media_chunks`, adres `APP_URL/media/<rodzaj>/<rrrr-mm>/<uuid>.<roz>` z obsługą `Range` |
| Harmonogram | Supabase Cron co minutę + Vercel Cron | wbudowany w aplikację, co minutę (`instrumentation.ts`, `lib/boot.mjs`) |
| Schemat | `supabase/schema.sql` ręcznie | migracje wykonywane automatycznie przy starcie (`lib/pg-schema.mjs`) |

Pliki są w bazie, więc jedna kopia bazy obejmuje wszystkie dane. Limit pliku: zdjęcie 8 MB, film 200 MB.

## Wdrożenie w Coolify

1. **Baza:** PostgreSQL w projekcie aplikacji, bez publicznego portu. Wewnętrzny adres połączenia (Postgres URL, internal) z panelu bazy wpisz w `DATABASE_URL` aplikacji.
2. **Aplikacja:** repozytorium `picabela/mcplinker`, gałąź `main`, Nixpacks, port `3000`, domena np. `https://mcplinker.picabela.pl`. `npm start` nasłuchuje na `0.0.0.0:${PORT:-3000}`. Healthcheck: `GET /api/status` (zawsze 200; pole `configured` mówi, czy zmienne są kompletne).
3. **Zmienne środowiskowe aplikacji** (wpisuj w panelu Coolify, nigdy w repozytorium ani w czacie):

| Zmienna | Wartość |
|---|---|
| `APP_URL` | `https://mcplinker.picabela.pl` |
| `APP_OWNER_EMAIL` | adres właściciela, ten sam co dotąd |
| `DATABASE_URL` | wewnętrzny adres bazy z Coolify |
| `ENCRYPTION_KEY` | **ten sam co w dotychczasowej instalacji**, inaczej zapisane tokeny Facebooka, Instagrama i WordPressa nie dadzą się odczytać |
| `CRON_SECRET` | nowy losowy sekret (używany tylko przez `/api/cron`) |
| `META_API_VERSION`, `LINKEDIN_API_VERSION`, `MCP_ALLOWED_REDIRECT_URIS`, `WORDPRESS_ALLOWED_HOSTS` | jak w dotychczasowej instalacji, jeśli były ustawione |
| `SOURCE_SUPABASE_URL` | adres poprzedniego projektu Supabase (tylko do kopiowania danych) |
| `SOURCE_SUPABASE_SERVICE_ROLE_KEY` | Secret key poprzedniego projektu (Supabase → Project Settings → API Keys) |
| `SOURCE_SUPABASE_PUBLISHABLE_KEY` | opcjonalnie: publiczny klucz poprzedniego projektu (pierwsze logowanie) |

Nie ustawiaj `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` ani `SUPABASE_SERVICE_ROLE_KEY` w tej instalacji.

## Kopiowanie danych z poprzedniej instalacji

Przy pierwszym starcie z pustą bazą i ustawionymi `SOURCE_SUPABASE_*` aplikacja sama kopiuje:

- konta (z tymi samymi identyfikatorami),
- marki, połączenia (zaszyfrowane tokeny), konfigurację aplikacji Meta i LinkedIn,
- wpisy, bibliotekę mediów, automatyzacje, historię działań i klucze API,
- pliki z Supabase Storage użyte we wpisach i bibliotece, z przepisaniem adresów na nowy serwer.

Tryb **kopia** (domyślny, `IMPORT_MODE=copy`): stara instalacja dalej publikuje, więc w kopii zaplanowane i oczekujące wpisy stają się szkicami, a automatyzacje są wyłączone. Nic nie wyjdzie dwa razy.

Hasło: Supabase nie udostępnia haseł. Przy pierwszym logowaniu nowa instalacja sprawdza hasło w poprzednim projekcie i zapisuje je lokalnie. Zaloguj się więc raz, zanim wyłączysz poprzedni projekt Supabase. Gdy ustawione jest `SOURCE_SUPABASE_URL`, rejestracja nowego konta jest wyłączona: konto właściciela pochodzi z kopii.

Bez kopiowania (nowa, pusta instalacja) konto właściciela zakłada pierwsza rejestracja adresem `APP_OWNER_EMAIL`; kolejne rejestracje są odrzucane. Załóż je od razu po pierwszym wdrożeniu.

Nie są kopiowane połączenia agentów AI (ChatGPT, Claude): ich tokeny są przypisane do starego adresu. Konektor dodaje się ponownie z adresem `https://mcplinker.picabela.pl/mcp`.

Stan kopiowania: `GET /api/status` (pole `import`) i panel **Ustawienia → Kopia z Supabase**.

## Dwie instalacje naraz i przełączenie

- Obie instalacje mogą działać równolegle na różnych domenach. Mają osobne dane od chwili kopiowania.
- W aplikacji Meta dopisz (nie zamieniaj) domenę i adresy przekierowań nowej instalacji: `https://mcplinker.picabela.pl/api/connect/facebook/callback` i `https://mcplinker.picabela.pl/api/connect/instagram/callback`; w LinkedIn `https://mcplinker.picabela.pl/api/connect/linkedin/callback`. Potrzebne tylko do łączenia nowych kont: skopiowane połączenia działają bez tego.
- W rozmowie z AI włączaj jeden konektor naraz, żeby wpisy nie trafiały do obu instalacji.

**Przełączenie, kiedy zdecydujesz:**

1. Wyłącz harmonogram starej instalacji: w Supabase zadanie `mcplinker-worker-minute` (`select cron.unschedule('mcplinker-worker-minute');`) oraz Vercel Cron.
2. W nowej instalacji: **Ustawienia → Kopia z Supabase → Przełączenie: kopia z harmonogramem**. Dane zostaną zastąpione najnowszym stanem, a zaplanowane wpisy i automatyzacje pozostaną aktywne.
3. Sprawdź wpisy i połączenia. Potem wyłącz projekt Vercel. Projekt Supabase możesz zachować jakiś czas jako archiwum, następnie usunąć zmienne `SOURCE_SUPABASE_*`.

## Kopia zapasowa

Pliki są w bazie, więc wystarczy zrzut bazy, np. codziennie:

```
pg_dump --format=custom --file=mcplinker-$(date +%F).dump "$DATABASE_URL"
```

Kopia na tym samym serwerze chroni przed błędem lub przypadkowym usunięciem danych, ale nie przed awarią dysku. Kopia poza serwerem jest zalecana, gdy dane staną się ważne.

## Uwagi

- `SCHEDULER_DISABLED=1` wyłącza wbudowany harmonogram (np. dla drugiego kontenera na tej samej bazie). Kolejka blokuje równoległe wykonanie tego samego wpisu, więc kilka kontenerów nie wyśle go dwa razy.
- `POST /api/cron` z nagłówkiem `Authorization: Bearer CRON_SECRET` nadal uruchamia kolejkę ręcznie.
- Testy trybu PostgreSQL: `TEST_DATABASE_URL=postgres://… node --test tests/postgres.test.mjs` (baza testowa jest czyszczona).
