Sehr geehrtes Hetzner Team,

bezüglich der Portscan Erkennung von unserer IP Adresse 91.99.156.85 am 30.12.2025 um 10:59:37 UTC möchten wir die Ursache erläutern.

Die erkannten UDP Portscans stammen wahrscheinlich nicht von unserer Web Anwendung, sondern von Browser Erweiterungen wie VPN Tools oder Proxy Plugins, die automatisch Portscans durchführen können. Diese laufen im Hintergrund und sind dem Benutzer oft nicht bewusst.

Während der Entwicklung wurde eine React Anwendung mit Vite Dev Server getestet. Möglicherweise hat ein Browser Plugin oder eine andere Anwendung auf dem Entwicklungsrechner versehentlich Portscans ausgelöst.

Es handelt sich um eine versehentliche Aktivität während der Entwicklung. Es gab keine absichtliche Portscan Aktivität oder Angriffsversuche.

Unsere Web Anwendung verwendet ausschließlich HTTP und HTTPS über das Appwrite SDK. Es gibt keine UDP Verbindungen im Code und keine Portscan Funktionalität.

Wir bitten um Entsperrung unserer IP Adresse 91.99.156.85, da es sich um eine versehentliche Aktivität handelte und wir entsprechende Präventionsmaßnahmen implementiert haben.

Mit freundlichen Grüßen
