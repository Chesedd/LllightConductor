export function ConfirmationDialog({ title, description, confirmLabel, onConfirm, onCancel, danger = false }: { title: string; description: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <h2 id="dialog-title">{title}</h2><p>{description}</p>
      <div className="dialog-actions"><button className="button secondary" onClick={onCancel}>Cancel</button><button className={`button ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button></div>
    </section>
  </div>;
}
