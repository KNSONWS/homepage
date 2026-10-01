import { useId, useState } from 'react'

/* Textfeld mit Vorschlagsliste. Freie Eingaben bleiben erlaubt;
   getSuggestions(text) liefert [{ value, hint }]. */
export default function AutocompleteInput({ value, onChange, getSuggestions, id, placeholder, required }) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const items = open ? getSuggestions(value) : []
  const showList = items.length > 0

  const choose = (item) => {
    onChange(item.value)
    setOpen(false)
    setActive(-1)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && showList && items[active]) {
      e.preventDefault()
      choose(items[active])
    } else if (e.key === 'Escape' && showList) {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="autocomplete">
      <input
        type="text"
        id={id}
        className="form-control"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          setActive(-1)
        }}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul className="autocomplete-list" id={listId} role="listbox">
          {items.map((item, index) => (
            <li
              key={item.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`autocomplete-item${index === active ? ' active' : ''}`}
              // mousedown statt click: sonst verliert das Feld vorher den Fokus und die Liste schliesst
              onMouseDown={(e) => {
                e.preventDefault()
                choose(item)
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="autocomplete-value">{item.value}</span>
              {item.hint && <span className="autocomplete-hint">{item.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
