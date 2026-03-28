'use client'
import { useState, useEffect } from 'react'
import { useGoogleCalendarEvents, useCreateGoogleCalendarEvent, useUpdateGoogleCalendarEvent, useDeleteGoogleCalendarEvent } from '../useGoogleCalendar'
import { googleCalendar } from '../googleCalendar'

export default function GCalV({ m, user }) {
  const [accessToken, setAccessToken] = useState('')
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [formData, setFormData] = useState({ title: '', startTime: '09:00', endTime: '10:00', location: '', description: '' })

  const eventsQuery = useGoogleCalendarEvents(accessToken, currentMonth)
  const createMutation = useCreateGoogleCalendarEvent()
  const updateMutation = useUpdateGoogleCalendarEvent()
  const deleteMutation = useDeleteGoogleCalendarEvent()

  // Charger token depuis localStorage et paramètres d'URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Chercher le token dans les paramètres d'URL (retour du callback OAuth)
      const params = new URLSearchParams(window.location.search)
      const urlToken = params.get('google_token')

      if (urlToken) {
        // Sauvegarder le token et nettoyer l'URL
        localStorage.setItem('google_calendar_token', urlToken)
        setAccessToken(urlToken)

        // Nettoyer les paramètres d'URL
        window.history.replaceState({}, document.title, window.location.pathname)
      } else {
        // Sinon, charger depuis localStorage
        const stored = localStorage.getItem('google_calendar_token')
        if (stored) setAccessToken(stored)
      }
    }
  }, [])

  const handleConnect = async () => {
    window.location.href = googleCalendar.getAuthUrl()
  }

  const handleDisconnect = () => {
    setAccessToken('')
    localStorage.removeItem('google_calendar_token')
  }

  const handleCreateEvent = async (e) => {
    e.preventDefault()
    if (!selectedDay || !formData.title || !accessToken) return

    try {
      const [year, month, day] = selectedDay.split('-')
      const startDateTime = new Date(`${year}-${month}-${day}T${formData.startTime}:00`)
      const endDateTime = new Date(`${year}-${month}-${day}T${formData.endTime}:00`)

      await createMutation.mutateAsync({
        accessToken,
        event: {
          title: formData.title,
          startDateTime,
          endDateTime,
          location: formData.location,
          description: formData.description,
        },
      })

      setFormData({ title: '', startTime: '09:00', endTime: '10:00', location: '', description: '' })
      setSelectedDay(null)
      setShowForm(false)
    } catch (err) {
      console.error('Erreur création événement:', err)
    }
  }

  const handleDeleteEvent = async (eventId) => {
    if (!confirm('Supprimer cet événement ?')) return
    try {
      await deleteMutation.mutateAsync({ accessToken, eventId })
    } catch (err) {
      console.error('Erreur suppression:', err)
    }
  }

  const getDaysInMonth = (year, month) => {
    const date = new Date(year, month, 0)
    return date.getDate()
  }

  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month - 1, 1).getDay()
  }

  const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = formatDate(new Date())

  const [year, month] = currentMonth.split('-')
  const numDays = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const daysToShow = []

  for (let i = 0; i < firstDay; i++) daysToShow.push(null)
  for (let i = 1; i <= numDays; i++) daysToShow.push(i)

  const eventsByDay = {}
  if (eventsQuery.data) {
    eventsQuery.data.forEach(e => {
      const d = e.start.split('T')[0]
      if (!eventsByDay[d]) eventsByDay[d] = []
      eventsByDay[d].push(e)
    })
  }

  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <h1 style={{ color: '#E2E8F0', marginBottom: '20px' }}>📅 Google Calendar</h1>

      {/* Connection Status */}
      <div style={{ background: '#1E293B', padding: '15px', borderRadius: '6px', marginBottom: '20px', borderLeft: '4px solid #3B82F6' }}>
        {accessToken ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ color: '#10B981', margin: 0 }}>✅ Connecté à Google Calendar</p>
            <button
              onClick={handleDisconnect}
              style={{ padding: '6px 12px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              Déconnecter
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ color: '#F59E0B', margin: 0 }}>⚠️ Non connecté à Google Calendar</p>
            <button
              onClick={handleConnect}
              style={{ padding: '6px 12px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              Se connecter
            </button>
          </div>
        )}
      </div>

      {accessToken && (
        <>
          {/* Month Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <button
              onClick={() => {
                const [y, m] = currentMonth.split('-')
                const prev = new Date(y, parseInt(m) - 2, 1)
                setCurrentMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`)
              }}
              style={{ padding: '8px 12px', background: '#334155', color: '#E2E8F0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              ← Mois précédent
            </button>
            <h2 style={{ color: '#E2E8F0', margin: 0 }}>
              {new Date(`${year}-${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </h2>
            <button
              onClick={() => {
                const [y, m] = currentMonth.split('-')
                const next = new Date(y, parseInt(m), 1)
                setCurrentMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
              }}
              style={{ padding: '8px 12px', background: '#334155', color: '#E2E8F0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Mois suivant →
            </button>
          </div>

          {/* Calendar Grid */}
          <div style={{ background: '#1E293B', borderRadius: '6px', overflow: 'hidden', marginBottom: '20px' }}>
            {/* Day Headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#0F172A', borderBottom: '1px solid #334155' }}>
              {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(d => (
                <div key={d} style={{ padding: '12px', textAlign: 'center', color: '#94A3B8', fontWeight: 'bold', fontSize: '13px' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', padding: '1px', background: '#334155' }}>
              {daysToShow.map((day, idx) => {
                const dayStr = day ? `${year}-${month}-${String(day).padStart(2, '0')}` : null
                const isToday = dayStr === today
                const dayEvents = dayStr ? eventsByDay[dayStr] || [] : []

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (dayStr) {
                        setSelectedDay(dayStr)
                        setShowForm(true)
                        setEditingEvent(null)
                      }
                    }}
                    style={{
                      background: day ? (isToday ? '#1E3A8A' : '#1E293B') : '#0F172A',
                      padding: '8px',
                      minHeight: '100px',
                      cursor: day ? 'pointer' : 'default',
                      borderBottom: '1px solid #334155',
                      position: 'relative',
                      opacity: day ? 1 : 0.3,
                    }}
                  >
                    <div style={{ color: isToday ? '#3B82F6' : '#94A3B8', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
                      {day}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', maxHeight: '70px', overflowY: 'auto' }}>
                      {dayEvents.slice(0, 2).map(ev => (
                        <div
                          key={ev.id}
                          onClick={e => {
                            e.stopPropagation()
                            setEditingEvent(ev)
                            setShowForm(true)
                          }}
                          style={{
                            background: '#334155',
                            padding: '4px',
                            borderRadius: '3px',
                            marginBottom: '3px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {ev.summary}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div style={{ color: '#60A5FA', fontSize: '10px', marginTop: '2px' }}>
                          +{dayEvents.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Event Form Modal */}
          {showForm && selectedDay && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}>
              <div style={{ background: '#1E293B', borderRadius: '8px', padding: '20px', maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                <h3 style={{ color: '#E2E8F0', margin: '0 0 15px 0' }}>
                  {editingEvent ? 'Modifier' : 'Créer'} événement
                </h3>

                <form onSubmit={handleCreateEvent}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ color: '#94A3B8', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Titre</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: '#0F172A',
                        color: '#E2E8F0',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Début</label>
                      <input
                        type="time"
                        value={formData.startTime}
                        onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          background: '#0F172A',
                          color: '#E2E8F0',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          fontSize: '13px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Fin</label>
                      <input
                        type="time"
                        value={formData.endTime}
                        onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          background: '#0F172A',
                          color: '#E2E8F0',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          fontSize: '13px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ color: '#94A3B8', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Lieu</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={e => setFormData({ ...formData, location: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: '#0F172A',
                        color: '#E2E8F0',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ color: '#94A3B8', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: '#0F172A',
                        color: '#E2E8F0',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        fontSize: '13px',
                        minHeight: '80px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#10B981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                      }}
                    >
                      {createMutation.isPending ? '⏳' : '💾'} Sauvegarder
                    </button>
                    {editingEvent && (
                      <button
                        type="button"
                        onClick={() => {
                          handleDeleteEvent(editingEvent.id)
                          setShowForm(false)
                        }}
                        style={{
                          padding: '10px 15px',
                          background: '#EF4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        🗑️ Supprimer
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false)
                        setEditingEvent(null)
                        setFormData({ title: '', startTime: '09:00', endTime: '10:00', location: '', description: '' })
                      }}
                      style={{
                        padding: '10px 15px',
                        background: '#64748B',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      ✕ Fermer
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Events List */}
          {eventsQuery.data && eventsQuery.data.length > 0 && (
            <div style={{ background: '#1E293B', borderRadius: '6px', padding: '15px', marginTop: '20px' }}>
              <h3 style={{ color: '#E2E8F0', margin: '0 0 15px 0', fontSize: '15px' }}>
                Événements ({eventsQuery.data.length})
              </h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {eventsQuery.data.map(event => (
                  <div
                    key={event.id}
                    style={{
                      background: '#0F172A',
                      padding: '12px',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      borderLeft: '3px solid #3B82F6',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#E2E8F0', margin: '0 0 4px 0', fontWeight: '500' }}>{event.summary}</p>
                      <p style={{ color: '#64748B', margin: 0, fontSize: '12px' }}>
                        {new Date(event.start).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      style={{
                        padding: '6px 10px',
                        background: '#EF4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        marginLeft: '10px',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
