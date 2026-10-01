Sehr geehrtes Hetzner Team,

bezüglich der Portscan Erkennung haben wir folgende Präventionsmaßnahmen implementiert.

Code Optimierungen: Filter Eingaben lösen keine sofortigen API Aufrufe mehr aus. API Aufrufe erfolgen nur noch beim expliziten Klick auf den Apply Button. Dies reduziert unnötige TCP Verbindungen um etwa 90 Prozent.

Es gibt keine automatischen Polling Funktionen und keine setInterval basierten Refresh Mechanismen. API Aufrufe erfolgen nur bei Benutzerinteraktionen.

Entwicklungsrichtlinien: Entwickler wurden angewiesen, VPN und Proxy Erweiterungen während der Entwicklung zu deaktivieren. Security Plugins werden vor dem Testen überprüft.

Netzwerk Monitoring: Regelmäßige Überprüfung der Netzwerk Aktivitäten und Logging von API Aufrufen für bessere Nachverfolgbarkeit.

Server seitige Maßnahmen: Implementierung von Request Limits auf Anwendungsebene um versehentliche Massen Requests zu verhindern. Wiederverwendung von HTTP Verbindungen reduziert die Anzahl neuer TCP Verbindungen.

Zukünftige Prävention: Alle Netzwerk bezogenen Änderungen werden vor dem Deployment überprüft. Automatische Tests für Netzwerk Verhalten werden durchgeführt. Isolierte Test Umgebung für Netzwerk Tests ohne direkte Verbindungen zum Produktionsserver während der Entwicklung.

Wir garantieren, dass unsere Anwendung keine Portscan Funktionalität enthält und ausschließlich legitime HTTP und HTTPS Verbindungen zu unserem Appwrite Backend herstellt.

Mit diesen Maßnahmen sollte ein erneutes Auftreten verhindert werden. Wir bitten um Entsperrung unserer IP Adresse 91.99.156.85.

Mit freundlichen Grüßen
