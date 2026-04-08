'use client'
import { useState, useEffect } from 'react'
import { btnP, btnS } from '../dashboards/shared'
import { supabase } from '../supabaseClient'

async function apiUsers(method, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/admin/users', {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Erreur serveur')
  return json
}

export default function AdminV({ m, reload, profile }) {
  if (!profile || profile.role !== 'admin') {
    return (
      <div style={{ background: "#FEF2F2", borderRadius: 14, padding: 40, textAlign: "center", border: "1.5px solid #FECACA" }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: "#DC2626" }}>🔒 Accès refusé</h1>
        <p style={{ margin: 0, color: "#94A3B8", fontSize: 14 }}>Seuls les administrateurs peuvent accéder à cette section.</p>
      </div>
    )
  }

  const [users, setUsers] = useState([])
  const [newEmail, setNewEmail] = useState("")
  const [newPrenom, setNewPrenom] = useState("")
  const [newNom, setNewNom] = useState("")
  const [newRole, setNewRole] = useState("salarie")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupMsg, setSetupMsg] = useState("")

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    try {
      const { data } = await apiUsers('GET')
      setUsers(data)
    } catch (err) {
      setMsg({ type: 'error', text: "Chargement impossible : " + err.message })
    }
  }

  const handleAdd = async () => {
    if (!newEmail.trim() || !newPrenom.trim()) {
      setMsg({ type: 'error', text: "Email et prénom requis." })
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      await apiUsers('POST', { email: newEmail, prenom: newPrenom, nom: newNom, role: newRole })
      setNewEmail(""); setNewPrenom(""); setNewNom(""); setNewRole("salarie")
      await loadUsers()
      const label = newRole === 'client' ? "Maître d'ouvrage" : newRole === 'admin' ? 'Admin' : 'Salarié'
      setMsg({ type: 'success', text: `✅ ${label} ajouté avec succès.` })
    } catch (err) {
      setMsg({ type: 'error', text: "❌ " + err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (id) => {
    if (!window.confirm("Retirer cet accès ?")) return
    setMsg(null)
    try {
      await apiUsers('DELETE', { id })
      await loadUsers()
      setMsg({ type: 'success', text: "✅ Accès retiré." })
    } catch (err) {
      setMsg({ type: 'error', text: "❌ " + err.message })
    }
  }

  const handleSetupStorage = async () => {
    setSetupLoading(true); setSetupMsg("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/setup-storage', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` },
      })
      const data = await res.json()
      setSetupMsg(data.ok ? "✅ " + data.message : "❌ " + data.error)
    } catch (e) {
      setSetupMsg("❌ " + e.message)
    } finally {
      setSetupLoading(false)
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 20px", fontSize: m ? 18 : 24, fontWeight: 700 }}>🔒 Gestion des accès</h1>

      {/* Message feedback */}
      {msg && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.type === 'success' ? "#F0FDF4" : "#FEF2F2",
          color: msg.type === 'success' ? "#16A34A" : "#DC2626",
          border: `1px solid ${msg.type === 'success' ? "#BBF7D0" : "#FECACA"}`,
        }}>
          {msg.text}
        </div>
      )}

      {/* CONFIGURATION STORAGE */}
      <div style={{ background: "#fff", borderRadius: 14, padding: m ? 14 : 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 20, border: "1.5px solid #E0F2FE" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>🗂 Configuration pièces jointes</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>
          Si vous obtenez <strong>&quot;Bucket not found&quot;</strong> lors d&apos;un upload, cliquez sur ce bouton.<br />
          <span style={{ fontSize: 11, color: "#94A3B8" }}>Nécessite <code>SUPABASE_SERVICE_ROLE_KEY</code> dans les variables Vercel.</span>
        </p>
        <button onClick={handleSetupStorage} disabled={setupLoading} style={{ ...btnP, fontSize: 12 }}>
          {setupLoading ? "⏳ Configuration..." : "⚙️ Créer le bucket Storage"}
        </button>
        {setupMsg && <div style={{ marginTop: 10, fontSize: 13, color: setupMsg.startsWith("✅") ? "#10B981" : "#EF4444" }}>{setupMsg}</div>}
        {!setupMsg && <div style={{ marginTop: 10, fontSize: 11, color: "#94A3B8" }}>
          Si l&apos;erreur persiste : Supabase Dashboard → Storage → New bucket → nom : <strong>attachments</strong>
        </div>}
      </div>

      {/* AJOUTER UN UTILISATEUR */}
      <div style={{ background: "#fff", borderRadius: 14, padding: m ? 14 : 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>➕ Ajouter un utilisateur</h2>
        <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
          <input type="email" placeholder="email@gmail.com" value={newEmail} onChange={e => setNewEmail(e.target.value)}
            style={{ padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
          <input type="text" placeholder="Prénom" value={newPrenom} onChange={e => setNewPrenom(e.target.value)}
            style={{ padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
          <input type="text" placeholder="Nom (optionnel)" value={newNom} onChange={e => setNewNom(e.target.value)}
            style={{ padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { value: "salarie", label: "👷 Salarié", desc: "Accès complet sauf Admin" },
            { value: "client", label: "🏗 Maître d'ouvrage", desc: "Chantiers, CR, OS, Planning" },
          ].map(r => (
            <button key={r.value} onClick={() => setNewRole(r.value)} style={{
              padding: "8px 14px", border: `2px solid ${newRole === r.value ? "#1E3A5F" : "#E2E8F0"}`,
              borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
              background: newRole === r.value ? "#1E3A5F" : "#fff",
              color: newRole === r.value ? "#fff" : "#334155", transition: "all .15s",
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
            }}>
              <span>{r.label}</span>
              <span style={{ fontSize: 10, fontWeight: 400, opacity: .7 }}>{r.desc}</span>
            </button>
          ))}
        </div>
        <button onClick={handleAdd} disabled={loading} style={{ ...btnP, fontSize: 12 }}>
          {loading ? "⏳ Ajout..." : "✓ Ajouter"}
        </button>
      </div>

      {/* LISTE DES UTILISATEURS */}
      <div style={{ background: "#fff", borderRadius: 14, padding: m ? 14 : 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>👥 Utilisateurs autorisés ({users.length})</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {users.length === 0 ? (
            <p style={{ color: "#94A3B8", fontSize: 13 }}>Aucun utilisateur — ajoutez le premier ci-dessus.</p>
          ) : (
            users.map(u => (
              <div key={u.id} style={{ background: "#F8FAFC", borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>{u.prenom} {u.nom || ""}</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>{u.email}</div>
                  <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
                    {u.role === "admin" ? "🔑 Admin" : u.role === "client" ? "🏗 Maître d'ouvrage" : "👷 Salarié"}
                    {!u.actif && <span style={{ color: "#EF4444", marginLeft: 8 }}>— Désactivé</span>}
                  </div>
                </div>
                <button onClick={() => handleRemove(u.id)}
                  style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "6px 12px", color: "#EF4444", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                  Retirer
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
