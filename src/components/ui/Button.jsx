const VARIANTS = {
  default: 'ui-btn',
  primary: 'ui-btn ui-btn-primary',
  ghost: 'ui-btn ui-btn-ghost',
  danger: 'ui-btn ui-btn-danger',
}

export default function Button({
  variant = 'default',
  size,
  as = 'button',
  className = '',
  children,
  ...props
}) {
  const cls = `${VARIANTS[variant] || VARIANTS.default}${size === 'sm' ? ' ui-btn-sm' : ''} ${className}`
  const Comp = as
  return (
    <Comp className={cls} {...props}>
      {children}
    </Comp>
  )
}
