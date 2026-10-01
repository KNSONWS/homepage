export default function Footer() {
  return (
    <footer className="footer">
      <p className="faint" style={{ fontSize: 13, margin: 0 }}>
        Webklar Ticket-Plattform · © {new Date().getFullYear()}
      </p>
    </footer>
  )
}
