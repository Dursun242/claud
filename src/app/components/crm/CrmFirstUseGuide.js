// Première utilisation du CRM : guide en 3 étapes
export default function CrmFirstUseGuide({ m }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,var(--accent-tint),var(--purple-tint))', border: '1px solid #DCEBFF', borderRadius: 14, padding: m ? 16 : 22, marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--label)', marginBottom: 4 }}>Bienvenue dans ton suivi commercial 👋</div>
      <div style={{ fontSize: 12, color: '#48484A', marginBottom: 14 }}>Trois gestes suffisent. Tout le reste est optionnel.</div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { n: '1', t: 'Ajoute une affaire', d: 'Tape son nom dans la barre ci-dessus et appuie sur Entrée.' },
          { n: '2', t: 'Note tes échanges', d: 'Un appel, une visite… avec une date de relance en un clic.' },
          { n: '3', t: 'Fais-la avancer', d: 'Glisse la carte d’étape en étape. Gagnée ? Le chantier se crée tout seul.' },
        ].map(s => (
          <div key={s.n} style={{ background: '#fff', borderRadius: 10, padding: 12, display: 'flex', gap: 10 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.n}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--label)' }}>{s.t}</div>
              <div style={{ fontSize: 11, color: 'var(--label-secondary)', marginTop: 2 }}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--label-secondary)', marginTop: 12 }}>
        💡 Tu peux aussi dicter à l&apos;Assistant IA (« j&apos;ai appelé Dupont, relance vendredi ») ou importer un devis depuis l&apos;onglet Qonto.
      </div>
    </div>
  )
}
