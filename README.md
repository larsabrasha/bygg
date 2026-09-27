# Bygg

3D modelling of furniture, with a cut list. Runs in the browser, saves locally and syncs with your own server.

## Development

```sh
npm install
npm run dev        # app + API on http://localhost:5173, data in ./data
npm test           # unit and integration tests
npm run typecheck && npm run lint
```

## CLI

`bygg` reads and edits models from the terminal, for example on behalf of Claude (see `.claude/skills/bygg-cli`).

### Install

The server hands out the CLI as one file; installing needs Node 24 or later, not this repo:

```sh
curl -fsSL https://bygg.larsabrasha.com/install.sh | sh
```

This puts `bygg` in `~/.local/bin` (`BYGG_BIN_DIR` picks another folder) and says so if that folder is not on
your PATH. Run the same command again to update; `rm ~/.local/bin/bygg` removes it. The file is built by
`npm run build:cli` (into `dist/cli/bygg.mjs`, as in the Docker image); the script is `server/install.ts`.

To run the CLI from a clone instead, so that code changes take effect immediately: `npm install`, then `npm link`
(or `npm run -s bygg -- <command>` without linking). `npm unlink -g bygg` removes the link.

### Sign in

```sh
bygg login --server https://bygg.larsabrasha.com
```

This opens `<server>/auth/cli` in the browser (`--no-browser` just prints the address). Sign in there, create a key,
paste it into the terminal and press Enter. The key is valid for 90 days and is stored with the server address in
`~/.config/bygg/config.json`. `bygg whoami` checks it; `bygg logout` revokes it on the server and deletes it locally.

Against the dev server (`npm run dev`, the default when no server is given) no key is needed: `bygg login` just saves the address.

The address and key can also come from the environment (`BYGG_SERVER`, `BYGG_TOKEN`) or from `--server`.
Order of precedence: flag, environment, config file.

### Use

```sh
bygg help                 # all commands
bygg ops                  # the operations `edit` accepts
bygg new "Bord"
bygg edit "Bord" --ops '[{"op":"box","name":"Skiva","size":[900,22,500],"at":[0,698,0],"grain":"x"}]'
bygg cutlist "Bord"
```

The limits (`src/model/limits.ts`) apply in the app, on import, on the server and in the CLI: 500 models per account,
2,000 parts per model and everything within 100 m of the origin, among others. A key may make 120 requests per minute and
1,000 edits per day. An open app sees the CLI's changes immediately: the server pushes them on `/api/events`.

## Deployment (Docker)

A new version is released with a tag. GitHub Actions runs the tests and pushes the image to
`ghcr.io/larsabrasha/bygg` (tags `1.2.3`, `1.2` and `latest`):

```sh
git tag v1.2.3 && git push origin v1.2.3
```

On the server, next to `compose.yaml`:

```sh
docker compose pull && docker compose up -d
```

`BYGG_VERSION=1.2.3` in `.env` pins a version (for example to roll back); otherwise `latest` is used.
To build the image yourself: `docker build -t ghcr.io/larsabrasha/bygg .`

The app and the API listen on port 8787. Models are stored as JSON files in the `bygg-data` volume,
one folder per user (`users/<id>/models/<id>.json`, deleted ones in `trash/`). Back up that volume.
Models from before sign-in existed (`models/` at the top of the volume) are moved to the first user who signs in.

Without sign-in settings (as in `compose.yaml` today) the app runs without accounts only: everything is saved
in the browser, nothing is synced, and the API always answers 401. The "Logga in" (sign in) button is hidden then.

Port 8787 is open to the network in `compose.yaml`. If Caddy runs on another machine, let the firewall
admit only that machine on the port.

### Sign-in (Pocket ID)

With sign-in via https://id.larsabrasha.com, models sync between devices. In dev (`npm run dev`)
there is no sign-in; everything belongs to the dev user (`data/users/dev`). Models made without an account
do not move into the account; they have to be exported and imported by hand.

1. Create an OIDC client in Pocket ID:
   - Callback URL: `https://bygg.larsabrasha.com/auth/callback`
   - Logout Callback URL: `https://bygg.larsabrasha.com/`
   - Not "Public client" (the server has a secret). PKCE can be on.
   - To limit who may sign in: pick user groups under Allowed User Groups.
2. Put a `.env` next to `compose.yaml` (not checked in):

   ```sh
   OIDC_CLIENT_ID=…
   OIDC_CLIENT_SECRET=…
   SESSION_SECRET=…   # openssl rand -hex 32
   ```

3. Remove the `#` in front of the OIDC lines in `compose.yaml`.

If any of these settings is given, the server will not start until all of them are set (and `APP_URL`). A session lasts 30 days from sign-in.

The service worker (offline use, install as an app) requires https, so put a reverse proxy such as Caddy in front:

```
bygg.larsabrasha.com {
	reverse_proxy localhost:8787 # or the machine running the container, e.g. 192.168.1.20:8787
}
```
