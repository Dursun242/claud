'use client'
import RoleBasedDashboard from './roleBasedDashboard'

export default function Dashboard({ user, profile }) {
  return <RoleBasedDashboard user={user} profile={profile} />
}
