# Platformy i konfiguracja

## Co obsługuje MCPLinker

| Platforma | Nowa obsługa | Co podłączyć |
| --- | --- | --- |
| Instagram | Zdjęcie, karuzela (2–10 zdjęć), rolka (film) z własną okładką i relacja (Stories) ze zdjęciem albo filmem; planowanie, odczyt ostatnich publikacji i liczników konta | Profesjonalne konto firmy lub twórcy, połączone ze stroną Facebook |
| Telegram | Tekst lub jeden obraz z opisem, planowanie, usuwanie wysłanych wiadomości w granicach API, liczba członków | Bot jako administrator kanału lub grupy |
| Mastodon | Tekst z linkiem do 500 znaków, planowanie, odczyt wpisów i profilu, odpowiedzi pod własnymi wpisami, usuwanie własnych wpisów | Konto na serwerze Mastodon i token aplikacji |

Integracje nie wymagają wykupienia abonamentu API w MCPLinker. Nadal obowiązują limity dostawców, wymagane zgody oraz koszty hostingu aplikacji i ewentualnie serwera Mastodon. Telegram wysyłany jest z `allow_paid_broadcast: false`. Instagram nie obejmuje jeszcze komentarzy, usuwania, oznaczeń osób ani karuzel z filmami. Mastodon nie obejmuje jeszcze załączników. Telegram Bot API nie zwraca historii kanału: wysłane przez aplikację wpisy są widoczne w Publikacjach MCPLinker.

## Instagram krok po kroku

1. Na Instagramie przełącz konto na profesjonalne (firma albo twórca), jeżeli jeszcze takie nie jest.
2. Połącz je z właściwą stroną Facebook w ustawieniach konta / strony Meta. Użyta w tej integracji ścieżka Facebook Login wymaga tego powiązania.
3. Otwórz developers.facebook.com → aplikacja MCPLinker. Dodaj dostępny dla niej przypadek użycia Instagram API z Facebook Login.
4. W uprawnieniach dodaj `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`. Dostęp do zasobów zarządzanych przez portfolio może też wymagać `business_management`.
5. Facebook Login for Business → Configurations → Edit przy konfiguracji, której ID masz w MCPLinker. Uwzględnij nowe uprawnienia i właściwe zasoby. Samo wpisanie zakresów w panelu MCPLinker nie zmienia konfiguracji po stronie Meta.
6. Facebook Login for Business → Ustawienia → Valid OAuth Redirect URIs: dodaj **https://mcplinker.vercel.app/api/connect/instagram/callback**. Zachowaj istniejący adres Facebook callback.
7. MCPLinker → Konta → Połącz konto → wybierz markę i Instagram → **Połącz przez Instagram**. W oknie Meta przyznaj dostęp do właściwych stron/kont.
8. Instagram używa zapisanych już danych aplikacji Facebook / Meta. Nie potrzebujesz nowej aplikacji deweloperskiej dla każdej marki.
9. Publikacja: zdjęcie dodaje agent narzędziem `instagram_upload_image` z plikiem z rozmowy w polu `image` (ChatGPT) albo z publicznym `url`. Możesz też w panelu wpisać w Media i opcje platformy `{"image_urls":["https://twoja-domena.pl/obraz.jpg"]}`. Potem zapisz szkic i zaplanuj lub opublikuj. Maksymalny opis wraz z linkiem: 2200 znaków.

Instagram pobiera zdjęcie dopiero w chwili publikacji i przyjmuje tylko JPEG o proporcjach od 4:5 do 1.91:1. Dlatego MCPLinker przy zapisie szkicu od razu pobiera każde zdjęcie Instagrama: z narzędzia albo z `image_urls`. Konwertuje je do JPEG, a zdjęcie o innych proporcjach umieszcza na rozmytym tle zamiast je przycinać. Kopię zapisuje w publicznym koszyku Supabase Storage `mcplinker-media`, który powstaje automatycznie przy pierwszym użyciu, pod losową nazwą pliku. Tymczasowy link z rozmowy (wygasa po kilku minutach) nie trafia więc do Instagrama. Rolki: agent wgrywa film narzędziem `instagram_upload_video` z plikiem z rozmowy w polu `video` albo z publicznym `url`. Obsługiwane są MP4 i MOV (H.264, AAC), najlepiej pionowe 9:16, od 3 s do 15 min. Film trafia do publicznego koszyka Supabase Storage `mcplinker-video`, który tworzy się sam. Limit rozmiaru pliku wynika z planu Supabase (Free: 50 MB). Rolka pojawia się też w siatce profilu.

Karuzela to od 2 do 10 zdjęć w `payload.image_urls`, publikowanych jako jeden wpis z jednym opisem. Agent dodaje kolejne zdjęcia narzędziem `instagram_upload_image` z `append: true`. Najlepiej przygotować wszystkie zdjęcia karuzeli w jednym formacie (np. 4:5). Karuzela liczy się jako jeden wpis w dobowym limicie Instagrama (50 publikacji).

Relacja (Stories) to `payload.story: true` z jednym zdjęciem albo jednym filmem. Meta pozwala publikować relacje przez API tylko kontom firmowym (Business); konto twórcy (Creator) może publikować zdjęcia, karuzele i rolki, ale nie relacje. Opis wpisu nie jest widoczny w relacji, a relacja znika po 24 godzinach. Zdjęcie relacji zachowuje proporcje 9:16 (agent wgrywa je przez `instagram_upload_image` z `purpose: "story"`). Film relacji wgrywa `instagram_upload_video` z `story: true` i jest publikowany dwuetapowo jak rolka.

Okładka rolki: obraz (najlepiej 9:16) wgrany przez `instagram_upload_image` z `purpose: "cover"` trafia do `payload.cover_url`. Zamiast obrazu można wskazać klatkę filmu: `payload.thumb_offset` w milisekundach od początku. Bez żadnego z tych pól Instagram wybiera okładkę sam.

Publikacja rolki przebiega dwuetapowo, bo Instagram przetwarza film po wysłaniu, zwykle od kilkudziesięciu sekund do kilku minut. MCPLinker wysyła film i czeka do około 20 sekund. Jeśli film nie jest jeszcze gotowy, wpis wraca na minutę do zaplanowanych i harmonogram sprawdza go ponownie. Rolka zostaje opublikowana automatycznie, gdy Instagram skończy przetwarzanie. Wymaga to działającego harmonogramu (Supabase Cron co minutę). Po około 30 minutach bez gotowego filmu wpis kończy się błędem.

Jeżeli obraz długo się przetwarza, aplikacja nie wyśle polecenia publikacji i pokaże komunikat do ponowienia później. Jeżeli wynik wysłanej publikacji jest niepewny, najpierw sprawdź Instagram — aplikacja nie ponawia jej automatycznie.

## Facebook z wielu prywatnych profili

Jedna aplikacja Meta może obsługiwać strony udostępnione przez wiele osób. Każda osoba loguje się swoim profilem i musi mieć odpowiednie prawa do stron. Nowe logowanie dodaje połączenia do wskazanej marki, bez usuwania wcześniejszych. Ponowne połączenie tej samej strony w tej samej marce aktualizuje jej token.

### Jeżeli aplikacja jest jeszcze w trybie testowym / Unpublished

1. Meta Developers → MCPLinker → **App roles → Roles**: dodaj drugi profil jako testera lub dewelopera zgodnie z opcjami panelu.
2. Na drugim profilu zaakceptuj zaproszenie do roli. Meta może wymagać rejestracji deweloperskiej od osoby przyjmującej rolę testową; nie jest to tworzenie nowej aplikacji.
3. Sprawdź, czy ten profil rzeczywiście zarządza stronami i może publikować w ich imieniu.
4. Otwórz osobny profil przeglądarki albo okno prywatne. Na Facebooku zaloguj się na ten drugi profil. W MCPLinker zaloguj się na swoje dotychczasowe konto właściciela aplikacji.
5. MCPLinker → Konta → Połącz konto → właściwa marka → Facebook → Połącz przez Facebook.
6. W oknie zgody Meta wybierz potrzebne strony. Jeżeli zgoda była wcześniej ograniczona, użyj opcji edycji dostępu. Nadanie roli testowej nie nadaje automatycznie uprawnień do stron.

Aplikacja ponownie pyta o odrzucone zgody i pobiera kolejne strony wyników Graph API. Nie może wymusić wyboru innego konta w istniejącej sesji Facebook ani ominąć odmowy Meta.

### Docelowo konta klientów jak w narzędziach typu Metricool

Potrzebne są publikacja aplikacji i zatwierdzony odpowiedni zakres dostępu (Advanced Access / App Review), a także wymagana przez Meta weryfikacja firmy. Minimum dobierane jest do faktycznych funkcji, np. lista stron, odczyt i publikowanie. Meta może zażądać nagrania działania aplikacji, polityki prywatności i obsługi usunięcia danych.

Po zatwierdzeniu klienci autoryzują tę samą aplikację własnym logowaniem. Nie tworzą osobnych aplikacji Meta ani nie potrzebują ról testowych. Wdrożenie kodu MCPLinker nie zatwierdza aplikacji automatycznie. Na wcześniejszym zrzucie aplikacja miała status Unpublished; bieżący status trzeba sprawdzić w Meta.

## Telegram krok po kroku

1. Otwórz zweryfikowanego **@BotFather** w Telegramie.
2. Wyślij `/newbot`, podaj nazwę i nazwę użytkownika bota. Skopiuj otrzymany token.
3. Dodaj bota do swojego kanału lub grupy jako administratora. Dla kanału włącz publikowanie wiadomości.
4. MCPLinker → Konta → Połącz konto → Telegram. Wpisz nazwę połączenia, token oraz `@nazwakanalu` lub numeryczny identyfikator grupy/kanału.
5. Zapisz. Aplikacja sprawdzi prawa i zapisze stały numeryczny identyfikator, aby późniejsza zmiana nazwy kanału nie zmieniła adresata.
6. Możesz wysłać sam tekst do 4096 znaków albo jeden obraz `image_urls` z opisem do 1024 znaków. Link wlicza się do tekstu.

Token jest przechowywany w postaci zaszyfrowanej; agent ChatGPT go nie otrzymuje.

## Mastodon krok po kroku

1. Zaloguj się na własne konto Mastodon na wybranym serwerze.
2. Preferencje → Programowanie / Development → Nowa aplikacja.
3. Nadaj `read:accounts`, `read:statuses`, `write:statuses`. Utwórz aplikację i skopiuj osobisty token dostępu.
4. MCPLinker → Konta → Połącz konto → Mastodon. Podaj adres samego serwera, np. `https://mastodon.social`, nazwę połączenia i token.
5. Zapisz. Konto zostanie rozpoznane automatycznie po tokenie.
6. Przygotuj tekst z opcjonalnym linkiem do 500 znaków. Wpisy są publiczne. Ograniczenia serwera mogą być dodatkowo egzekwowane przez jego API.

## Przesuwanie wpisów w kalendarzu

- Złap oczekujący wpis i przeciągnij na inny dzień. Nowa data zapisuje się na serwerze, zachowując godzinę według strefy przeglądarki.
- Na telefonie lub klawiaturą użyj **Przenieś**, następnie wybierz numer dnia. Możesz zmienić miesiąc strzałkami przed wyborem dnia.
- Możesz zmienić też godzinę: Publikacje → menu wpisu → **Zmień termin**.
- Przesunięcie nie omija akceptacji wymaganej przez markę. Wpis bez akceptacji pozostanie w stanie „Do akceptacji”.
- Nie można przesuwać wpisów opublikowanych, aktualnie wysyłanych ani o niepewnym wyniku. Termin musi być w przyszłości. Przy błędzie stary termin pozostaje widoczny.
- Kalendarz dotyczy kolejki MCPLinker i pobranych wpisów (domyślnie 100). Nie zmienia natywnych terminów WordPress ustawionych osobno przez `wordpress_request`.

## Dokumentacja dostawców

- [Instagram z Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/)
- [Publikowanie Instagram](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [Poziomy dostępu Meta](https://developers.facebook.com/docs/graph-api/overview/access-levels/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram FAQ i limity](https://core.telegram.org/bots/faq)
- [Mastodon — publikacje](https://docs.joinmastodon.org/methods/statuses/)
