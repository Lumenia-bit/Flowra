import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  children: ReactNode
  onClose(): void
  width?: number
}

export function Modal({ title, children, onClose, width = 480 }: ModalProps) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
      </header>
      {children}
    </section>
  </div>
}
