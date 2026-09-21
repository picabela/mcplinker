# WordPress i wtyczki przez MCPLinker

Rozszerzony dostęp działa na istniejących połączeniach WordPress. Nie wymaga nowej zmiennej Vercel, migracji bazy ani dodatkowej wtyczki MCPLinker. Agent musi mieć zakres `admin` oraz dostęp do marki. Konto WordPress musi mieć uprawnienia do wykonywanej operacji; MCPLinker nie rozszerza jego roli.

## Rank Math

Narzędzie `wordpress_rankmath_update` zapisuje rzeczywiste pola Rank Math przez `POST /wp-json/rankmath/v1/updateMeta`:

| Parametr narzędzia | Pole w WordPress |
| --- | --- |
| `focus_keyword` | `rank_math_focus_keyword` |
| `seo_title` | `rank_math_title` |
| `meta_description` | `rank_math_description` |

```json
{
  "connection_id": "UUID-POŁĄCZENIA",
  "object_id": 123,
  "object_type": "post",
  "focus_keyword": "główna fraza, dodatkowa fraza",
  "seo_title": "Własny tytuł SEO",
  "meta_description": "Własny opis strony w wynikach wyszukiwania."
}
```

`object_id` to ID zasobu w WordPress, a nie ID publikacji w kolejce MCPLinker. `object_type=post` dotyczy również stron i własnych typów treści; `term` służy kategoriom/tagom, a `user` profilom autorów. Trzeba podać co najmniej jedno pole SEO. Pominięte pola pozostają bez zmian; pusty ciąg znaków usuwa daną wartość.

Odpowiedź `accepted: true` oznacza oczekiwane potwierdzenie endpointu. `submitted_meta` zawiera wysłane wartości, nie ponowny odczyt z bazy WordPress. Rank Math nie zwraca tych pól w odpowiedzi `updateMeta`, a core REST często nie wystawia ich do odczytu. Sprawdź je w edytorze Rank Math; tytuł i opis można dodatkowo sprawdzić w HTML opublikowanej strony po odświeżeniu cache. Narzędzie nie wylicza ani nie podwyższa sztucznie oceny SEO. Wynik analizy zależy od treści i mechanizmu Rank Math.

Istniejące narzędzie `wordpress_request` także obsługuje ten zapis, nawet zanim ChatGPT odświeży katalog nowych narzędzi:

```json
{
  "connection_id": "UUID-POŁĄCZENIA",
  "path": "/rankmath/v1/updateMeta",
  "method": "POST",
  "body": {
    "objectID": 123,
    "objectType": "post",
    "meta": {
      "rank_math_focus_keyword": "główna fraza",
      "rank_math_title": "Własny tytuł SEO",
      "rank_math_description": "Własny opis SEO"
    }
  }
}
```

## Wykrywanie operacji

`wordpress_discover` odczytuje indeks REST podłączonej witryny. Zwraca namespace, ścieżki, metody i opcjonalnie schematy parametrów. Przykład:

```json
{
  "connection_id": "UUID-POŁĄCZENIA",
  "namespace": "rankmath/v1",
  "search": "updateMeta",
  "include_schema": true,
  "limit": 20,
  "offset": 0
}
```

Gdy `next_offset` nie jest `null`, pobierz kolejną stronę wyników. Odkrycie endpointu nie potwierdza uprawnień do jego wykonania. W `wordpress_request` można również użyć `path: "/"` do odczytu całego indeksu lub `method: "OPTIONS"` dla konkretnej ścieżki. Po aktualizacji serwera ChatGPT może wymagać odświeżenia listy narzędzi połączenia, żeby pokazać `wordpress_discover` i `wordpress_rankmath_update`.

## Szersza administracja

`wordpress_request` przyjmuje względną ścieżkę REST, metodę GET/POST/PUT/PATCH/DELETE/OPTIONS, obiekt `query` i obiekt JSON `body`. Ścieżka może zaczynać się od `/`, `wp-json/` albo bez prefiksu. MCPLinker zawsze kieruje ją do `/wp-json/` podłączonej witryny, także gdy WordPress jest zainstalowany w podkatalogu.

| Obszar | Przykładowe ścieżki, jeśli witryna je udostępnia |
| --- | --- |
| Wpisy, strony, media, komentarze, użytkownicy | `wp/v2/posts`, `wp/v2/pages`, `wp/v2/media`, `wp/v2/comments`, `wp/v2/users` |
| Własne typy treści i taksonomie | Nazwa `rest_base` odczytana z `wp/v2/types` lub `wp/v2/taxonomies` |
| Wygląd i nawigacja | `wp/v2/widgets`, `wp/v2/sidebars`, `wp/v2/global-styles`, `wp/v2/navigation`, `wp/v2/templates`, `wp/v2/template-parts` |
| Ustawienia i rozszerzenia | `wp/v2/settings`, `wp/v2/plugins`, `wp/v2/themes` |
| SEO | `rankmath/v1/updateMeta`, pozostałe endpointy aktywnej wtyczki Rank Math |
| Sklep | Endpointy WooCommerce, np. `wc/v3/products` |
| Pola dodatkowe | Pola ACF wystawione w core REST lub endpointy wtyczki udostępniającej ich API |
| Inne wtyczki | Namespace i schematy zwrócone przez `wordpress_discover` |

Najpierw sprawdź schemat operacji: różne wersje WordPress i wtyczek mogą przyjmować inne parametry, wymagać dodatkowego uwierzytelniania lub nie udostępniać zapisu. Nie każda operacja dostępna w panelu ma odpowiednik w REST. Edycja plików PHP, aktualizacje rdzenia i pełne backupy potrzebują dodatkowej integracji po stronie witryny/hostingu.

Zapisy administracyjne wykonują się od razu i nie przechodzą przez kolejkę zatwierdzania postów MCPLinker. Parametry adresu podaje się osobno w `query`; pełne zewnętrzne URL, próby wyjścia z katalogu REST i nadpisywanie trasy/metody przez `rest_route`/`_method` w query są odrzucane. Hasło aplikacji pozostaje na serwerze. Żądania nie podążają za przekierowaniami z poświadczeniami.

## Diagnostyka

- HTTP 401/403: zweryfikuj hasło aplikacji, rolę konta, prawa do zasobu i ustawienia wtyczki.
- HTTP 404 / `rest_no_route`: sprawdź aktywność wtyczki oraz ścieżkę i metodę przez discovery.
- `rest_invalid_param`: sprawdź wskazane nazwy pól oraz ich schemat. MCPLinker pokazuje kod błędu i nazwy parametrów, bez surowych danych diagnostycznych mogących zawierać sekrety.
- Odpowiedź HTML zamiast JSON: możliwa strona logowania, blokada hostingu lub przekierowanie. Wynik zapisu trzeba sprawdzić przed ponowieniem.

Źródła kontraktu: [kod endpointu Rank Math](https://github.com/rankmath/seo-by-rank-math/blob/master/includes/rest/class-shared.php), [wykrywanie REST API WordPress](https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/).
