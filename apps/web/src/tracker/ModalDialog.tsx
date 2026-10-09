import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from '../presentation'

/** Native modal makes the background inert; explicit Tab handling also keeps focus inside. */
export default function ModalDialog({ title, children, onDismiss, closeDisabled = false, sheet = false }: {
  title: string; children: ReactNode; onDismiss: () => void; closeDisabled?: boolean; sheet?: boolean
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current!
    element.showModal()
    element.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      element.close()
      if (opener?.isConnected && !opener.matches(':disabled')) opener.focus()
      else document.getElementById('tracker-content')?.focus()
    }
  }, [])
  return <dialog ref={dialog} aria-label={title} className={`tracker-dialog ${sheet ? 'tracker-sheet' : ''}`}
    onCancel={event => { event.preventDefault(); if (!closeDisabled) onDismiss() }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')]
      const first = items[0], last = items[items.length - 1]
      if (!first) { event.preventDefault(); event.currentTarget.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}>
    <div className="tracker-dialog-heading"><h2 className="text-lg font-semibold">{title}</h2><button type="button" className="tracker-icon-button" aria-label={`ปิด${title}`} disabled={closeDisabled} onClick={onDismiss}><Icon name="close" /></button></div>
    {children}
  </dialog>
}
