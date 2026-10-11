'use client'

// ═══════════════════════════════════════════════════════════════
// OSSignatureModal — modale d'envoi d'un OS en signature via Odoo Sign.
// ═══════════════════════════════════════════════════════════════
//
// Présentationnel uniquement : toute la logique d'envoi reste dans le
// parent (OrdresServiceV.handleSendSign) qui est passé en prop.
//
// Props :
//   - signModal          : objet OS courant ou null (la modale est ouverte
//                          quand signModal est truthy)
//   - onClose            : () => void — ferme la modale
//   - signers            : { moe, moa, entreprise } avec { name, email }
//   - setSigners         : React setter pour signers
//   - onSend             : () => void — déclenche l'envoi
//   - sending            : boolean — état de chargement
//   - error              : string — message d'erreur à afficher, ou ""
//   - inp, btnP, btnS    : styles partagés (depuis shared.js)

import Modal from './Modal'

const SIGNER_ROLES = [
  { key: 'moe',        label: "MOE — Id Maîtrise",  color: '#0066CC' },
  { key: 'moa',        label: "Maître d'ouvrage",    color: '#0071A4' },
  { key: 'entreprise', label: 'Entreprise',          color: '#8944AB' },
]

export default function OSSignatureModal({
  signModal,
  onClose,
  signers,
  setSigners,
  onSend,
  sending = false,
  error = '',
  inp,
  btnP,
  btnS,
}) {
  const allFilled =
    signers?.moe?.email && signers?.moa?.email && signers?.entreprise?.email

  return (
    <Modal open={!!signModal} onClose={onClose} title="Envoyer pour signature Odoo">
      {signModal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#F7F0FC', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0066CC', marginBottom: 2 }}>
              OS {signModal.numero}
            </div>
            <div style={{ fontSize: 11, color: '#6E6E73' }}>
              Expéditeur : <strong>Id Maîtrise</strong> — Objet :{' '}
              <em>
                Signature requise – OS {signModal.numero}
                {signModal.ch?.nom ? ` – ${signModal.ch.nom}` : ''}
              </em>
            </div>
          </div>

          {SIGNER_ROLES.map(({ key, label, color }) => {
            const missing = !signers[key].email
            return (
              <div
                key={key}
                style={{
                  background: '#F5F5F7',
                  borderRadius: 8,
                  padding: 10,
                  border: `1px solid ${missing ? '#FF9F99' : '#E5E5EA'}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{label}</span>
                  {missing && (
                    <span style={{ color: '#FF3B30', fontWeight: 400, textTransform: 'none' }}>
                      Email requis
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input
                    placeholder="Nom"
                    style={{ ...inp, fontSize: 12 }}
                    value={signers[key].name}
                    onChange={(e) =>
                      setSigners((s) => ({ ...s, [key]: { ...s[key], name: e.target.value } }))
                    }
                  />
                  <input
                    placeholder="Email *"
                    style={{
                      ...inp,
                      fontSize: 12,
                      borderColor: missing ? '#FF3B30' : '#E5E5EA',
                    }}
                    value={signers[key].email}
                    onChange={(e) =>
                      setSigners((s) => ({ ...s, [key]: { ...s[key], email: e.target.value } }))
                    }
                  />
                </div>
              </div>
            )
          })}

          <div
            style={{
              background: '#EEF9F1',
              border: '1px solid #C8EED3',
              borderRadius: 8,
              padding: 10,
              fontSize: 11,
              color: '#1A5E2C',
            }}
          >
            Les 3 signataires recevront chacun un email d&apos;Odoo Sign pour signer le PDF de l&apos;OS.
          </div>

          {error && (
            <div
              style={{
                background: '#FFF0EF',
                border: '1px solid #FFC9C6',
                borderRadius: 8,
                padding: 10,
                fontSize: 12,
                color: '#FF3B30',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btnS}>Annuler</button>
            <button
              onClick={onSend}
              disabled={sending || !allFilled}
              style={{
                ...btnP,
                background: '#8944AB',
                opacity: sending || !allFilled ? 0.5 : 1,
              }}
            >
              {sending ? 'Génération et envoi…' : '✍ Envoyer pour signature'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
