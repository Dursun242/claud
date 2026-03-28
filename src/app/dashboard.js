'use client'
import RoleBasedDashboard from './roleBasedDashboard'

export default function Dashboard({ user, profile = null }) {
  return <RoleBasedDashboard user={user} profile={profile} />
}
