import { Hono, type Context } from 'hono'
import type { Auth, User } from './auth'
import type { TokenInfo, TokenStore } from './tokens'
import { TOKEN_DAYS } from './tokens'

/**
 * /auth/cli: sidan där man, inloggad i webbläsaren, skapar och tar bort nycklar för CLI:t.
 * Ändringar är formulär med POST; session-cookien är SameSite=Lax och följer inte med
 * från en annan sajt, och origin-kontrollen i app.ts stoppar dem också.
 */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

const day = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium' })

function page(c: Context, user: User, tokens: TokenInfo[], created?: string) {
  const rows = tokens
    .map(
      (t) =>
        `<li><span><b>${esc(t.label)}</b><br><small>Skapad ${day.format(new Date(t.createdAt))}, gäller till ${day.format(new Date(t.expiresAt))}</small></span>` +
        `<form method="post" action="/auth/cli/revoke"><input type="hidden" name="id" value="${esc(t.id)}"><button>Ta bort</button></form></li>`,
    )
    .join('')
  const fresh = created
    ? `<section class="new"><p>Din nya nyckel. Den visas bara nu. Klistra in den när <code>bygg login</code> frågar efter den:</p>` +
      `<input readonly value="${esc(created)}" onclick="this.select()" aria-label="Nyckel"></section>`
    : ''
  return c.html(
    `<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
      `<meta name="referrer" content="no-referrer"><title>Bygg – nycklar för CLI</title>` +
      `<style>body{font-family:system-ui;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.4}` +
      `ul{padding:0;list-style:none}li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #ddd}` +
      `button{font:inherit;border:0;border-radius:8px;padding:8px 14px;background:#e9e6df;cursor:pointer}` +
      `.new{background:#eef6ee;border-radius:8px;padding:12px}.new input{width:100%;font:13px ui-monospace,monospace;padding:8px;box-sizing:border-box}` +
      `input[name=label]{font:inherit;padding:7px;flex:1}form.add{display:flex;gap:8px}</style>` +
      `<h1>Nycklar för CLI</h1>` +
      `<p>Inloggad som ${esc(user.name)}. En nyckel låter ett program (till exempel <code>bygg</code> i terminalen, ` +
      `eller Claude via den) läsa och ändra dina modeller. Den gäller i ${TOKEN_DAYS} dagar.</p>` +
      fresh +
      `<form class="add" method="post" action="/auth/cli"><input name="label" placeholder="Vad nyckeln är till, t.ex. datorns namn" maxlength="100"><button>Skapa nyckel</button></form>` +
      (tokens.length ? `<h2>Dina nycklar</h2><ul>${rows}</ul>` : '<p>Du har inga nycklar än.</p>') +
      `<p><a href="/">Till appen</a></p></html>`,
    200,
    { 'cache-control': 'no-store' },
  )
}

export function cliRoutes(auth: Auth, tokens: TokenStore) {
  const routes = new Hono()

  routes.get('/', async (c) => {
    const user = await auth.user(c)
    if (!user) return c.redirect('/auth/login?return=/auth/cli')
    return page(c, user, await tokens.list(user.sub))
  })

  routes.post('/', async (c) => {
    const user = await auth.user(c)
    if (!user) return c.redirect('/auth/login?return=/auth/cli', 303)
    const form = await c.req.parseBody()
    const label = typeof form.label === 'string' ? form.label : ''
    const { token } = await tokens.create(user, label)
    return page(c, user, await tokens.list(user.sub), token)
  })

  routes.post('/revoke', async (c) => {
    const user = await auth.user(c)
    if (!user) return c.redirect('/auth/login?return=/auth/cli', 303)
    const form = await c.req.parseBody()
    if (typeof form.id === 'string') await tokens.revoke(user.sub, form.id)
    return c.redirect('/auth/cli', 303)
  })

  return routes
}
