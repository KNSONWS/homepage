import { useEffect, useRef, useState } from 'react'
import { FaCheck, FaCopy, FaEye, FaEyeSlash } from 'react-icons/fa6'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

export default function CopyableCredential({ value, secret = false, label = 'Wert' }) {
  const [visible, setVisible] = useState(!secret)
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef(null)
  const text = String(value || '').trim()

  useEffect(() => {
    setVisible(!secret)
  }, [secret, text])

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  if (!text) return <span className="credential-empty">–</span>

  const handleCopy = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    await copyText(text)
    setCopied(true)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 1800)
  }

  const displayValue = secret && !visible ? '••••••••••••' : text

  return (
    <span className="credential">
      <span
        className={`credential-value ${secret && !visible ? 'is-masked' : ''}`}
        title={secret && !visible ? `${label} anzeigen` : text}
      >
        {displayValue}
      </span>
      {secret && (
        <button
          type="button"
          className="credential-action"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setVisible((current) => !current)
          }}
          title={visible ? `${label} ausblenden` : `${label} anzeigen`}
          aria-label={visible ? `${label} ausblenden` : `${label} anzeigen`}
        >
          {visible ? <FaEyeSlash /> : <FaEye />}
        </button>
      )}
      <button
        type="button"
        className="credential-action"
        onClick={handleCopy}
        title={copied ? 'Kopiert' : `${label} kopieren`}
        aria-label={copied ? `${label} kopiert` : `${label} kopieren`}
      >
        {copied ? <FaCheck className="credential-check" /> : <FaCopy />}
      </button>
    </span>
  )
}

export function getCustomerPortalPassword(customer) {
  return customer?.portalPassword || customer?.password || ''
}
