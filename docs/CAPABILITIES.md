# Zakres funkcji

## Wspólna przestrzeń

| Obszar | Zaimplementowane | Granice bieżącej wersji |
| --- | --- | --- |
| Marki i konta | Wiele marek, wiele kont, styl komunikacji, wybór marki, reguły akceptacji | Jeden właściciel panelu; brak zespołowych ról użytkowników |
| Publikowanie | Szkice, wiele kont z edytora, zatwierdzanie wersji, planowanie, publikacja teraz, anulowanie | Bez edycji opublikowanych treści z edytora social; WordPress można edytować narzędziem administracyjnym |
| Kalendarz | Widok miesiąca, szczegóły wpisów, zmiana miesiąca, strefa przeglądarki | Pokazuje pobrane wpisy; panel startowo pobiera ostatnie 100 |
| Automatyzacje | RSS/WordPress → szkice; wyłącznik, odstęp sprawdzania, szablony, deduplikacja | Do 20 najnowszych elementów źródła; generowanie AI wykonuje ChatGPT |
| Media | Rejestr publicznych URL, podgląd obrazów, upload obrazu do WordPress i LinkedIn przez MCP | Brak własnego magazynu plików, edytora obrazów, multipart upload dużego wideo |
| Raportowanie | Dostępne odczyty API na żądanie, historia działań, eksport JSON | Brak hurtowni metryk, długoterminowych wykresów i automatycznych raportów PDF |
| MCP | OAuth PKCE, DCR, Bearer, zakresy, marki, revocation, prompt templates | Połączenie produkcyjne z ChatGPT wymaga odbioru po wdrożeniu |

## Facebook

Obsługiwane są strony, do których token ma dostęp: tekst/link, jedno lub wiele zdjęć, zwykłe wideo z publicznego URL, lista wpisów, komentarze, publiczne komentowanie własnych wpisów strony, usuwanie wpisów i odczyt przykładowej metryki Page Insights. Metryki i możliwości zależą od wersji API oraz zatwierdzonych zakresów.

Nie ma obsługi prywatnych profili, grup, Messenger, Reels, Stories ani Ads Manager. Nie ma automatyzacji przeglądarki do obchodzenia ograniczeń API. OAuth pobiera pierwszą stronę listy kont (do 100); dodatkowe konta można połączyć ręcznie. Pobieranie wpisów zwraca informacje o paginacji API; panel komentarzy wyświetla pierwszą partię.

## LinkedIn

Publikacje osób i organizacji, tekst, link/artykuł, media przez URN, upload obrazów Images API, lista wpisów, komentarze i statystyki udostępnień organizacji. Zakres dostępu zależy od produktów API i roli przy organizacji. `w_member_social` nie daje automatycznie praw do wszystkich odczytów.

Nie ma prywatnych wiadomości, zaproszeń, scrapowania kontaktów, wyszukiwania potencjalnych klientów, zarządzania reklamami ani multipart upload wideo/dokumentów. Obrazy są przetwarzane przez LinkedIn asynchronicznie; przed publikacją należy zaczekać na dostępność assetu. Nie ma automatycznego odnawiania tokenów platform.

## WordPress

Odczyty wpisów, stron, mediów, komentarzy, kategorii i tagów; publikowanie wpisów i stron; HTML treści; obraz wyróżniający; upload obrazów; slug; excerpt; kategorie; tagi; pola `meta` wystawione przez REST API; data `date_gmt`. Narzędzie `wordpress_request` obsługuje dozwolone zasoby core REST API i metody GET/POST/PUT/PATCH/DELETE.

Administracyjne działania zależą od uprawnień użytkownika WordPress i tego, co dana wersja WordPress udostępnia przez REST. To nie jest powłoka serwera ani klient FTP. Nie ma dowolnej edycji plików motywu, aktualizacji rdzenia, pełnych backupów witryny ani arbitralnych endpointów wtyczek. Wybrane operacje na wtyczkach, motywach, użytkownikach, menu i szablonach działają tylko w zakresie core REST API. Liczba opublikowanych wpisów nie jest statystyką ruchu.

## Ograniczenia techniczne

Brak abonamentu ani limitu liczby marek w logice produktu nie oznacza nieskończonych zasobów. Pojedynczy request ma ograniczony rozmiar, odczyty są stronicowane, pliki pobierane przez serwer mają limit 8 MB, a kolejka używa małych partii. Ochrona przed nadużyciami ogranicza tempo żądań MCP oraz logowania. Dostawcy mają własne limity API, pojemności i rozliczeń.

Startowy worker uruchamia się raz dziennie. Dokładniejszy harmonogram i większa skala wymagają konfiguracji schedulera i ewentualnie osobnej usługi worker. Przy tysiącach marek/kont warto rozwinąć stronicowanie wszystkich sekcji panelu; domyślny limit PostgREST nadal dotyczy list bez paginacji.

## Proponowany dalszy rozwój

1. Oddzielny worker z trwałą kolejką, sterowaniem tempem dla poszczególnych platform i raportem opóźnień.
2. Przechowywanie mediów w Supabase Storage, podpisane linki i wysyłanie większych plików.
3. Automatyczna rotacja tokenów platform oraz alerty przed utratą dostępu.
4. Historia metryk, raporty marek, rekomendacje pór publikacji i porównywanie treści.
5. Role zespołowe: autor, recenzent, administrator; powiadomienia o szkicach do akceptacji.
6. Dodatkowe adaptery dla zatwierdzonych produktów Meta i LinkedIn, w tym Reels/Stories, jeśli konto i API je udostępniają.
7. Integracje GA4/GSC i właściwe endpointy wtyczek SEO WordPress.
8. Harmonogram pracy agentów z generowaniem treści, kosztami modelu i wyraźnymi zasadami publikowania.

Ta lista opisuje dalszy rozwój, a nie funkcje już działające.
