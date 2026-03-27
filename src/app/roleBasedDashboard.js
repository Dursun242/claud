'use client'
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import AdminDashboard from './dashboards/AdminDashboard'
import ClientDashboard from './dashboards/ClientDashboard'
import SalarieDashboard from './dashboards/SalarieDashboard'

export default function RoleBasedDashboard({ user, profile }) {
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user?.id) return
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') throw error
        setUserRole(data?.role || 'salarie') // default to salarie if no role
      } catch (err) {
        console.error('Error fetching user role:', err)
        setUserRole('salarie')
      } finally {
        setLoading(false)
      }
    }

    fetchUserRole()
  }, [user?.id])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>⏳ Chargement...</div>
  }

  switch (userRole) {
    case 'admin':
      return <AdminDashboard user={user} profile={profile} />
    case 'client':
      return <ClientDashboard user={user} profile={profile} />
    case 'salarie':
    default:
      return <SalarieDashboard user={user} profile={profile} />
  }
}
