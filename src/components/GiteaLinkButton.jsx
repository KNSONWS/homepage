import { SiGitea } from 'react-icons/si'

export default function GiteaLinkButton({ href, title = 'In Gitea oeffnen', size = 16 }) {
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 6,
        background: 'rgba(99, 102, 241, 0.15)',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        color: '#818cf8',
        textDecoration: 'none',
        flexShrink: 0,
      }}
    >
      <SiGitea size={size} />
    </a>
  )
}
