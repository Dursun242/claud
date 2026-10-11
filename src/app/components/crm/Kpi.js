// Tuile KPI du CRM (cliquable si onClick). Neutre : `color` est encore
// accepté pour compatibilité mais ignoré (DESIGN.md, pas de liseré coloré).
// eslint-disable-next-line no-unused-vars
export default function Kpi({ label, value, sub, color, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} style={{
      background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E5E5EA', textAlign: 'left',
      cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit', minWidth: 0,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1C1C1E', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6E6E73', marginTop: 2 }}>{sub}</div>
    </Tag>
  )
}
