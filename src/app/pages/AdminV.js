'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { btnP } from '../dashboards/shared'
import { supabase } from '../supabaseClient'
import { useToast } from '../contexts/ToastContext'

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

// Couleur + label par rôle (utilisé partout : pills, cartes, fallback)
const ROLE_META = {
  admin:   { label: "🔑 Admin",             color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  salarie: { label: "👷 Salarié",           color: "#1E3A5F", bg: "#EFF6FF", border: "#BFDBFE" },
  client:  { label: "🏗 Maître d'ouvrage",  color: "#047857", bg: "#ECFDF5", border: "#A7F3D0" },
}

export default function AdminV({ m, reload, profile }) {
  const { addToast } = useToast()
  // ⚠️ Tous les hooks doivent être appelés avant tout early return
  // (règles des hooks React). Le garde d'accès admin est plus bas.
  const [users, setUsers] = useState([])
  const [newEmail, setNewEmail] = useState("")
  const [newPrenom, setNewPrenom] = useState("")
  const [newNom, setNewNom] = useState("")
  const [newRole, setNewRole] = useState("salarie")
  const [loading, setLoading] = useState(false)
  const [addError, setAddError] = useState("")
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupMsg, setSetupMsg] = useState("")
  const [q, setQ] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const searchInputRef = useRef(null)

  const isAdmin = profile?.role === 'admin'

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await apiUsers('GET')
      setUsers(data)
    } catch (err) {
      addToast("Chargement impossible : " + err.message, "error")
    }
  }, [addToast])

  useEffect(() => {
    if (isAdmin) loadUsers()
  }, [isAdmin, loadUsers])

  const filteredUsers = useMemo(() => {
    const s = q.toLowerCase().trim()
    return users.filter(u => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false
      if (!s) return true
      return (
        (u.email || "").toLowerCase().includes(s) ||
        (u.prenom || "").toLowerCase().includes(s) ||
        (u.nom || "").toLowerCase().includes(s)
      )
    })
  }, [users, q, roleFilter])

  const countByRole = useMemo(() => {
    const acc = { all: users.length, admin: 0, salarie: 0, client: 0 }
    users.forEach(u => { if (acc[u.role] != null) acc[u.role]++ })
    return acc
  }, [users])

  if (!isAdmin) {
    return (
      <div style={{ background: "#FEF2F2", borderRadius: 14, padding: 40, textAlign: "center", border: "1.5px solid #FECACA" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
        <h1 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: "#DC2626" }}>Accès refusé</h1>
        <p style={{ margin: 0, color: "#94A3B8", fontSize: 14 }}>Seuls les administrateurs peuvent accéder à cette section.</p>
      </div>
    )
  }

  const handleAdd = async () => {
    setAddError("")
    if (!newEmail.trim()) { setAddError("L'email est requis."); return }
    if (!newPrenom.trim()) { setAddError("Le prénom est requis."); return }
    // Validation email basique
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      setAddError("Format d'email invalide.")
      return
    }
    setLoading(true)
    try {
      await apiUsers('POST', { email: newEmail, prenom: newPrenom, nom: newNom, role: newRole })
      setNewEmail(""); setNewPrenom(""); setNewNom(""); setNewRole("salarie")
      await loadUsers()
      const label = newRole === 'client' ? "Maître d'ouvrage" : newRole === 'admin' ? 'Admin' : 'Salarié'
      addToast(`${label} ajouté`, "success")
    } catch (err) {
      setAddError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (u) => {
    if (!window.confirm(`Retirer l'accès de ${u.prenom} ${u.nom || ""} (${u.email}) ?`)) return
    try {
      await apiUsers('DELETE', { id: u.id })
      await loadUsers()
      addToast("Accès retiré", "success")
    } catch (err) {
      addToast("Erreur : " + err.message, "error")
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
      if (data.ok) {
        setSetupMsg("✅ " + data.message)
        addToast("Bucket Storage créé", "success")
      } else {
        setSetupMsg("❌ " + data.error)
        addToast("Erreur : " + data.error, "error")
      }
    } catch (e) {
      setSetupMsg("❌ " + e.message)
      addToast("Erreur : " + e.message, "error")
    } finally {
      setSetupLoading(false)
    }
  }

  const hasFilters = !!(q || roleFilter !== "all")
  const getInitials = (u) => ((u.prenom?.[0] || "") + (u.nom?.[0] || "")).toUpperCase() || (u.email?.[0] || "?").toUpperCase()

  return (
    <div>
      <h1 style={{ margin: "0 0 16px", fontSize: m ? 18 : 24, fontWeight: 700 }}>🔒 Gestion des accès</h1>

      {/* CONFIGURATION STORAGE */}
      <div style={{ background: "#fff", borderRadius: 14, padding: m ? 14 : 18, boxShadow: "0 1px 3px rgba(15,23,42,0.06)", marginBottom: 18, border: "1.5px solid #E0F2FE" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>🗂 Configuration pièces jointes</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>
          Si vous obtenez <strong>&quot;Bucket not found&quot;</strong> lors d&apos;un upload, cliquez sur ce bouton.<br />
          <span style={{ fontSize: 11, color: "#94A3B8" }}>Nécessite <code>SUPABASE_SERVICE_ROLE_KEY</code> dans les variables Vercel.</span>
        </p>
        <button onClick={handleSetupStorage} disabled={setupLoading} style={{ ...btnP, fontSize: 12, opacity: setupLoading ? 0.7 : 1 }}>
          {setupLoading ? "⏳ Configuration…" : "⚙️ Créer le bucket Storage"}
        </button>
        {setupMsg && <div style={{ marginTop: 10, fontSize: 13, color: setupMsg.startsWith("✅") ? "#10B981" : "#EF4444" }}>{setupMsg}</div>}
        {!setupMsg && <div style={{ marginTop: 10, fontSize: 11, color: "#94A3B8" }}>
          Si l&apos;erreur persiste : Supabase Dashboard → Storage → New bucket → nom : <strong>attachments</strong>
        </div>}
      </div>

      {/* AJOUTER UN UTILISATEUR */}
      <div style={{ background: "#fff", borderRadius: 14, padding: m ? 14 : 18, boxShadow: "0 1px 3px rgba(15,23,42,0.06)", marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>➕ Ajouter un utilisateur</h2>
        <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "repeat(3,1fr)", gap: 10, marginBottom: 10 }}>
          <input type="email" placeholder="email@exemple.com" value={newEmail} onChange={e => setNewEmail(e.target.value)}
            style={{ padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }}/>
          <input type="text" placeholder="Prénom *" value={newPrenom} onChange={e => setNewPrenom(e.target.value)}
            style={{ padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }}/>
          <input type="text" placeholder="Nom (optionnel)" value={newNom} onChange={e => setNewNom(e.target.value)}
            style={{ padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }}/>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {[
            { value: "salarie", label: "👷 Salarié", desc: "Accès complet sauf Admin" },
            { value: "client",  label: "🏗 Maître d'ouvrage", desc: "Chantiers, CR, OS, Planning" },
          ].map(r => {
            const active = newRole === r.value
            return (
              <button key={r.value} onClick={() => setNewRole(r.value)} style={{
                padding: "8px 14px", border: `2px solid ${active ? "#1E3A5F" : "#E2E8F0"}`,
                borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                background: active ? "#1E3A5F" : "#fff",
                color: active ? "#fff" : "#334155", transition: "background .15s, border-color .15s, color .15s",
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
              }}>
                <span>{r.label}</span>
                <span style={{ fontSize: 10, fontWeight: 400, opacity: .7 }}>{r.desc}</span>
              </button>
            )
          })}
        </div>
        {addError && (
          <div style={{
            background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,
            padding:"8px 12px",marginBottom:10,fontSize:12,color:"#DC2626",
            display:"flex",alignItems:"center",gap:8,
          }}>
            <span style={{fontSize:14}}>⚠</span>
            <span style={{flex:1}}>{addError}</span>
            <button onClick={()=>setAddError("")} aria-label="Fermer" style={{background:"none",border:"none",cursor:"pointer",color:"#DC2626",fontSize:14,padding:0,lineHeight:1}}>✕</button>
          </div>
        )}
        <button onClick={handleAdd} disabled={loading} style={{ ...btnP, fontSize: 12, opacity: loading ? 0.7 : 1 }}>
          {loading ? "⏳ Ajout…" : "✓ Ajouter"}
        </button>
      </div>

      {/* LISTE DES UTILISATEURS */}
      <div style={{ background: "#fff", borderRadius: 14, padding: m ? 14 : 18, boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>👥 Utilisateurs autorisés ({users.length})</h2>
          <div style={{position:"relative",width:m?"100%":240}}>
            <svg style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",opacity:0.5}} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Rechercher nom, email…"
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{padding:"7px 10px 7px 28px",borderRadius:7,border:"1px solid #E2E8F0",fontSize:12,width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}
            />
          </div>
        </div>

        {/* Pills de filtre par rôle */}
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {[
            {k:"all",     l:"Tous",                c:"#64748B"},
            {k:"admin",   l:ROLE_META.admin.label,  c:ROLE_META.admin.color},
            {k:"salarie", l:ROLE_META.salarie.label,c:ROLE_META.salarie.color},
            {k:"client",  l:ROLE_META.client.label, c:ROLE_META.client.color},
          ].map(p => {
            const active = roleFilter === p.k
            const count = countByRole[p.k] || 0
            return (
              <button key={p.k} onClick={() => setRoleFilter(p.k)} style={{
                display:"inline-flex",alignItems:"center",gap:6,
                padding:"5px 11px",borderRadius:999,fontSize:11,fontWeight:600,
                border:`1px solid ${active ? p.c : "#E2E8F0"}`,
                background:active ? p.c : "#fff",
                color:active ? "#fff" : "#334155",
                cursor:"pointer",fontFamily:"inherit",
                transition:"background .15s, color .15s, border-color .15s",whiteSpace:"nowrap",
              }}>
                <span style={{width:7,height:7,borderRadius:"50%",background:active?"#fff":p.c,opacity:active?0.8:1}}/>
                {p.l} <span style={{fontSize:10,opacity:0.75,fontWeight:500}}>{count}</span>
              </button>
            )
          })}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {filteredUsers.length === 0 ? (
            <div style={{textAlign:"center",padding:"30px 16px"}}>
              <div style={{fontSize:32,marginBottom:6,opacity:0.5}}>👥</div>
              <div style={{fontSize:13,fontWeight:600,color:"#334155",marginBottom:4}}>
                {hasFilters ? "Aucun résultat" : "Aucun utilisateur"}
              </div>
              <div style={{fontSize:11,color:"#94A3B8"}}>
                {hasFilters ? "Essaie d'élargir ta recherche." : "Ajoute le premier utilisateur ci-dessus."}
              </div>
            </div>
          ) : (
            filteredUsers.map(u => {
              const meta = ROLE_META[u.role] || ROLE_META.salarie
              return (
                <div key={u.id} style={{
                  background: "#F8FAFC", borderRadius: 10, padding: 12,
                  display: "flex", alignItems: "center", gap: 12,
                  borderLeft: `3px solid ${meta.color}`,
                  opacity: u.actif === false ? 0.55 : 1,
                }}>
                  {/* Avatar avec initiales */}
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%",
                    background: meta.bg, color: meta.color,
                    border: `1.5px solid ${meta.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>{getInitials(u)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {u.prenom} {u.nom || ""}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {u.email}
                    </div>
                    <div style={{ fontSize: 10, color: meta.color, marginTop: 2, fontWeight:600 }}>
                      {meta.label}
                      {u.actif === false && <span style={{ color: "#EF4444", marginLeft: 8 }}>— Désactivé</span>}
                    </div>
                  </div>
                  <button onClick={() => handleRemove(u)} title="Retirer l'accès" style={{
                    background: "#fff", border: "1px solid #FECACA", borderRadius: 6,
                    padding: "6px 12px", color: "#DC2626", fontSize: 11, cursor: "pointer",
                    fontWeight: 600, flexShrink: 0, fontFamily: "inherit",
                  }}>
                    Retirer
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
