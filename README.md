# Bygg

3D-modellering av möbler med kaplista. Körs i webbläsaren, sparar lokalt och synkar mot en egen server.

## Utveckling

```sh
npm install
npm run dev        # app + API på http://localhost:5173, data i ./data
npm test           # enhets- och integrationstester
npm run typecheck && npm run lint
```

## CLI

`bygg` läser och ändrar modellerna från terminalen, t.ex. åt Claude (se `.claude/skills/bygg-cli`).

```sh
npm run -s bygg -- help                 # alla kommandon; `ops` visar operationerna för edit
npm run -s bygg -- login --server https://bygg.larsabrasha.com
npm run -s bygg -- new "Bord"
npm run -s bygg -- edit "Bord" --ops '[{"op":"box","name":"Skiva","size":[900,22,500],"at":[0,698,0],"grain":"x"}]'
npm run -s bygg -- cutlist "Bord"
```

`login` öppnar `/auth/cli`, där man inloggad skapar en nyckel och klistrar in den. Nyckeln gäller i 90 dagar
och sparas i `~/.config/bygg/config.json`. Mot dev-servern behövs ingen nyckel. `npm link` ger kommandot `bygg`.

Gränserna (`src/model/limits.ts`) gäller i appen, vid import, på servern och i CLI:t: 500 modeller per konto,
2 000 delar per modell och allt inom 100 m från origo, med flera. En nyckel får göra 120 anrop per minut och
1 000 ändringar per dygn. En öppen app ser CLI:ts ändringar direkt: servern skickar ut dem på `/api/events`.

## Driftsättning (Docker)

En ny version släpps med en tagg. GitHub Actions kör testerna och lägger imagen på
`ghcr.io/larsabrasha/bygg` (taggarna `1.2.3`, `1.2` och `latest`):

```sh
git tag v1.2.3 && git push origin v1.2.3
```

På servern, bredvid `compose.yaml`:

```sh
docker compose pull && docker compose up -d
```

`BYGG_VERSION=1.2.3` i `.env` låser en version (till exempel för att gå tillbaka); annars gäller `latest`.
Bygga imagen själv: `docker build -t ghcr.io/larsabrasha/bygg .`

Appen och API:t nås på port 8787. Modellerna ligger som JSON-filer i volymen `bygg-data`,
en mapp per användare (`users/<id>/models/<id>.json`, borttagna i `trash/`). Säkerhetskopiera den volymen.
Modellerna från före inloggningen (`models/` direkt i volymen) flyttas till den första som loggar in.

Utan inställningar för inloggningen (som i `compose.yaml` nu) körs appen bara utan konto: allt sparas
i webbläsaren, inget synkas, och API:t svarar alltid 401. Knappen "Logga in" syns inte då.

Porten 8787 är öppen mot nätet i `compose.yaml`. Står Caddy på en annan maskin: låt brandväggen bara
släppa in den maskinen på porten.

### Inloggning (Pocket ID)

Med inloggning via https://id.larsabrasha.com synkas modellerna mellan enheterna. I dev (`npm run dev`)
finns ingen inloggning; där gäller allt dev-användaren (`data/users/dev`). Modeller som gjorts utan konto
följer inte med in i kontot; de får exporteras och importeras för hand.

1. Skapa en OIDC-klient i Pocket ID:
   - Callback URL: `https://bygg.larsabrasha.com/auth/callback`
   - Logout Callback URL: `https://bygg.larsabrasha.com/`
   - Inte "Public client" (servern har en hemlighet). PKCE kan vara på.
   - Vill du begränsa vilka som får logga in: välj användargrupper under Allowed User Groups.
2. Lägg en `.env` bredvid `compose.yaml` (checkas inte in):

   ```sh
   OIDC_CLIENT_ID=…
   OIDC_CLIENT_SECRET=…
   SESSION_SECRET=…   # openssl rand -hex 32
   ```

3. Ta bort `#` framför OIDC-raderna i `compose.yaml`.

Anges någon av inställningarna startar servern inte förrän alla finns (och `APP_URL`). Sessionen räcker i 30 dagar från inloggningen.

Service worker (offline, installera som app) kräver https, så lägg en omvänd proxy som Caddy framför:

```
bygg.larsabrasha.com {
	reverse_proxy localhost:8787 # eller maskinen där containern körs, t.ex. 192.168.1.20:8787
}
```
