# Stan weryfikacji

## Wykonane

- Kompilacja produkcyjna Next.js i sprawdzenie TypeScript.
- Testy Node obejmujące szyfrowanie z przypisaniem do marki, izolację zakresów, odwołanie tokenów, powiązanie OAuth z resource, PKCE, ochronę SSRF, callbacki, stronicowanie bez sekretów, protokół MCP i cykl akceptacji publikacji.
- Testy transakcyjne wdrożonego schematu Supabase: izolacja RLS, brak dostępu do tabel sekretów dla użytkownika przeglądarki, blokowanie powtórnego pobrania wpisu i jednorazowe zużycie kodu OAuth. Dane testowe wycofano przez ROLLBACK.
- Kontrola lockfile przez npm w trybie offline.

## Do wykonania po konfiguracji

- Weryfikacja wizualna w przeglądarce oraz pełne formularze na telefonie i komputerze. Przeglądarka środowiska roboczego odrzuciła lokalny adres `127.0.0.1` komunikatem `ERR_BLOCKED_BY_CLIENT`.
- Połączenie produkcyjnego ChatGPT przez OAuth, zgoda marek, wykonanie narzędzia i odwołanie autoryzacji.
- Logowanie właściciela, rzeczywiste konta platform, upload mediów i publikacja uzgodnionej treści testowej.
- Harmonogram na wdrożonym hostingu, powtarzalne wywołania i monitorowanie.
- Wynik GitHub Actions po push; lokalny build nie zastępuje odbioru produkcji.

Vercel w bieżącej sesji nie zwraca zespołów, a dostępna operacja wdrożenia odpowiada `Tool deploy_to_vercel not found`. Repozytorium można zaimportować ręcznie, a kolejne commity wdrażać automatycznie.
