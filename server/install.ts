/**
 * /install.sh: installerar CLI:t med `curl -fsSL <server>/install.sh | sh`. Skriptet hämtar
 * <server>/cli/bygg.mjs (byggs av scripts/buildCli.mjs) till ~/.local/bin/bygg. Det kräver
 * bara Node, inte repot. Samma kommando uppdaterar. Adressen i skriptet är serverns egen,
 * så att det hämtar från och loggar in mot samma ställe.
 */

export const NODE_MAJOR = 24

export function installScript(server: string): string {
  const origin = new URL(server).origin
  return `#!/bin/sh
# Installs the bygg CLI from ${origin}: curl -fsSL ${origin}/install.sh | sh
# Put it elsewhere with BYGG_BIN_DIR=/some/dir. Run it again to update.
set -eu

server='${origin}'
bin_dir="\${BYGG_BIN_DIR:-$HOME/.local/bin}"

fail() { echo "bygg: $*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl saknas."
command -v node >/dev/null 2>&1 || fail "Node saknas. Installera Node ${NODE_MAJOR} eller senare (https://nodejs.org), sedan det här igen."
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge ${NODE_MAJOR} ] || fail "bygg behöver Node ${NODE_MAJOR} eller senare, du har $(node --version)."

mkdir -p "$bin_dir"
tmp="$bin_dir/.bygg.$$"
trap 'rm -f "$tmp"' EXIT
curl -fsSL "$server/cli/bygg.mjs" -o "$tmp" || fail "kunde inte hämta $server/cli/bygg.mjs."
chmod 755 "$tmp"
mv -f "$tmp" "$bin_dir/bygg"

echo "Installerade bygg i $bin_dir/bygg."
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "$bin_dir finns inte i PATH. Lägg till den, t.ex. i ~/.zshrc:"
     echo "  export PATH=\\"$bin_dir:\\$PATH\\"" ;;
esac
echo "Logga in: bygg login --server $server"
`
}
