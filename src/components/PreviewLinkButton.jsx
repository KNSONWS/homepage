import { FaEye } from 'react-icons/fa6'

export default function PreviewLinkButton({ href, title = 'Preview oeffnen', size = 16 }) {
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
        background: 'rgba(16, 185, 129, 0.15)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        color: '#34d399',
        textDecoration: 'none',
        flexShrink: 0,
      }}
    >
      <FaEye size={size} />
    </a>
  )
}
