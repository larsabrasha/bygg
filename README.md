# Bygg

3D-modellering av möbler med kaplista. Körs i webbläsaren, sparar lokalt och synkar mot en egen server.

## Utveckling

```sh
npm install
npm run dev        # app + API på http://localhost:5173, data i ./data
npm test           # enhets- och integrationstester
npm run typecheck && npm run lint
```

## Driftsättning (Docker)

```sh
docker compose up -d
```

Appen och API:t nås på port 8787. Modellerna ligger som JSON-filer i volymen `bygg-data`
(`models/<id>.json`, borttagna i `trash/`). Säkerhetskopiera den volymen.

Servern har ingen inloggning och är tänkt att nås bara i det egna nätet. Service worker
(offline, installera som app) kräver https utom på localhost, så lägg en omvänd proxy
som Caddy framför, t.ex. `bygg.lan { reverse_proxy localhost:8787 }`.
