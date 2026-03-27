'use client'
export default function PlanningV({ data }) {
  return <div style={{ color: '#E2E8F0', padding: '20px' }}><h1>📅 Planning</h1><p>{data?.planning?.length || 0} événements</p></div>
}
