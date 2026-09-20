# Uruchomienie MCPLinker

## 1. Import do Vercel

W panelu Vercel wybierz **Add New → Project**, zaimportuj `picabela/mcplinker`, pozostaw framework **Next.js**, katalog główny repozytorium i polecenie budowania `npm run build`. Wybierz Node 22 lub 24. Uruchom Deploy.

Pierwsze wdrożenie bez sekretów pokaże ekran konfiguracji. To oczekiwane. Zapisz docelowy publiczny adres aplikacji; będzie potrzebny do `APP_URL` i adresów callback. Korzystaj z jednej stabilnej domeny produkcyjnej. Nie udostępniaj sekretów w czacie, repozytorium, logach ani adresach URL.

Połączenie repozytorium z projektem Vercel zapewnia automatyczne wdrożenie po kolejnych commitach na `main`. Repozytorium zawiera workflow sprawdzający testy, TypeScript i kompilację. Status CI trzeba sprawdzić przed ręczną promocją wdrożenia.

## 2. Supabase

Utworzony dla tego projektu zasób:

- Nazwa w Supabase: `socialpilot-mcp` (nazwa robocza; aplikacja nazywa się MCPLinker).
- Ref: `uhbwpdtmcawlrdkmqdgc`.
- Region: Frankfurt / `eu-central-1`.
- URL: `https://uhbwpdtmcawlrdkmqdgc.supabase.co`.
- Schemat jest już wdrożony. **Nie uruchamiaj ponownie `schema.sql` na tym projekcie.**

Dla innego, pustego projektu wykonaj `supabase/schema.sql` w SQL Editor lub jako migrację. Schemat nie jest skryptem do wielokrotnego uruchamiania na istniejących tabelach.

W ustawieniach projektu znajdź:

- publiczny klucz publishable / anon;
- serwerowy klucz **legacy service_role**. Aktualna implementacja wysyła ten JWT jako `apikey` i Bearer do PostgREST; nie podstawiaj klucza `sb_secret_…` bez zmiany sposobu uwierzytelnienia w `lib/db.mjs`.

Klucz serwerowy trafia wyłącznie do Vercel Environment Variables. Nie ustawiaj go pod nazwą z prefiksem `NEXT_PUBLIC_`.

W **Authentication → URL Configuration** ustaw Site URL na adres produkcyjny aplikacji i dopuść ten sam adres do przekierowań. Włącz logowanie e-mail/hasło. Przy włączonym potwierdzaniu e-maila konto trzeba aktywować przed zalogowaniem. Przy konfiguracji wysyłki e-maili uwzględnij wymagania Supabase i własnego SMTP.

## 3. Zmienne Vercel

Dodaj je w **Project → Settings → Environment Variables → Production**, następnie wykonaj **Redeploy**. Możesz przygotować osobną bazę i sekrety dla Preview; nie podłączaj przypadkowych preview do bazy produkcyjnej.

| Zmienna | Wartość |
| --- | --- |
| `APP_URL` | Dokładny adres produkcji, np. `https://twoja-domena.pl`, bez ścieżki |
| `APP_OWNER_EMAIL` | Twój e-mail, którym zalogujesz się do panelu |
| `SUPABASE_URL` | `https://uhbwpdtmcawlrdkmqdgc.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Klucz publiczny projektu Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Serwerowy JWT legacy service_role |
| `ENCRYPTION_KEY` | 64 znaki hex, wygenerowane losowo |
| `CRON_SECRET` | Losowy długi sekret schedulera |
| `META_API_VERSION` | Wersja API dostępna dla Twojej aplikacji Meta; startowo `v25.0`, potwierdź w jej panelu |
| `LINKEDIN_API_VERSION` | Startowo `202609`; aktualizuj przed wycofaniem wersji |
| `MCP_ALLOWED_REDIRECT_URIS` | Dokładne dozwolone callbacki ChatGPT, rozdzielone przecinkami |
| `WORDPRESS_ALLOWED_HOSTS` | Opcjonalna lista dozwolonych domen WordPress, rozdzielona przecinkami |

Generowanie wartości lokalnie, każda komenda osobno:

```bash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

```bash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Pierwszy wynik to `ENCRYPTION_KEY`, drugi to `CRON_SECRET`. Zapisz je również w menedżerze haseł. Utrata lub prosta zmiana `ENCRYPTION_KEY` uniemożliwi odczyt istniejących poświadczeń; rotacja wymaga ich ponownego zaszyfrowania albo ponownego podłączenia kont.

Startowy callback ChatGPT:

```text
https://chatgpt.com/connector_platform_oauth_redirect
```

Jeśli Twój klient pokazuje inny callback, dodaj **dokładnie ten adres** do listy. Nie używaj wildcardów ani samych prefiksów domeny.

## 4. Konto właściciela i marki

Otwórz aplikację, wybierz „Pierwsze uruchomienie? Utwórz konto” i użyj e-maila ustawionego w `APP_OWNER_EMAIL`. Hasło musi mieć przynajmniej 12 znaków. Potwierdź e-mail, jeśli wymaga tego Supabase.

Dodaj pierwszą markę. Opis stylu służy agentom do dopasowania tekstu. Nowa marka wymaga akceptacji publikacji. W profilu można zezwolić agentom z zakresem `publish` na publikowanie bez ręcznej akceptacji.

Polityka akceptacji dotyczy kolejki wpisów. Publiczne komentarze z zakresem `engage` i administracyjne zapisy WordPress z zakresem `admin` działają natychmiast.

## 5. WordPress

1. Witryna musi działać pod HTTPS i udostępniać `/wp-json/`.
2. Utwórz osobne konto WordPress z uprawnieniami odpowiednimi do zadań.
3. W profilu użytkownika utwórz **hasło aplikacji**.
4. W MCPLinker wybierz markę, Połączone konta → Połącz konto → WordPress.
5. Podaj bazowy adres witryny, nazwę użytkownika i hasło aplikacji. Nie podawaj `/wp-admin` ani `/wp-json` jako adresu bazowego.

Podkatalogi są obsługiwane, np. `https://domena.pl/blog`. Podaj adres docelowy po przekierowaniach, z właściwym `www` lub bez niego. Połączenia nie podążają za przekierowaniami z hasłem.

Zwykłe publikowanie wymaga uprawnień do edycji/publikowania wpisów; administracja użytkownikami, ustawieniami czy wtyczkami wymaga dodatkowych uprawnień WordPress. Pola SEO są dostępne tylko wtedy, gdy dana wtyczka wystawia je przez REST API. Narzędzie administracyjne w tej wersji obsługuje dozwolone zasoby `wp/v2`, bez arbitralnych endpointów wtyczek.

## 6. Facebook Pages

Potrzebujesz aplikacji w Meta for Developers, własnej strony i właściwych ról. Dostęp do cudzych zarządzanych stron w trybie produkcyjnym zwykle wymaga weryfikacji biznesowej i App Review dla konkretnych uprawnień.

W aplikacji Meta skonfiguruj callback:

```text
https://TWOJA-DOMENA/api/connect/facebook/callback
```

W MCPLinker → Ustawienia → Konfiguruj OAuth zapisz App ID, App Secret i przyznane zakresy. Przykładowe zakresy funkcjonalne: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `read_insights`. Nie dodawaj uprawnień, których Meta nie przyznała Twojej aplikacji.

Następnie w Połączonych kontach wybierz markę i „Połącz przez Facebook OAuth”. W ekranie Meta wybierz strony przeznaczone dla tej marki. Callback importuje do niej do 100 stron zwróconych w pierwszej odpowiedzi kont; kolejne strony można podłączyć ręcznie, używając ID strony i jej Page Access Token.

Alternatywnie wpisz w formularzu ID strony i Page Access Token. Token użytkownika nie jest zamiennikiem Page Access Token. Tokeny mogą wygasać lub tracić ważność po zmianie haseł, ról czy uprawnień. W tej wersji po utracie ważności należy odnowić połączenie.

## 7. LinkedIn

Utwórz aplikację LinkedIn Developer i dodaj callback:

```text
https://TWOJA-DOMENA/api/connect/linkedin/callback
```

Do osobistego połączenia OAuth potrzebny jest produkt Sign In with LinkedIn using OpenID Connect oraz uprawnienia do publikowania. Przykładowe zakresy: `openid profile w_member_social`. Zapisz Client ID i Client Secret w ustawieniach MCPLinker, następnie połącz konto przez OAuth.

Organizacje można dodać za pomocą tokenu i `urn:li:organization:ID`. Publikacje, odczyty wpisów, komentarze i statystyki organizacji wymagają właściwych ról i dostępu do Community Management API. Sam zakres do publikowania osoby nie zapewnia odczytu wszystkich wpisów czy metryk.

Obraz można przesłać narzędziem `linkedin_upload_image`; otrzymany `media_urn` dodaj do payload szkicu. LinkedIn przetwarza obrazy asynchronicznie. Wideo i dokumenty wymagają wcześniejszego uzyskania URN przez odpowiednie API poza tą wersją aplikacji. Odnowienie wygasłego dostępu wykonuje się przez ponowne połączenie; automatyczne odświeżanie tokenów platform nie jest jeszcze zaimplementowane.

## 8. ChatGPT i MCP

W ChatGPT włącz możliwość dodawania własnych aplikacji / tryb deweloperski, jeżeli udostępnia go Twój plan i administrator obszaru roboczego. Utwórz połączenie do:

```text
https://TWOJA-DOMENA/mcp
```

Wybierz OAuth. Serwer udostępnia metadane, dynamiczną rejestrację klienta i PKCE S256. Zaloguj się do MCPLinker i wybierz marki. Zacznij od `read draft`; dodaj `publish`, gdy chcesz planowania i publikacji. Sam klient ChatGPT może stosować dodatkowe potwierdzenia operacji.

| Zakres | Dostęp |
| --- | --- |
| `read` | Marki, konta bez sekretów, wpisy, media, odczyty platform, historia |
| `draft` | Szkice i ich edycja, media WordPress i LinkedIn |
| `publish` | Planowanie, publikowanie i anulowanie zgodnie z polityką marki |
| `engage` | Natychmiastowe komentarze publiczne |
| `manage` | Tworzenie i przełączanie automatyzacji |
| `admin` | Natychmiastowe operacje core REST WordPress i usuwanie opublikowanych wpisów |

Tworzenie marek, podłączanie kont, ręczna akceptacja, zarządzanie sekretami oraz wydawanie tokenów pozostają operacjami panelu właściciela. Nadanie zakresu `admin` agentowi nie umożliwia uzyskania tokenów platform.

Tokeny z panelu Agenci i MCP służą klientom obsługującym `Authorization: Bearer`. Nie mają być wklejane do treści promptu. Sekret jest pokazywany raz; w bazie przechowywany jest wyłącznie jego skrót. OAuth jest zalecaną ścieżką dla ChatGPT.

Przykładowe polecenia:

- „Pobierz profil marki i połączone konta. Przygotuj pięć szkiców na następny tydzień. Nie publikuj.”
- „Odczytaj ostatnie wpisy WordPress i przygotuj wersje na Facebooka i LinkedIn, zgodne ze stylem marki.”
- „Prześlij ten publiczny obraz do WordPress, ustaw tekst alternatywny i użyj go jako obrazka wyróżniającego szkicu.”
- „Zaplanuj zatwierdzone wpisy na wskazane daty, podając czasy w UTC.”

Każde `post_create` wymaga stabilnego `dedupe_key`. Przy ponowieniu tego samego żądania użyj tego samego klucza i tej samej treści. Edycja szkicu wymaga `expected_updated_at` z ostatniego odczytu, aby nie nadpisać nowszej wersji.

## 9. Scheduler i automatyzacje

Startowa konfiguracja jest raz dziennie o 06:00 UTC. Dla częstszych publikacji:

- Na planie Vercel obsługującym częstszy Cron zmień `schedule` w `vercel.json` na `* * * * *` i wdróż ponownie. Sprawdź warunki i koszt swojego planu.
- Albo ustaw zewnętrzny scheduler wywołujący `POST https://TWOJA-DOMENA/api/cron` co minutę z nagłówkiem `Authorization: Bearer TWÓJ_CRON_SECRET`.

Vercel Cron używa żądań GET i również przesyła nagłówek Bearer, gdy ustawiono `CRON_SECRET`. Endpoint obsługuje GET oraz POST. Nie wpisuj sekretu do query string.

Jedno wykonanie przetwarza małą partię wpisów; przy dużej liczbie publikacji rozłóż terminy lub przenieś worker do stale działającej usługi. Baza używa `FOR UPDATE SKIP LOCKED`. Przerwane publikacje przechodzą w stan `uncertain` zamiast być wysyłane ponownie. W panelu sprawdź konto platformy i wybierz „Wyjaśnij wynik”.

Reguły RSS/WordPress sprawdzają do 20 najnowszych elementów źródła. Włączona reguła nie jest pełnym importem archiwum; bardzo szybkie źródła mogą wymagać częstszego uruchamiania. Powstają szkice z szablonów, nie samodzielnie wygenerowane przez AI artykuły.

## 10. Odbiór po wdrożeniu

1. Sprawdź ekran konfiguracji, załóż konto właściciela i dodaj markę.
2. Połącz testową witrynę lub stronę i wykonaj „Sprawdź”.
3. Utwórz szkic. Przy polityce akceptacji publikacja przed zatwierdzeniem musi pozostać oczekująca.
4. Zatwierdź wersję i opublikuj jeden uzgodniony wpis testowy. Sprawdź jego link i treść na platformie.
5. Zaplanuj drugi wpis; sprawdź log wywołania schedulera, termin i brak duplikatu.
6. Połącz ChatGPT przez OAuth, przydziel jedną markę oraz `read draft`, sprawdź tworzenie szkicu i brak możliwości publikacji bez `publish`.
7. Odwołaj autoryzację; kolejny odczyt MCP powinien wymagać ponownego logowania.
8. Zweryfikuj panel na komputerze i telefonie oraz eksport danych.

Te kroki wymagają rzeczywistych kont i nie są zastępowane testami jednostkowymi. Zanim zaczniesz regularną pracę, ustaw kopie zapasowe w Supabase i wykonaj odbiór połączenia z każdą platformą.

## Dokumentacja dostawców

- [OpenAI — uwierzytelnianie aplikacji MCP](https://developers.openai.com/plugins/build/auth)
- [MCP — Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [WordPress REST API](https://developer.wordpress.org/rest-api/reference/)
- [LinkedIn Images API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-09)
- [LinkedIn — wersjonowanie API](https://learn.microsoft.com/en-us/linkedin/marketing/versioning?view=li-lms-2026-09)
- [Meta — Graph API](https://developers.facebook.com/docs/graph-api/)
