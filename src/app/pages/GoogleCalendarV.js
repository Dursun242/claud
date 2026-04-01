'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// Couleurs Google Calendar (colorId 1-11)
const GCAL_COLORS = {
  "1":"#7986CB","2":"#33B679","3":"#8E24AA","4":"#E67C73",
  "5":"#F6BF26","6":"#F4511E","7":"#039BE5","8":"#616161",
  "9":"#3F51B5","10":"#0B8043","11":"#D50000",
  default:"#1E3A5F",
};

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateFr(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function fmtDateShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
function isToday(iso) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}
function isTomorrow(iso) {
  const d = new Date(iso);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.toDateString() === tomorrow.toDateString();
}
function dayLabel(iso) {
  if (isToday(iso)) return "Aujourd'hui";
  if (isTomorrow(iso)) return "Demain";
  return fmtDateFr(iso);
}

// Grouper les événements par jour
function groupByDay(events) {
  const groups = {};
  for (const ev of events) {
    const day = (ev.debut || "").split("T")[0];
    if (!groups[day]) groups[day] = [];
    groups[day].push(ev);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

export default function GoogleCalendarV({ m }) {
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [tokenOk, setTokenOk]   = useState(false);
  const [view, setView]         = useState("list"); // "list" | "month"
  const [monthOffset, setMonthOffset] = useState(0); // 0 = mois courant

  const fetchEvents = useCallback(async (token, offset = 0) => {
    setLoading(true);
    setError("");
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59);

      const res = await fetch("/api/gcal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, timeMin: start.toISOString(), timeMax: end.toISOString() }),
      });
      const data = await res.json();

      if (data.error === "TOKEN_EXPIRED") {
        // Token expiré → le supprimer pour forcer une reconnexion
        await supabase.from('settings').delete().eq('key', 'gcal-token').catch(() => {});
        setTokenOk(false);
        setError("Session Google expirée. Reconnectez-vous pour réactiver l'agenda.");
        setEvents([]);
        return;
      }
      if (data.error) {
        setError(data.error);
        setEvents([]);
        return;
      }
      setEvents(data.events || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Chargement initial du token depuis Supabase
  useEffect(() => {
    (async () => {
      const { data: row } = await supabase.from('settings').select('value').eq('key','gcal-token').single().catch(() => ({ data: null }));
      const token = row?.value;
      if (token) {
        setTokenOk(true);
        await fetchEvents(token, 0);
      } else {
        setTokenOk(false);
        setLoading(false);
      }
    })();
  }, [fetchEvents]);

  // Changement de mois
  const changeMonth = async (dir) => {
    const newOffset = monthOffset + dir;
    setMonthOffset(newOffset);
    const { data: row } = await supabase.from('settings').select('value').eq('key','gcal-token').single().catch(() => ({ data: null }));
    if (row?.value) await fetchEvents(row.value, newOffset);
  };

  // ─── Pas de token ───
  if (!tokenOk && !loading) {
    return (
      <div style={{ maxWidth: 520, margin: "60px auto", textAlign: "center", padding: "0 20px" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📅</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: "#0F172A" }}>Connecter Google Agenda</h2>
        <p style={{ color: "#64748B", fontSize: 14, lineHeight: 1.7, margin: "0 0 28px" }}>
          Pour afficher votre agenda, reconnectez-vous — Google demandera
          l&apos;accès à votre calendrier lors de la prochaine connexion.
        </p>
        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#DC2626" }}>
            {error}
          </div>
        )}
        <button
          onClick={async () => {
            const { createClient } = await import('@supabase/supabase-js');
            const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
            await sb.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: window.location.origin,
                scopes: 'https://www.googleapis.com/auth/calendar.readonly',
              }
            });
          }}
          style={{ padding: "12px 28px", background: "#1E3A5F", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          Se reconnecter avec Google
        </button>
      </div>
    );
  }

  const grouped = groupByDay(events);
  const now = new Date();
  const monthLabel = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    .toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: m ? 18 : 24, fontWeight: 700, color: "#0F172A" }}>Google Agenda</h1>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748B" }}>Synchronisé avec votre calendrier Google</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Navigation mois */}
          <button onClick={() => changeMonth(-1)} style={navBtn}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", minWidth: 130, textAlign: "center", textTransform: "capitalize" }}>{monthLabel}</span>
          <button onClick={() => changeMonth(1)} style={navBtn}>›</button>
          <button onClick={() => changeMonth(-monthOffset)} style={{ ...navBtn, fontSize: 11, padding: "6px 12px" }} disabled={monthOffset === 0}>
            Aujourd&apos;hui
          </button>
        </div>
      </div>

      {/* Contenu */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div style={{ width: 36, height: 36, border: "3px solid #E2E8F0", borderTopColor: "#1E3A5F", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        </div>
      ) : error ? (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: 24, color: "#DC2626", fontSize: 14 }}>
          ⚠️ {error}
        </div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8", fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗓️</div>
          Aucun événement ce mois-ci.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {grouped.map(([day, evs]) => (
            <div key={day}>
              {/* Entête du jour */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{
                  background: isToday(day) ? "#1E3A5F" : "#F1F5F9",
                  color: isToday(day) ? "#fff" : "#64748B",
                  borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700,
                  textTransform: "capitalize",
                }}>
                  {dayLabel(day)} — {fmtDateShort(day)}
                </div>
                <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
              </div>

              {/* Événements du jour */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: m ? 0 : 12 }}>
                {evs.map(ev => (
                  <a
                    key={ev.id}
                    href={ev.lien || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: "none" }}
                  >
                    <div style={{
                      background: "#fff",
                      borderRadius: 10,
                      padding: m ? "10px 14px" : "12px 16px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      border: "1px solid #F1F5F9",
                      transition: "box-shadow .15s",
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,0.1)"}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"}
                    >
                      {/* Bande couleur */}
                      <div style={{ width: 4, borderRadius: 4, alignSelf: "stretch", flexShrink: 0, background: GCAL_COLORS[ev.couleur] || GCAL_COLORS.default }} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#0F172A", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ev.titre}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "#64748B" }}>
                          {ev.allDay ? (
                            <span>🗓 Journée entière</span>
                          ) : (
                            <span>🕐 {fmtTime(ev.debut)}{ev.fin ? ` → ${fmtTime(ev.fin)}` : ""}</span>
                          )}
                          {ev.lieu && <span>📍 {ev.lieu}</span>}
                        </div>
                        {ev.description && (
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94A3B8", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                            {ev.description}
                          </p>
                        )}
                      </div>

                      {/* Flèche */}
                      <div style={{ color: "#CBD5E1", fontSize: 16, flexShrink: 0, alignSelf: "center" }}>›</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const navBtn = {
  padding: "6px 10px", background: "#fff", border: "1px solid #E2E8F0",
  borderRadius: 8, cursor: "pointer", fontSize: 16, color: "#334155",
  fontFamily: "inherit", lineHeight: 1,
};
