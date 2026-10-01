export default function Badge({ tone = 'muted', dot = false, children, className = '', style }) {
  return (
    <span className={`badge badge-${tone} ${className}`} style={style}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}
