# Geräte-Mockups: MacBook Pro 14" und iPhone 16 Pro

Realistische Geräterahmen für die Kundenportal-Sektion der Startseite. Sie sind in reinem HTML und CSS gebaut, ohne Bilder.

- Eine einzige Breite skaliert das ganze Gerät (beim MacBook ist das die Breite des Unterteils).
- Der Inhalt, also das Portal, wird in echter Bildschirmgröße gesetzt und dann verkleinert. Darum wirkt er wie auf einem echten Gerät.
- Die Maße stammen von den echten Geräten: Notch, Dynamic Island, Ränder, Radien und Tasten.

![Sektion auf dem Desktop](preview/desktop.png)

| MacBook Pro 14" | iPhone 16 Pro |
| --- | --- |
| ![MacBook Nahaufnahme](preview/closeup-macbook.png) | ![iPhone Nahaufnahme](preview/closeup-iphone.png) |

Mobil (390 px breit, bis 520 px ist das iPhone das Hauptgerät): [preview/mobile.png](preview/mobile.png) · Farbvarianten auf hellem Hintergrund: [preview/variants-light.png](preview/variants-light.png)

## Dateien

| Datei | Wofür |
| --- | --- |
| `device-frames.css` | Die Rahmen. Alle Klassen beginnen mit `dm-`. |
| `DeviceFrames.tsx` | React-Komponenten `MacBookFrame` und `IPhoneFrame`. |
| `device-frames.js` | Skalierung für Seiten ohne React. |
| `demo/index.html` | Nachbau der Sektion mit Funktionsliste. Zum Ansehen die Datei im Browser öffnen. |
| `demo/closeup.html` | Nahaufnahmen. Mit `#macbook` oder `#iphone` am Ende der Adresse wird nur ein Gerät gezeigt. |
| `demo/variants.html` | Alle Farbvarianten. |
| `demo/portal-screens.css` | Styles der Beispiel-Bildschirme. Nur für die Demo nötig. |
| `preview/` | Screenshots. |

## Einbau in die React-Startseite

1. Kopiere `DeviceFrames.tsx` und `device-frames.css` in denselben Ordner, zum Beispiel `src/components/device-frames/`. Die Komponente importiert die CSS selbst, mit Vite ist also nichts weiter zu tun.
2. Den bisherigen Bildschirminhalt in die Rahmen packen:

```tsx
import { MacBookFrame, IPhoneFrame } from './components/device-frames/DeviceFrames';

<MacBookFrame url="project.webklar.com" className="w-full max-w-[760px]">
  <PortalDesktop />   {/* gesetzt in 1512 x 893 */}
</MacBookFrame>

<IPhoneFrame className="w-[220px]">
  <PortalMobile />    {/* gesetzt in 402 x 874 */}
</IPhoneFrame>
```

3. Die Größe stellst du nur über die Breite ein, per Klasse oder `style`. Die Höhe ergibt sich von selbst.
   - Beim MacBook ist das die Breite des Unterteils. Der Deckel ist 87,7 % davon. Für einen Deckel von 688 px brauchst du also `w-[784px]`.
   - Das Elternelement muss eine Breite vorgeben. In `inline-block`-, `w-fit`- oder `float`-Containern und in absolut positionierten Hüllen ohne Breite wird das Gerät 0 px breit.
4. Auf Geräten ohne Apple-Systemschrift (Windows, Android) Inter laden, über Google Fonts oder selbst gehostet. Sonst wirken Menüleiste, Adressleiste und Statusleiste nicht echt.

So ordnest du die Geräte wie in der Demo an, mit dem Handy über der rechten unteren Ecke des MacBooks. Unter 520 px wird das iPhone größer, damit sein Inhalt lesbar bleibt:

```tsx
<div className="relative aspect-[1/0.9] max-[520px]:aspect-[1/1.18] [container-type:inline-size]">
  <MacBookFrame className="absolute left-0 top-0 w-[99cqw] max-[520px]:w-[88cqw]">…</MacBookFrame>
  <IPhoneFrame className="absolute left-[71.8cqw] top-[29.7cqw] w-[28.2cqw] max-[520px]:left-[55cqw] max-[520px]:top-[24cqw] max-[520px]:w-[44cqw]">…</IPhoneFrame>
</div>
```

Das rechte Ende des MacBook-Unterteils liegt dabei hinter dem Handy. Die Demo hat zusätzlich eine Stufe für Tablets bis 980 px, siehe `demo/index.html`.

Die Wurzelregeln der Rahmen haben die Spezifität 0 (`:where()`). Tailwind-Klassen wie `absolute` oder `w-…` greifen deshalb ohne `!important`.

## Designgrößen und Safe Areas

| Rahmen | Inhalt wird gesetzt in | Frei lassen |
| --- | --- | --- |
| `MacBookFrame` | 1512 × 893 px. Das ist das Safari-Fenster unter der macOS-Menüleiste und der Symbolleiste. | Nichts. Menüleiste, Notch und Safari-Leiste liegen oberhalb des Inhaltsbereichs, nicht darüber. |
| `IPhoneFrame` | 402 × 874 px, der ganze Bildschirm | Oben 59 px für Statusleiste und Dynamic Island, unten 34 px für den Home-Balken |

Der Inhalt wird mit `transform: scale()` verkleinert. Daraus folgt:

- Den Inhalt auf genau diese Größe bauen, mit festen px-Maßen oder mit 100 % Breite und Höhe.
- Media Queries und Tailwind-Breakpoints (`sm:`, `md:`, `lg:` …) beziehen sich im Inhalt auf das Browserfenster, nicht auf das Gerät. Lass sie im Inhalt weg. `vw` und `vh` gehören aus demselben Grund nicht in den Inhalt.
- Brauchst du doch Anpassungen, nimm Container Queries. Die Inhaltsfläche (`.dm-canvas`) ist ein Container: 100cqw entsprechen 1512 px beim MacBook und 402 px beim iPhone.
- Schrift und Farbe erbt der Inhalt von der Seite. Ist das nicht gewünscht, setze beides im Inhalt selbst.

## Props

**`MacBookFrame`**

| Prop | Standard | Bedeutung |
| --- | --- | --- |
| `url` | `'project.webklar.com'` | Adresse in der Safari-Adressleiste |
| `color` | `'silver'` | `'silver'` oder `'space-black'` |
| `menuBar` | `true` | Mit `false` wird Safari im Vollbild gezeigt: keine macOS-Menüleiste und keine Fenstertasten, der Streifen neben der Notch ist schwarz. Der Inhalt bleibt 1512 × 893. |
| `clock` | `'Do. 1. Okt.  09:41'` | Datum und Uhrzeit rechts in der Menüleiste |
| `className`, `style` | – | Größe und Position |
| `label` | – | Siehe unten |
| `children` | – | Inhalt in 1512 × 893 |

**`IPhoneFrame`**

| Prop | Standard | Bedeutung |
| --- | --- | --- |
| `color` | `'natural'` | `'natural'`, `'black'`, `'white'` oder `'desert'` |
| `time` | `'9:41'` | Uhrzeit in der Statusleiste |
| `statusBar` | `'light'` | Für helle App-Inhalte `'dark'`: Statusleiste und Home-Balken werden dann schwarz |
| `className`, `style` | – | Größe und Position |
| `label` | – | Siehe unten |
| `children` | – | Inhalt in 402 × 874 |

Alle weiteren Attribute gehen an das äußere `div`, zum Beispiel `id`, `aria-hidden`, `data-*` oder Event-Handler.

`label`: Mit diesem Prop bekommt das Gerät `role="img"` und den Text als `aria-label`. Screenreader lesen den Inhalt dann als ein Bild mit dieser Beschreibung. Der Inhalt wird außerdem `inert`: Links und Buttons darin sind nicht per Tab erreichbar und nicht anklickbar. Das passt, wenn der Text daneben schon alles erklärt, wie bei der Funktionsliste. Ohne `label` bleibt der Inhalt lesbar und bedienbar. Zeigen beide Geräte denselben Inhalt, gib mindestens einem ein `label`, sonst stehen Überschriften und Links doppelt in der Seite. Die Teile des Rahmens, also Menüleiste, Statusleiste und Symbole, sind immer `aria-hidden`.

## Farbvarianten

![Farbvarianten](preview/variants-light.png)

| Gerät | `color` |
| --- | --- |
| MacBook | `silver` (Standard), `space-black` |
| iPhone | `natural` (Titan Natur, Standard), `black`, `white`, `desert` (Wüstensand) |

Auf dunklem Hintergrund hebt sich das silberne MacBook am deutlichsten ab. Space Schwarz wirkt dort zurückhaltender.

## Ohne TypeScript (reines JavaScript)

Benenne die Datei in `DeviceFrames.jsx` um und entferne die Typen:

- die Zeile `import type …`
- die beiden Zeilen `export type …` und die Zeile `type RootAttributes = …`
- die beiden `interface`-Blöcke
- den Zusatz `as unknown as { inert?: boolean }` bei `const INERT`
- die Typangaben an Parametern, zum Beispiel `: MacBookFrameProps`, `: number`, `: void`, `<HTMLDivElement>` und den Typblock hinter `function DeviceCanvas({ … })`

Das geht auch automatisch:

```sh
npx esbuild DeviceFrames.tsx --jsx=preserve --outfile=DeviceFrames.jsx
```

Dabei werden nur die Typen entfernt, das Markup bleibt gleich. Die Kommentare gehen dabei verloren.

## Ohne React (statisches HTML)

1. Übernimm die Blöcke `.dm-macbook` und `.dm-iphone` aus `demo/index.html` und setze deinen Inhalt in die `.dm-canvas`. Das Attribut `inert` an der `.dm-canvas` gehört zu `role="img"`. Lässt du `role="img"` weg, entferne auch `inert`.
2. Binde `device-frames.css` ein.
3. Lade `device-frames.js` am Ende von `<body>`.

Das Skript erkennt auch Geräte, die erst später eingefügt werden. Ohne das Skript skaliert die CSS den Inhalt trotzdem nach der Breite. Dafür braucht es einen aktuellen Browser.

## Browser

Die Rahmen brauchen Container Queries: ab Chrome und Edge 105, Safari 16 und Firefox 110. `inert` wirkt ab Firefox 112. Davor sperrt die CSS nur Klicks, nicht die Tab-Taste.
