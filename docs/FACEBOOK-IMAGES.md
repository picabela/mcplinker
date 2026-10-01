# Zdjęcia na Facebooku przez ChatGPT i Claude

`facebook_upload_image` wysyła rzeczywiste bajty obrazu do Meta jako nieopublikowane zdjęcie. Wymaga uprawnienia `draft` i działającego dostępu do strony Facebook. Agent dostaje te zasady po połączeniu: w instrukcjach serwera MCP i w opisach narzędzi.

## Domyślnie: plik z rozmowy prosto do Meta

1. Pobierz `connection_list` i wybierz połączenie Facebook właściwej marki.
2. Utwórz szkic przez `post_create`.
3. Wywołaj `facebook_upload_image` z `connection_id`, `post_id` szkicu i plikiem z rozmowy w polu `image`. Może to być załącznik użytkownika albo grafika wygenerowana w rozmowie.
4. Wynik z `post` potwierdza dołączenie zdjęcia do szkicu. Dodanie zdjęcia unieważnia wcześniejszą akceptację treści.
5. Zaplanuj lub opublikuj ten szkic zgodnie z polityką marki. Facebook otrzyma wpis `/feed` z `attached_media`.

Pole `image` jest oznaczone w `_meta["openai/fileParams"]`. ChatGPT zamienia wtedy plik z rozmowy na `{download_url, file_id, mime_type?, file_name?}`. Serwer pobiera plik z tymczasowego `download_url`, bez danych logowania, i od razu wysyła go do Meta. Nie trzeba publicznego adresu ani biblioteki mediów. Przekierowania pobrania (do 3) są sprawdzane tak samo jak pierwszy adres: tylko publiczny HTTPS.

Obsługiwane formaty: JPEG, PNG i GIF, najlepiej do 4 MB (serwer pobiera do 8 MB). Inny format, np. WebP lub HEIC, agent powinien najpierw przekonwertować do JPEG.

Po wdrożeniu nowej wersji odśwież aplikację w ChatGPT (ustawienia aplikacji / trybu deweloperskiego → **Refresh**), żeby ChatGPT pobrał nowy opis narzędzi. W Claude wystarczy ponownie połączyć łącznik albo rozpocząć nową rozmowę.

## Inne źródła: tylko na prośbę użytkownika

Podaj dokładnie jedno źródło. Pozostałe służą sytuacjom, w których użytkownik sam o to prosi albo agent nie ma pliku:

- `url`: publiczny adres HTTPS obrazu. Serwer pobiera plik i wysyła go bezpośrednio do Meta.
- `asset_id`: pozycja z biblioteki mediów tej samej marki. Serwer pobiera jej adres i wysyła plik do Meta.
- `data_base64`: czysta zawartość pliku zakodowana jako base64, bez prefiksu `data:`. Limit 1 MB, żeby żądanie MCP zmieściło się w limicie transportu.

Biblioteka mediów (`asset_create`) przechowuje tylko odnośniki do plików, które już są publiczne. Nie przesyła pliku i nie tworzy publicznego adresu. Sama pozycja w bibliotece nie dołącza zdjęcia do posta.

Alternatywnie wywołaj upload bez `post_id`. Otrzymaną tablicę `facebook_media` przekaż bez zmian do `payload` w `post_create` albo `post_update`. Referencje są przypisane do właściciela, marki i połączenia; nie można przenosić ich między stronami. Nie są tokenami logowania Facebook.

Dotychczasowe `payload.image_urls` nadal działa: aplikacja pobiera obrazy, wysyła pliki do Meta i tworzy post z załącznikami. Błąd pobrania lub zapisu obrazu przerywa publikację; nie jest zastępowany postem tekstowym. Nie mieszaj `image_urls`, `facebook_media` i `video_url` w jednym szkicu.

## Ograniczenia klientów

- ChatGPT: przekazywanie plików działa w aplikacjach z OAuth w ChatGPT (web i desktop). Zgłaszane są przypadki, w których aplikacja mobilna wysyła niepełną referencję pliku albo pole pliku nie dociera. Serwer odpowiada wtedy jasnym błędem, a agent ma ponowić wywołanie z tym samym plikiem.
- Claude: nie przekazuje narzędziom MCP plików z rozmowy. Agent użyje publicznego `url` albo poprosi użytkownika o link.
- Adres `sandbox:/...` lub ścieżka `/mnt/data/...` wpisana jako tekst w `url` nie jest publicznym adresem i nie zadziała. Plik trzeba przekazać w polu `image`.

Jeżeli użytkownik zamówił post z grafiką, agent nie powinien publikować samego tekstu, gdy plik nie jest dostępny.

Upload sam nie publikuje posta. Jeśli zapis obrazu powiedzie się, ale dołączenie do szkicu zostanie odrzucone z powodu równoczesnej edycji, może pozostać nieopublikowane zdjęcie w Meta. Przed ponowieniem niepewnej publikacji sprawdź stronę, aby nie utworzyć duplikatu.

Nieważne tokeny Meta (np. kod 190) nadal wymagają ponownego połączenia konta. Upload nie usuwa blokad autoryzacji Meta.
