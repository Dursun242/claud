'use client'
export default function ReportsV({ data, save, reload }) {
  return <div style={{ color: '#E2E8F0', padding: '20px' }}><h1>📋 Comptes Rendus</h1><p>{data?.compteRendus?.length || 0} CRs</p></div>
}
