import { Button } from '../ui'

/**
 * Blätterleiste „Zurück · Seite 2 von 5 · 230 Buchungen · Weiter“; bei nur einer Seite erscheint sie nicht.
 * `noun` ist die Mehrzahl, z. B. „Buchungen“.
 */
export default function Pager({ page, pages, total, noun = 'Einträge', onPage }) {
  if (pages <= 1) return null
  return (
    <nav className="fin-pager" aria-label={`Seiten der ${noun}`}>
      <Button size="sm" variant="ghost" onClick={() => onPage(page - 1)} disabled={page <= 1}>
        Zurück
      </Button>
      <span className="fin-pager-info" aria-live="polite">
        Seite {page} von {pages}
        {typeof total === 'number' ? ` · ${total} ${noun}` : ''}
      </span>
      <Button size="sm" variant="ghost" onClick={() => onPage(page + 1)} disabled={page >= pages}>
        Weiter
      </Button>
    </nav>
  )
}
