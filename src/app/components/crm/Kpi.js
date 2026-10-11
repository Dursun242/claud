// Tuile KPI du CRM (cliquable si onClick)
export default function Kpi({ label, value, sub, color, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} style={{
      background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      borderTop: `3px solid ${color}`, textAlign: 'left', border: 'none', borderTopStyle: 'solid',
      cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit', minWidth: 0,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1C1C1E', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#6E6E73', marginTop: 2 }}>{sub}</div>
    </Tag>
  )
}
