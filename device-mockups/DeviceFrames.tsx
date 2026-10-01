/*
 * DeviceFrames.tsx – React-Komponenten für die Geräterahmen
 * (MacBook Pro 14" und iPhone 16 Pro, Styles in device-frames.css)
 *
 *   import { MacBookFrame, IPhoneFrame } from './DeviceFrames';
 *
 *   <MacBookFrame url="project.webklar.com" className="w-[760px]">
 *     <PortalDesktop />      // gesetzt in 1512 x 893 (Safari-Viewport)
 *   </MacBookFrame>
 *   <IPhoneFrame className="w-[220px]">
 *     <PortalMobile />       // gesetzt in 402 x 874, oben 59 / unten 34 frei lassen
 *   </IPhoneFrame>
 *
 * Die Breite des Wurzelelements bestimmt die Größe, alles andere skaliert mit
 * (beim MacBook ist das die Breite des Unterteils, der Deckel ist 87,7 % davon).
 * device-frames.js wird in React nicht gebraucht: der Hook unten skaliert.
 * Weitere Attribute (id, aria-hidden, data-*, Events …) gehen an das Wurzelelement.
 */
import { useEffect, useLayoutEffect, useRef, version } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode, RefObject } from 'react';
import './device-frames.css';

export type MacBookColor = 'silver' | 'space-black';
export type IPhoneColor = 'black' | 'natural' | 'white' | 'desert';

// useLayoutEffect warnt beim Server-Rendering, dort reicht useEffect (läuft nicht)
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Passt eine Canvas in Designgröße per transform: scale() an ihren Viewport an. */
function useCanvasScale(ref: RefObject<HTMLDivElement | null>, width: number, height: number): void {
  useIsoLayoutEffect(() => {
    const canvas = ref.current;
    const host = canvas ? canvas.parentElement : null;
    if (!canvas || !host) return undefined;
    const apply = (w: number) => {
      if (!w) return; // noch nicht sichtbar
      const k = Math.round((w / width) * 1e6) / 1e6;
      canvas.style.setProperty('--dm-dw', String(width));
      canvas.style.setProperty('--dm-dh', String(height));
      canvas.style.setProperty('--dm-k', String(k));
    };
    // Bruchteil-genaue Breite (clientWidth rundet)
    apply(parseFloat(getComputedStyle(host).width) || host.clientWidth);
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) apply(last.contentRect.width);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [ref, width, height]);
}

// inert: React 19 kennt es als boolesches Attribut (dort hieße '' "aus"),
// React 18 reicht es als unbekanntes Attribut nur als String durch ('' = gesetzt).
const INERT = (parseInt(version, 10) >= 19 ? { inert: true } : { inert: '' }) as unknown as { inert?: boolean };

/** decorative: Gerät ist ein Bild (role="img"), Inhalt nicht fokussier- oder klickbar */
function DeviceCanvas({ width, height, decorative, children }: {
  width: number;
  height: number;
  decorative?: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCanvasScale(ref, width, height);
  return (
    <div ref={ref} className="dm-canvas" {...(decorative ? INERT : null)} data-design-width={width} data-design-height={height}>
      {children}
    </div>
  );
}

/** Attribute, die an das Wurzelelement weitergereicht werden (id, aria-hidden, data-*, onClick …) */
type RootAttributes = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role' | 'color' | 'className' | 'style'>;

const cx = (...parts: Array<string | undefined | false>) => parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------ Symbole
   Alle dekorativ (aria-hidden), gezeichnet in Design-Punkten. */
const G = {
  // Ampel als eine Grafik: drei exakt gleiche Kreise bei jeder Größe
  lights: (
    <svg viewBox="0 0 52 12" aria-hidden="true" focusable="false">
      <circle cx="6" cy="6" r="5.7" fill="#ff5f57" stroke="#000" strokeOpacity=".22" strokeWidth=".6" />
      <circle cx="26" cy="6" r="5.7" fill="#febc2e" stroke="#000" strokeOpacity=".22" strokeWidth=".6" />
      <circle cx="46" cy="6" r="5.7" fill="#28c840" stroke="#000" strokeOpacity=".22" strokeWidth=".6" />
    </svg>
  ),
  apple: (
    <svg className="dm-macbook__apple" viewBox="0 0 14 17" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M11.62 9.03c-.02-1.9 1.55-2.82 1.62-2.86-.88-1.29-2.26-1.47-2.75-1.49-1.17-.12-2.28.69-2.88.69-.59 0-1.5-.67-2.47-.65A3.67 3.67 0 0 0 2.05 6.6C.73 8.88 1.71 12.27 3 14.13c.63.91 1.38 1.93 2.36 1.9.95-.04 1.31-.61 2.45-.61 1.15 0 1.47.61 2.47.59 1.02-.02 1.66-.93 2.29-1.84.72-1.06 1.02-2.08 1.03-2.13-.02-.01-1.97-.76-1.98-3.01ZM9.75 3.46c.52-.63.87-1.51.78-2.38-.75.03-1.66.5-2.2 1.13-.48.56-.9 1.45-.79 2.31.84.07 1.69-.42 2.21-1.06Z" />
    </svg>
  ),
  macBattery: (
    <svg viewBox="0 0 27 13" aria-hidden="true" focusable="false">
      <rect x=".6" y=".6" width="23.2" height="11.8" rx="3.4" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.2" />
      <rect x="2.3" y="2.3" width="16.4" height="8.4" rx="1.9" fill="currentColor" />
      <path d="M25 4.4c.9.2 1.5.9 1.5 2.1s-.6 1.9-1.5 2.1z" fill="currentColor" fillOpacity=".45" />
    </svg>
  ),
  wifi: (
    <svg viewBox="0 0 17 12.6" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2.1">
        <path d="M1.43 4.93a10 10 0 0 1 14.14 0" />
        <path d="M4.05 7.55a6.3 6.3 0 0 1 8.9 0" />
      </g>
      <path fill="currentColor" d="M8.5 12 5.95 9.45a3.6 3.6 0 0 1 5.1 0Z" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 15 15" aria-hidden="true" focusable="false">
      <circle cx="6.2" cy="6.2" r="4.9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m9.8 9.8 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  control: (
    <svg viewBox="0 0 17 14" aria-hidden="true" focusable="false">
      <rect x=".8" y=".8" width="15.4" height="5.2" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4.1" cy="3.4" r="1.7" fill="currentColor" />
      <rect x=".8" y="8" width="15.4" height="5.2" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.9" cy="10.6" r="1.7" fill="currentColor" />
    </svg>
  ),
  sidebar: (
    <svg viewBox="0 0 22 17" aria-hidden="true" focusable="false">
      <rect x=".8" y=".8" width="20.4" height="15.4" rx="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1v15" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.3 4.6h2.4M3.3 7.1h2.4M3.3 9.6h2.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  chevDown: (
    <svg viewBox="0 0 9 6" aria-hidden="true" focusable="false">
      <path d="m1 1 3.5 3.5L8 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 10 17" aria-hidden="true" focusable="false">
      <path d="M8.3 1.4 1.7 8.5l6.6 7.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  fwd: (
    <svg viewBox="0 0 10 17" aria-hidden="true" focusable="false">
      <path d="m1.7 1.4 6.6 7.1-6.6 7.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  pageMenu: (
    <svg viewBox="0 0 18 14" aria-hidden="true" focusable="false">
      <rect x=".8" y=".8" width="16.4" height="12.4" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 4.6h10M4 7h10M4 9.4h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 10 13" aria-hidden="true" focusable="false">
      <path d="M2.6 5.6V4a2.4 2.4 0 0 1 4.8 0v1.6" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <rect x=".6" y="5.4" width="8.8" height="7" rx="1.6" fill="currentColor" />
    </svg>
  ),
  reload: (
    <svg viewBox="0 0 14 15" aria-hidden="true" focusable="false">
      <path d="M12 8.4A5 5 0 1 1 9.7 3.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.4 1 11.2 3.5 8.2 5.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 16 20" aria-hidden="true" focusable="false">
      <path d="M5.2 7.2H3.4A1.9 1.9 0 0 0 1.5 9.1v7.5c0 1.05.85 1.9 1.9 1.9h9.2c1.05 0 1.9-.85 1.9-1.9V9.1a1.9 1.9 0 0 0-1.9-1.9h-1.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 12.2V1.4M4.8 4.4 8 1.2l3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 15 15" aria-hidden="true" focusable="false">
      <path d="M7.5 1v13M1 7.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  tabs: (
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <rect x="4.8" y=".9" width="12.3" height="12.3" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12.9 15.3a2.4 2.4 0 0 1-2.2 1.8H3.4A2.5 2.5 0 0 1 .9 14.6V7.3a2.4 2.4 0 0 1 1.8-2.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  cellular: (
    <svg viewBox="0 0 18 12" aria-hidden="true" focusable="false">
      <rect x="0" y="7.4" width="3.1" height="4.6" rx=".9" fill="currentColor" />
      <rect x="4.9" y="5" width="3.1" height="7" rx=".9" fill="currentColor" />
      <rect x="9.8" y="2.5" width="3.1" height="9.5" rx=".9" fill="currentColor" />
      <rect x="14.7" y="0" width="3.1" height="12" rx=".9" fill="currentColor" />
    </svg>
  ),
  iosBattery: (
    <svg viewBox="0 0 27.5 13" aria-hidden="true" focusable="false">
      <rect x=".55" y=".55" width="23.9" height="11.9" rx="3.7" fill="none" stroke="currentColor" strokeOpacity=".38" strokeWidth="1.1" />
      <rect x="2.1" y="2.1" width="18.6" height="8.8" rx="2.2" fill="currentColor" />
      <path d="M25.6 4.3c.95.25 1.5 1.05 1.5 2.2s-.55 1.95-1.5 2.2z" fill="currentColor" fillOpacity=".4" />
    </svg>
  ),
};

const MENUS = ['Ablage', 'Bearbeiten', 'Darstellung', 'Verlauf', 'Lesezeichen', 'Fenster', 'Hilfe'];

/* ------------------------------------------------------------ MacBook */
export interface MacBookFrameProps extends RootAttributes {
  /** Adresse in der Safari-Adressleiste */
  url?: string;
  color?: MacBookColor;
  /** false = Vollbild ohne macOS-Menüleiste (Streifen neben der Notch schwarz, keine Fenstertasten) */
  menuBar?: boolean;
  /** Datum und Uhrzeit rechts in der Menüleiste */
  clock?: string;
  className?: string;
  style?: CSSProperties;
  /** Setzt role="img" + aria-label; der Inhalt ist dann ein Bild (inert, nicht bedienbar) */
  label?: string;
  /** Inhalt in 1512 x 893 Design-Pixeln */
  children?: ReactNode;
}

export function MacBookFrame({
  url = 'project.webklar.com',
  color = 'silver',
  menuBar = true,
  clock = 'Do. 1. Okt.  09:41',
  className,
  style,
  label,
  children,
  ...rest
}: MacBookFrameProps) {
  return (
    <div
      {...rest}
      className={cx('dm-macbook', className)}
      data-color={color}
      data-menubar={menuBar ? undefined : 'off'}
      {...(label ? { role: 'img', 'aria-label': label } : null)}
      style={style}
    >
      <div className="dm-macbook__lid">
        <div className="dm-macbook__glass">
          <div className="dm-macbook__screen">
            {menuBar && (
              <div className="dm-macbook__menubar" aria-hidden="true">
                <div className="dm-macbook__menus">
                  {G.apple}
                  <b>Safari</b>
                  {MENUS.map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </div>
                <div className="dm-macbook__extras">
                  {G.macBattery}
                  {G.wifi}
                  {G.search}
                  {G.control}
                  <span>{clock}</span>
                </div>
              </div>
            )}
            <div className="dm-macbook__window">
              <div className="dm-macbook__toolbar" aria-hidden="true">
                <span className="dm-macbook__lights">{G.lights}</span>
                <span className="dm-macbook__tool dm-macbook__tool--sidebar">
                  {G.sidebar}
                  {G.chevDown}
                </span>
                <span className="dm-macbook__tool dm-macbook__tool--nav">
                  {G.back}
                  {G.fwd}
                </span>
                <span className="dm-macbook__address">
                  {G.pageMenu}
                  <span className="dm-macbook__url">
                    {G.lock}
                    <span>{url}</span>
                  </span>
                  {G.reload}
                </span>
                <span className="dm-macbook__tool dm-macbook__tool--right">
                  {G.share}
                  {G.plus}
                  {G.tabs}
                </span>
              </div>
              <div className="dm-macbook__viewport">
                <DeviceCanvas width={1512} height={893} decorative={!!label}>
                  {children}
                </DeviceCanvas>
              </div>
            </div>
            <div className="dm-macbook__notch" aria-hidden="true">
              <i className="dm-macbook__camera" />
            </div>
          </div>
        </div>
      </div>
      <div className="dm-macbook__hinge" aria-hidden="true" />
      <div className="dm-macbook__base" aria-hidden="true">
        <i className="dm-macbook__lip" />
      </div>
      <div className="dm-macbook__shadow" aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------ iPhone */
export interface IPhoneFrameProps extends RootAttributes {
  color?: IPhoneColor;
  /** Uhrzeit in der Statusleiste */
  time?: string;
  /** 'dark' für helle App-Inhalte (schwarze Statusleiste und Home-Balken) */
  statusBar?: 'light' | 'dark';
  className?: string;
  style?: CSSProperties;
  /** Setzt role="img" + aria-label; der Inhalt ist dann ein Bild (inert, nicht bedienbar) */
  label?: string;
  /** Inhalt in 402 x 874 Design-Pixeln (oben 59, unten 34 Safe Area) */
  children?: ReactNode;
}

export function IPhoneFrame({
  color = 'natural',
  time = '9:41',
  statusBar = 'light',
  className,
  style,
  label,
  children,
  ...rest
}: IPhoneFrameProps) {
  return (
    <div
      {...rest}
      className={cx('dm-iphone', className)}
      data-color={color}
      data-statusbar={statusBar === 'dark' ? 'dark' : undefined}
      {...(label ? { role: 'img', 'aria-label': label } : null)}
      style={style}
    >
      <span className="dm-iphone__buttons" aria-hidden="true">
        <i className="dm-iphone__btn--action" />
        <i className="dm-iphone__btn--vol-up" />
        <i className="dm-iphone__btn--vol-down" />
        <i className="dm-iphone__btn--side" />
        <i className="dm-iphone__btn--camera" />
      </span>
      <div className="dm-iphone__body">
        <div className="dm-iphone__glass">
          <div className="dm-iphone__screen">
            <div className="dm-iphone__viewport">
              <DeviceCanvas width={402} height={874} decorative={!!label}>
                {children}
              </DeviceCanvas>
            </div>
            <div className="dm-iphone__statusbar" aria-hidden="true">
              <span className="dm-iphone__time">{time}</span>
              <span className="dm-iphone__indicators">
                {G.cellular}
                {G.wifi}
                {G.iosBattery}
              </span>
            </div>
            <div className="dm-iphone__island" aria-hidden="true">
              <i />
            </div>
            <div className="dm-iphone__home" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

