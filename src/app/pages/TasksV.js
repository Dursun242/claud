'use client'
export default function TasksV({ data, save, reload }) {
  return <div style={{ color: '#E2E8F0', padding: '20px' }}><h1>✅ Tâches</h1><p>{data?.tasks?.length || 0} tâches</p></div>
}
