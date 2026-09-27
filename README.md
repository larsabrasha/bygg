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

```sh
docker compose up -d
```

Appen och API:t nås på port 8787. Modellerna ligger som JSON-filer i volymen `bygg-data`,
en mapp per användare (`users/<id>/models/<id>.json`, borttagna i `trash/`). Säkerhetskopiera den volymen.
Modellerna från före inloggningen (`models/` direkt i volymen) flyttas till den första som loggar in.

### Inloggning (Pocket ID)

Appen kräver inloggning via https://id.larsabrasha.com. I dev (`npm run dev`) finns ingen inloggning;
där gäller allt dev-användaren (`data/users/dev`).

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

Servern startar inte om något av detta saknas. Sessionen räcker i 30 dagar från inloggningen.

Service worker (offline, installera som app) kräver https, så lägg en omvänd proxy som Caddy framför:

```
bygg.larsabrasha.com {
	reverse_proxy localhost:8787
}
```
