---
name: bygg-cli
description: Modellera möbler i Bygg-appen från terminalen med CLI:t `bygg` – skapa och ändra modeller (lådor, cylindrar, länkade kopior, tappar, urtag, parametrar) och ta fram kaplista och kapschema. Använd när användaren vill att du bygger, ändrar eller räknar på en modell i Bygg, t.ex. "rita en bokhylla i bygg", "gör ett bord 120 × 80", "vad blir kaplistan", "hur mycket virke behövs".
---

# Bygg-CLI

Kör `npm run -s bygg -- <kommando>` i repot (eller `bygg` om det är länkat med `npm link`).
Läs först `npm run -s bygg -- help` och `npm run -s bygg -- ops`; de beskriver alla kommandon och operationer.

Arbetsgång:

1. `bygg whoami` visar om du når en server. Säger den "Inte inloggad" ska användaren själv köra
   `bygg login --server https://…` (nyckeln klistras in för hand). Be aldrig om nyckeln i chatten.
   Utan server går det att arbeta i en lokal fil: `bygg new "Bord" --file bord.bygg.json`.
2. Planera måtten i mm. x åt höger, y uppåt, z framåt; golvet är y = 0; `at` är hörnet närmast origo.
   Sätt `grain` (fiberns axel) på varje del, annars gissas den.
3. Skriv alla operationer för ett steg i en lista och kör `bygg edit <modell> --dry-run --show --ops '[…]'`.
   Kontrollera läge och mått i utskriften, kör sedan samma rad utan `--dry-run`.
4. Visa resultatet med `bygg cutlist <modell>` och `bygg cutplan <modell>`.

Regler:

- Ett edit är allt eller inget. Säger det "Inget sparades" har modellen inte ändrats; rätta och kör om.
- Gränser: se `bygg limits`. Försök inte gå runt dem genom att dela upp i fler modeller.
- Nyckeln har en takt-gräns (120 anrop per minut). Samla ändringar i få edit-anrop i stället för många små.
- `delete` flyttar till serverns papperskorg och kräver `--yes`; fråga användaren först.
- Användaren ser modellen i appen efter nästa synk. Bilden i startvyn uppdateras först när modellen öppnas där.
