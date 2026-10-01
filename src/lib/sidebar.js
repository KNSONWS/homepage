// Seitenmenue: auf schmalen Bildschirmen (Handy) startet es eingeklappt, sonst bleiben vom Inhalt bei 390 px nur
// etwa 140 px und jede Seite scrollt waagerecht. Ausklappen geht weiterhin per Knopf.
export const AUTO_COLLAPSE_MAX_WIDTH = 720

/** true, wenn das Menue eingeklappt starten soll (Fensterbreite bis 720 px); ohne window (Test, Server) false. */
export function startsCollapsed(win = typeof window !== 'undefined' ? window : null) {
  try {
    return Boolean(win?.matchMedia?.(`(max-width: ${AUTO_COLLAPSE_MAX_WIDTH}px)`)?.matches)
  } catch {
    return false
  }
}
