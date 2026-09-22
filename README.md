# MCPLinker

Panel w języku polskim i zdalny serwer MCP do pracy z wieloma markami, stronami Facebook, kontami LinkedIn i witrynami WordPress. Własne wdrożenie na Vercel, dane i logowanie w Supabase. Bez abonamentów i limitu liczby marek w kodzie aplikacji; limity API, hostingu i bazy nadal obowiązują.

**Status:** kod aplikacji i baza Supabase są przygotowane. Uruchomienie produkcyjne wymaga importu repozytorium do Vercel, ustawienia zmiennych środowiskowych i podłączenia własnych kont platform. Nie przeprowadzono jeszcze rzeczywistej publikacji na kontach użytkownika ani pełnego połączenia ChatGPT → produkcja.

## Funkcje

- Marki z opisem stylu, strefą czasową i zasadą zatwierdzania treści.
- Wiele kont i witryn przypisanych do każdej marki.
- Szkice dla kilku kanałów, edytor, kalendarz, zatwierdzanie, harmonogram, publikacja teraz, anulowanie i historia działań.
- Facebook Pages: tekst, link, zdjęcia, zwykłe wideo, odczyt wpisów i komentarzy, komentarze, usuwanie własnych wpisów oraz dostępne metryki.
- LinkedIn: publikacje osoby/organizacji, obrazy przez Images API, artykuły/linki, komentarze i statystyki organizacji zależnie od zatwierdzonych produktów API.
- WordPress: wpisy, strony, obrazy, kategorie, tagi, komentarze, pola REST, data publikacji oraz administracja przez REST API rdzenia i wtyczek. Rank Math: zapis Focus Keyword, SEO Title i Meta Description; wykrywanie endpointów i schematów API.
- Reguły RSS → szkice i WordPress → szkice w wybranych kanałach; deduplikacja elementów źródła.
- Biblioteka publicznych odnośników do mediów oraz eksport danych bez sekretów.
- MCP przez stateless Streamable HTTP, OAuth z PKCE S256, ograniczone tokeny Bearer, wybór marek i zakresów dostępu, odwoływanie autoryzacji.
- Szyfrowanie poświadczeń AES-256-GCM, RLS, ochrona przed SSRF, dziennik działań i blokady konkurencyjnych publikacji.
- Responsywny panel i jawnie oznaczony tryb demonstracyjny pod `/?demo=1`.

## Uruchomienie

Pełna instrukcja: **[docs/SETUP.md](docs/SETUP.md)**. Zakres integracji i ograniczenia: **[docs/CAPABILITIES.md](docs/CAPABILITIES.md)**. Projekt i model bezpieczeństwa: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

```bash
npm ci
cp .env.example .env.local
# Uzupełnij wartości w .env.local
npm run dev
```

Sama demonstracja i ekran konfiguracji działają bez poświadczeń. Pełna aplikacja wymaga bazy ze schematem `supabase/schema.sql` i ustawień opisanych w instrukcji.

```bash
npm test
npm run typecheck
npm run build
npm start
```

Repozytorium zawiera lockfile. W CI używany jest Node 22. Kod zweryfikowano lokalnie także na Node 24. Serwer obsługuje wyłącznie publiczne witryny HTTPS z działającym IPv4; połączenia prywatne i przekierowania z poświadczeniami są odrzucane.

## Harmonogram

Startowe `vercel.json` uruchamia `/api/cron` **raz dziennie o 06:00 UTC**. Zaplanowana godzina określa najwcześniejszy termin wysłania, a nie gwarancję dokładności do minuty. Częstsze uruchamianie wymaga odpowiedniego planu Vercel lub zewnętrznego schedulera. Instrukcja zawiera obie konfiguracje.

## Rzeczywisty zakres

To działająca implementacja funkcji wymienionych powyżej, wymagająca konfiguracji i odbioru na realnych kontach. Nie jest pełną kopią Metricool. Reels, Stories, reklamy, prywatne wiadomości, grupy Facebook i zaproszenia LinkedIn nie są zaimplementowane. Nie ma automatycznego obchodzenia limitów, App Review ani zgód platform. Aplikacja nie uruchamia samodzielnie modelu AI — treść opracowuje ChatGPT przez MCP, a reguły serwera używają szablonów.

Panel ma jednego właściciela wskazanego przez `APP_OWNER_EMAIL`; marki i agenci są rozdzieleni uprawnieniami. Role wielu użytkowników nie są częścią tej wersji.

## Nowe platformy i kalendarz

Instagram, Telegram i Mastodon oraz przesuwanie terminów publikacji: [instrukcja konfiguracji](docs/PLATFORMS.md).
