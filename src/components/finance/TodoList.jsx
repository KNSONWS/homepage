import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, EmptyState } from '../ui'
import { TODO_LIMIT, todoButtonLabel, todoKey, urgencyOf, visibleTodos } from '../../lib/financeView'

/**
 * Block 2: „Zu erledigen“, höchstens 7 Zeilen, danach „Alle N anzeigen“. Je Zeile Dringlichkeit (Text), Titel,
 * Text und genau ein Knopf. onAction(aktion, aufgabe) darf ein Promise liefern; wirft es, steht die Meldung
 * unter der Zeile. Solange eine Aktion läuft, sind alle Knöpfe gesperrt (kein Doppelklick).
 */
export default function TodoList({ aufgaben, onAction }) {
  const [expanded, setExpanded] = useState(false)
  const [running, setRunning] = useState(null) // Schlüssel der laufenden Aufgabe
  const [failure, setFailure] = useState(null) // { key, message }
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const { shown, total } = visibleTodos(aufgaben, expanded)

  async function run(todo, key) {
    if (running) return
    setFailure(null)
    setRunning(key)
    try {
      await onAction(todo.aktion, todo)
    } catch (err) {
      if (aliveRef.current) setFailure({ key, message: err?.message || 'Die Aktion ist fehlgeschlagen.' })
    } finally {
      if (aliveRef.current) setRunning(null)
    }
  }

  return (
    <Card
      title="Zu erledigen"
      actions={total > 0 ? <Badge tone="muted">{total} offen</Badge> : null}
      className="fin-todo-card"
      bodyStyle={{ padding: 0 }}
    >
      {total === 0 ? (
        <EmptyState title="Nichts offen" />
      ) : (
        <>
          <ul className="fin-todos">
            {shown.map((todo, index) => {
              const key = todoKey(todo, index)
              const urgency = urgencyOf(todo)
              const label = todoButtonLabel(todo)
              return (
                <li key={key} className={`fin-todo fin-todo-${todo.dringlichkeit || 'info'}`}>
                  <Badge tone={urgency.tone}>{urgency.label}</Badge>
                  <div className="fin-todo-main">
                    <div className="fin-todo-title">{todo.titel}</div>
                    {todo.text && <div className="fin-todo-text muted">{todo.text}</div>}
                    {failure?.key === key && (
                      <div className="fin-hint fin-hint-warn" role="alert">
                        {failure.message}
                      </div>
                    )}
                  </div>
                  {label && (
                    <Button size="sm" onClick={() => run(todo, key)} disabled={running !== null}>
                      {running === key ? 'Moment …' : label}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
          {total > TODO_LIMIT && (
            <div className="fin-todos-more">
              <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Weniger anzeigen' : `Alle ${total} anzeigen`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
