/**
 * index.html med delningsbildens adress absolut (og:image), räknad från APP_URL. Facebook
 * och LinkedIn läser inte relativa adresser; andra klarar sig med den relativa som står i
 * filen. Utan APP_URL lämnas filen som den är.
 */
export function withAppUrl(html: string, appUrl: string | undefined): string {
  if (!appUrl || !URL.canParse(appUrl)) return html
  return html.replace(
    /(<meta property="og:image" content=")(\/[^"]*)"/,
    (_, start: string, path: string) => `${start}${new URL(path, appUrl).href}"`,
  )
}
