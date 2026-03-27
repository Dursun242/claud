'use client'
export default function OrdresServiceV({ data, reload }) {
  return <div style={{ color: '#E2E8F0', padding: '20px' }}><h1>📝 Ordres Service</h1><p>{data?.ordresService?.length || 0} OS</p></div>
}
