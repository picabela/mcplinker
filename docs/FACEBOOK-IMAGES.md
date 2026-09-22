# Zdjęcia na Facebooku przez ChatGPT

`facebook_upload_image` wysyła rzeczywiste bajty JPEG/PNG do Meta, jako nieopublikowane zdjęcie. Wymaga uprawnienia `draft` i działającego dostępu do strony Facebook.

## Zalecana kolejność

1. Pobierz `connection_list` i wybierz połączenie Facebook właściwej marki.
2. Utwórz szkic przez `post_create`.
3. Wywołaj `facebook_upload_image` z `connection_id`, `post_id` szkicu i jednym ze źródeł:
   - `url`: publiczny adres HTTPS obrazu do 8 MB. Serwer pobiera plik i wysyła go bezpośrednio do Meta.
   - `data_base64`: czysta zawartość pliku zakodowana jako base64, bez prefiksu `data:`; plik do 1 MB, aby zmieścić żądanie MCP w limicie transportu.
4. Wynik z `post` potwierdza dołączenie zdjęcia do szkicu. Dodanie zdjęcia unieważnia wcześniejszą akceptację treści.
5. Zaplanuj lub opublikuj ten szkic zgodnie z polityką marki. Facebook otrzyma wpis `/feed` z `attached_media`.

Alternatywnie wywołaj upload bez `post_id`. Otrzymaną tablicę `facebook_media` przekaż bez zmian do `payload` w `post_create` albo `post_update`. Referencje są przypisane do właściciela, marki i połączenia; nie można przenosić ich między stronami. Nie są tokenami logowania Facebook.

Dotychczasowe `payload.image_urls` nadal działa: aplikacja pobiera obrazy, wysyła pliki do Meta i tworzy post z załącznikami. Błąd pobrania lub zapisu obrazu przerywa publikację — nie jest zastępowany postem tekstowym. Nie mieszaj `image_urls`, `facebook_media` i `video_url` w jednym szkicu.

## Pliki z rozmowy

Adres `sandbox:/...` lub sam załącznik w rozmowie nie jest publicznym URL i nie może być pobrany przez Meta ani serwer MCPLinker. Agent musi mieć dostęp do bajtów pliku i przekazać je jako `data_base64` albo użyć rzeczywiście dostępnego publicznego URL. Narzędzie nie ma automatycznego dostępu do wszystkich załączników ChatGPT.

`asset_create` zapisuje pozycję w bibliotece. Nie dołącza jej automatycznie do posta. Jeżeli użytkownik zamówił post z grafiką, agent nie powinien publikować samego tekstu, gdy plik nie jest dostępny.

Upload sam nie publikuje posta. Jeśli zapis obrazu powiedzie się, ale dołączenie do szkicu zostanie odrzucone z powodu równoczesnej edycji, może pozostać nieopublikowane zdjęcie w Meta. Przed ponowieniem niepewnej publikacji sprawdź stronę, aby nie utworzyć duplikatu.

Nieważne tokeny Meta (np. kod 190) nadal wymagają ponownego połączenia konta. Dodanie uploadu nie usuwa blokad autoryzacji Meta.
