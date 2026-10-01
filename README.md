# WOMS – Ticketsystem von WEBklar

Internes Ticketsystem unter https://ticket.webklar.com: Tickets, Arbeitsblätter mit
Zeiterfassung, Kunden und Leads, Website-Projekte, Planboard und Finanzen (Rechnungen
schreiben und verwalten, Buchungen zuordnen; nur für Admins).
React/Vite im Browser, Daten in Appwrite (Projekt `6a1058610003c5a13a05`,
Datenbank `woms-database`, API unter `https://ticket.webklar.com/v1`).

## Entwickeln und live stellen

- Lokal starten: siehe [LOCAL_DEV.md](./LOCAL_DEV.md) (Vite-Proxy + `.env.local`).
- Live ist der Branch `test` im Gitea-Repo `JUSN/tickte-system`. Ein Push löst
  auf dem Server Build und Deploy aus.
- Achtung: Der Webhook baut **jeden** gepushten Branch und stellt ihn live.
  Feature-Branches deshalb nicht pushen; live geht es mit
  `git push origin <branch>:test`.

## Datenmodell (Kurzfassung)

Datum speichert WOMS als Text `dd.mm.yyyy`, Uhrzeiten als `hhmm` (z. B. `0930`).

| Collection | Inhalt | Wichtige Felder |
|---|---|---|
| `workorders` | Tickets | `woid` (fortlaufend ab 10000), `topic`, `details`, `status`, `priority`, `type` (Webpage, Migration, Project, Akquise), `serviceType`, `customerId`/`customerName`, `assignedTo`/`assignedName`, `requestedBy`, `startDate`/`startTime`/`endTime`, `deadline` |
| `worksheets` | Arbeitsblätter | `wsid` (fortlaufend ab 100000), `woid` + `workorderId`, `employeeId`/`employeeName`, `serviceType`, `oldStatus`/`newStatus`, `totalTime` (Minuten), `startDate`/`startTime`/`endDate`/`endTime`, `details`, `isComment`, `countsToPlan` (Abo-Stunden) |
| `customers` | Kunden und Leads | `code` (Kundennummer), `name`/`companyName`, `customerStatus` (z. B. lead, customer, lost), `archived`, Rechnungsadresse, Portal-Zugang, `invoiceNinjaClientId` (nicht mehr genutzt, Daten bleiben) |
| `employees` | Mitarbeiter | `userId` (Appwrite-Benutzer), `displayName`, `email`, `shortcode` (Kürzel) |
| `websiteProjects` | Website-Projekte und Vorschauen | `customerId` (steuert, was der Kunde im Portal sieht), `ticketId` (Ziel der Git-Push-Arbeitsblätter), Subdomain, Repo |
| `leads`, `leadPipeline`, `leadSettings` | Lead-Automatik | Recherche-Ergebnisse, Pipeline-Schritte, Sucheinstellungen |
| `roadmaps`, `roadmapNodes` | alte Projektpläne | wird von WOMS nicht mehr gelesen (Plan mit Schritten, verknüpft mit einem Ticket) |
| `config` | alte Einstellungen | wird von WOMS nicht mehr gelesen (Prioritäten, alte Listen) |

Zusammenspiel mit anderen Systemen:

- **Kundenportal** (project.webklar.com): legt bei jedem Git-Push ein Arbeitsblatt an
  (`employeeId` `gitea`, `serviceType` `GIT`, ohne Beginn). Die Zeit wird in WOMS
  nachgetragen, danach zählt sie als Arbeitszeit. Termine aus der Rechnungsanalyse
  landen am Akquise-Ticket des Kunden und erscheinen im Planboard. Kunden-, Mitarbeiter-
  und Projektverwaltung laufen über die Admin-API des Portals.
- **Finanzen-API des Portals** (`/api/admin/finanzen`): Übersicht, Rechnungen (Stripe),
  Buchungen (Bank), Einstellungen und Fixkosten. WOMS spricht sie mit dem Appwrite-JWT an
  und zeigt sie unter `/finance` (Einstellungen: `/finance/einstellungen`).
- **ticket-integrations** (`/api/integrations`): wird von WOMS nicht mehr genutzt
  (weder InvoiceNinja noch Paperless; Paperless selbst ist gestoppt).
