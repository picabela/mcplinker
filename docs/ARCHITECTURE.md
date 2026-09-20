# Architektura i bezpieczeństwo

## Składniki

- Next.js App Router: panel, logowanie i formularz zgody OAuth.
- `lib/actions.mjs`: wspólny rejestr operacji, schematy Zod, kontrola zakresów i marek, dziennik działań.
- `lib/providers.mjs`: adaptery oficjalnych API Facebook, LinkedIn i WordPress.
- `lib/mcp.mjs`: bezstanowy transport JSON-RPC przez HTTP, negocjacja wersji, lista i wykonywanie narzędzi.
- `lib/oauth.mjs`: metadane, rejestracja klienta, zgoda, authorization code, PKCE, obrót refresh tokenów i revocation.
- `lib/provider-oauth.mjs`: OAuth Meta/LinkedIn do podłączenia kont właściciela.
- `lib/worker.mjs`: kolejka publikacji oraz automatyzacje źródeł.
- Supabase: PostgreSQL, Auth i funkcje transakcyjne.

## Izolacja

Każdy rekord roboczy należy do `owner_id`. Agent ma listę `brand_ids` i zakresów; operacje sprawdzają jednocześnie właściciela, markę i zakres. Złożone klucze obce uniemożliwiają przypisanie wpisu do konta innej marki. Panel wymaga sesji Supabase i e-maila odpowiadającego konfiguracji właściciela.

RLS jest aktywne. Użytkownicy `authenticated` mają ograniczone odczyty własnych niesekretnych tabel. Zapisy przechodzą przez serwer. Tabele poświadczeń i OAuth nie mają polityk dla przeglądarki; brak takich polityk oznacza celową odmowę dostępu. `service_role` jest używany wyłącznie na serwerze. Nie wolno wystawiać klucza serwerowego w bundle klienta.

## Poświadczenia i ruch sieciowy

- Poświadczenia platform: AES-256-GCM; dodatkowe dane uwierzytelnione wiążą szyfrogram z właścicielem, marką i platformą.
- Tokeny agentów, kody OAuth, refresh/access tokeny i state: w bazie skróty SHA-256; pełne wartości są wydawane odbiorcy tylko w odpowiedniej odpowiedzi.
- Panel: HttpOnly cookies, SameSite=Lax, Secure w HTTPS oraz weryfikacja Origin przy zmianach.
- MCP: Bearer, sprawdzanie revocation i terminu ważności w bazie przy każdym żądaniu, weryfikacja Origin jeśli obecny.
- OAuth: dokładne callbacki z allowlisty, PKCE S256, kody jednorazowe i tokeny przypisane do resource `/mcp`; refresh tokeny obracane atomowo.
- Outbound: HTTPS, brak poświadczeń w URL, odrzucanie IP/private DNS, przypięcie zatwierdzonego IPv4 do połączenia TLS, zakaz podążania za przekierowaniami, timeout i limit odpowiedzi.
- Upload LinkedIn akceptuje wyłącznie HTTPS `www.linkedin.com/dms-uploads/`; token nie jest przesyłany do dowolnego hosta zwróconego w danych.
- Odpowiedzi platform są oczyszczane z pól tokenów i sekretów w URL paginacji.

## Publikowanie i spójność

Szkic otrzymuje `dedupe_key` unikalny dla właściciela. Ponowienie tego samego żądania zwraca istniejący szkic; inna treść pod tym samym kluczem daje konflikt. Stan i `updated_at` są porównywane przy zapisie. Edycja i zatwierdzenie wymagają wersji odczytanej przez klienta. Edycja usuwa akceptację.

Worker pobiera wpis przy użyciu `FOR UPDATE SKIP LOCKED`, oznacza go jako przetwarzany i zakłada token blokady. Polityka akceptacji jest sprawdzana jeszcze raz przed wysłaniem. Jawne odrzucenie przez platformę jest błędem; niepewny wynik sieciowy lub zapis potwierdzenia wymagają ręcznej weryfikacji. Nie istnieje gwarancja exactly-once między bazą a obcym API bez wspólnej transakcji; dlatego system celowo nie ponawia automatycznie niepewnych publikacji.

Automatyzacje mają lease i deterministyczny klucz dla elementu źródła oraz konta docelowego. Reguły tworzą wyłącznie szkice. Pobrana treść pozostaje niezaufanymi danymi; serwer nie wykonuje instrukcji zawartych w RSS, wpisach ani komentarzach.

## Istotne granice

Zakres `admin` oznacza bezpośrednie operacje na WordPress i usuwanie wpisów. Nie przechodzą przez zwykły etap akceptacji publikacji. Nadawaj go tylko agentom, które mają wykonywać takie zadania. Sekrety aplikacji Meta/LinkedIn, łączenie kont, tworzenie tokenów i odwoływanie autoryzacji są dostępne wyłącznie właścicielowi panelu.

Nie ma pełnego audytu niezależnego ani testów penetracyjnych. Testy repozytorium sprawdzają najważniejsze granice logiczne, protokół i ochronę poświadczeń, lecz nie zastępują weryfikacji na realnym wdrożeniu. Eksport aplikacji nie jest kopią całej bazy z poświadczeniami. Kopie zapasowe i odtwarzanie należy skonfigurować w Supabase.
