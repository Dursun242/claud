'use client'
export default function ProjectsV({ data, save, reload }) {
  return (
    <div style={{ color: '#E2E8F0', padding: '20px' }}>
      <h1>🏗️ Chantiers</h1>
      <p>Liste: {data?.chantiers?.length || 0} chantiers</p>
    </div>
  )
}
