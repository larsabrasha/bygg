---
name: bygg-cli
description: Model furniture in the Bygg app from the terminal with the `bygg` CLI – create and edit models (boxes, cylinders, linked copies, tenons, cutouts, parameters) and produce the cut list and cutting plan. Use when the user wants you to build, change or calculate a model in Bygg, e.g. "rita en bokhylla i bygg", "gör ett bord 120 × 80", "vad blir kaplistan", "hur mycket virke behövs".
---

# Bygg CLI

Run `npm run -s bygg -- <command>` in the repo (or `bygg` if it is linked with `npm link`).
First read `npm run -s bygg -- help` and `npm run -s bygg -- ops`; they describe all commands and operations.

Workflow:

1. `bygg whoami` shows whether you can reach a server. If it says "Inte inloggad" (not signed in), the user must run
   `bygg login --server https://…` themselves (the key is pasted in by hand). Never ask for the key in the chat.
   Without a server you can work in a local file: `bygg new "Bord" --file bord.bygg.json`.
2. Plan the dimensions in mm. x to the right, y up, z forward; the floor is y = 0; `at` is the corner closest to the origin.
   Set `grain` (the grain axis) on every part, otherwise it is guessed.
3. Write all operations for one step in a list and run `bygg edit <model> --dry-run --show --ops '[…]'`.
   Check position and dimensions in the output, then run the same line without `--dry-run`.
4. Show the result with `bygg cutlist <model>` and `bygg cutplan <model>`.

Rules:

- An edit is all or nothing. If it says "Inget sparades" (nothing was saved), the model is unchanged; fix it and run again.
- Limits: see `bygg limits`. Do not try to get around them by splitting into more models.
- The key is rate limited (120 requests per minute). Collect changes into a few edit calls instead of many small ones.
- `delete` moves the model to the server's trash and requires `--yes`; ask the user first.
- The user sees the model in the app after the next sync. The thumbnail on the start view updates only when the model is opened there.
