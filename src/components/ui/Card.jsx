export default function Card({ title, actions, children, pad = true, className = '', bodyStyle, style }) {
  if (!title && !actions) {
    return (
      <div className={`ui-card ${pad ? 'pad' : ''} ${className}`} style={style}>
        {children}
      </div>
    )
  }
  return (
    <div className={`ui-card ${className}`} style={style}>
      <div className="ui-card-head">
        <h3>{title}</h3>
        {actions && <div className="flex gap-2 items-center">{actions}</div>}
      </div>
      <div className="ui-card-body" style={bodyStyle}>{children}</div>
    </div>
  )
}
