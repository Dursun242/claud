import { btnP, btnS } from '../../dashboards/shared'
import { Modal } from '../index'
import DevisSendForm from './DevisSendForm'

// Fenêtre d'envoi d'un devis : chargement du PDF Qonto → formulaire de mail.
// sendState : null | { devis, status: 'loading'|'ready'|'error', initial, pdf, error }
export default function DevisSendModal({ sendState, saving, docsApi, onRetry, onPreviewPdf, onDraftAi, onSubmit, onClose }) {
  return (
    <Modal open={!!sendState} onClose={() => !saving && onClose()}
      title={sendState ? `Envoyer le devis ${sendState.devis.numero}` : ''}>
      {sendState?.status === 'loading' && (
        <div role="status" style={{ padding: '24px 4px', fontSize: 13, color: '#475569' }}>
          Récupération du devis dans Qonto…
        </div>
      )}
      {sendState?.status === 'error' && (
        <div>
          <div role="alert" style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, fontWeight: 500 }}>
            ⚠ Devis Qonto indisponible : {sendState.error}
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
            Seul le devis édité par Qonto peut être envoyé.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btnS}>Fermer</button>
            <button onClick={onRetry} style={btnP}>Réessayer</button>
          </div>
        </div>
      )}
      {sendState?.status === 'ready' && (
        <DevisSendForm initial={sendState.initial} filename={sendState.pdf.filename}
          sending={saving} error={sendState.error} onPreviewPdf={onPreviewPdf} canSign docsApi={docsApi}
          onDraftAi={onDraftAi} onSubmit={onSubmit} onCancel={onClose} />
      )}
    </Modal>
  )
}
