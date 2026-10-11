'use client'
import { useMemo } from 'react'
import { pct, fmtMoney, PBar, COMPANY, Icon, I } from '../dashboards/shared'
import Badge from '../components/Badge'
import { buildAgenda, buildClientOverview, localISO } from '../lib/today'
import { newIntent } from '../lib/navIntent'
import TodayPanel from '../components/dashboard/TodayPanel'
import PrioritiesPanel from '../components/dashboard/PrioritiesPanel'
import { buildPriorities } from '../lib/priorities'
import CrmPanel from '../components/dashboard/CrmPanel'
import { buildCrmDaily, buildConformiteItems } from '../lib/dailyPriorities'
import { useConformite } from '../hooks/useConformite'
import ClientOverview from '../components/dashboard/ClientOverview'

// Salutation selon l'heure de la journée
const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 6) return "Bonne nuit"
  if (h < 12) return "Bonjour"
  if (h < 18) return "Bon après-midi"
  return "Bonsoir"
}

// clientMode : vue maître d'ouvrage (lecture seule) — pas d'actions de
// création, pas de CRM ni de tâches internes, mais le suivi des travaux.
export default function DashboardV({data,crm=null,ready=true,setTab,m,user,clientMode=false}) {
  // Toutes les dérivées memoïsées : recalculées uniquement si data change,
  // pas à chaque re-render dû à un toast ou un resize.
  const {
    urgentTasks, allActiveTasks, chantiersEnCours,
    totalB, totalD, enCours, chantierById,
    osEnCours, osCount, overdueTasks
  } = useMemo(() => {
    const tasks = data.tasks || [];
    const chantiers = data.chantiers || [];
    const os = data.ordresService || [];
    const today = new Date().toISOString().split("T")[0];
    const priorityOrder = { Urgent: 0, "En cours": 1, "En attente": 2 };

    return {
      urgentTasks: tasks.filter(
        t => t.priorite === "Urgent" && t.statut !== "Terminé"
      ),
      overdueTasks: tasks.filter(
        t => t.statut !== "Terminé" && t.echeance && t.echeance < today
      ),
      allActiveTasks: tasks
        .filter(t => t.statut !== "Terminé")
        .sort((a, b) => {
          const pa = priorityOrder[a.priorite] ?? 9;
          const pb = priorityOrder[b.priorite] ?? 9;
          if (pa !== pb) return pa - pb;
          return (
            new Date(a.echeance || "9999") - new Date(b.echeance || "9999")
          );
        }),
      chantiersEnCours: chantiers
        .filter(c => c.statut === "En cours")
        .sort((a, b) =>
          new Date(b.date_debut || 0) - new Date(a.date_debut || 0)
        )
        .slice(0, 3),
      totalB: chantiers.reduce((s, c) => s + (Number(c.budget) || 0), 0),
      totalD: chantiers.reduce((s, c) => s + (Number(c.depenses) || 0), 0),
      enCours: chantiers.filter(c => c.statut === "En cours").length,
      osCount: os.length,
      osEnCours: os.filter(
        o => !["Terminé","Annulé","Brouillon"].includes(o.statut)
      ).length,
      // Map id → chantier pour éviter les .find() répétés dans le rendu des tâches
      chantierById: new Map(chantiers.map(c => [c.id, c])),
    };
  }, [data.tasks, data.chantiers, data.ordresService]);

  // CRM : relances à traiter (en retard + aujourd'hui) et pipeline actif.
  // Même assemblage que le mail du matin (lib/dailyPriorities.js).
  const { crmInsights, hasCrm, relances, nbOverdue } = useMemo(
    () => buildCrmDaily(crm, { contacts: data.contacts }),
    [crm, data.contacts]
  )

  // « Ma journée » (admin) / suivi des travaux (client)
  const today = localISO()
  const agenda = useMemo(
    () => (clientMode ? null : buildAgenda(data, { today, relances })),
    [clientMode, data, today, relances]
  )
  // Documents des entreprises actives à revoir (Kbis, décennale, fiscale, URSSAF)
  const conformite = useConformite({ enabled: !clientMode });
  const conformiteItems = useMemo(
    () => (clientMode || conformite.missingMigration ? [] : buildConformiteItems(data, conformite.docs, today, conformite.legal)),
    [clientMode, conformite.missingMigration, conformite.docs, conformite.legal, data, today]
  )
  // « Mes priorités du jour » : chantier + commercial en un seul classement.
  // Heure à la minute : un rendez-vous passé depuis plus d'1 h en sort.
  const nowHM = new Date().toTimeString().slice(0, 5)
  const priorities = useMemo(
    () => (agenda ? buildPriorities({ agenda, crmItems: crmInsights.items, today, now: nowHM, extraItems: conformiteItems }) : null),
    [agenda, crmInsights, today, nowHM, conformiteItems]
  )
  const overview = useMemo(
    () => (clientMode ? buildClientOverview(data, { today }) : null),
    [clientMode, data, today]
  )

  // Prénom par défaut : valeur du metadata Google, sinon le prénom de l'utilisateur
  // Supabase, sinon le gérant défini dans COMPANY.
  const firstName = user?.user_metadata?.full_name?.split(" ")[0]
    || user?.email?.split("@")[0]
    || COMPANY.gerant;

  return (<div>
    {/* HEADER */}
    <div style={{marginBottom:22}}>
      <h1 style={{
        margin:0, fontSize:m?20:24, fontWeight:700, color:"#0F172A",
        // Force le wrapping pour les prénoms longs (ex: noms composés, adresse
        // email utilisée en fallback) — évite tout débordement horizontal.
        wordBreak:"break-word", overflowWrap:"anywhere"
      }}>{getGreeting()} {firstName}</h1>
      <p style={{
        margin:"6px 0 0", color:"#64748B",
        fontSize:13, textTransform:"capitalize"
      }}>{new Date().toLocaleDateString("fr-FR", {
        weekday:"long", day:"numeric", month:"long"
      })}</p>
    </div>

    {/* SUIVI MAÎTRE D'OUVRAGE */}
    {clientMode && overview && <ClientOverview overview={overview} onOpen={setTab} m={m}/>}

    {/* MES PRIORITÉS DU JOUR — par quoi commencer, et pourquoi */}
    {!clientMode && priorities && <PrioritiesPanel priorities={priorities} ready={ready} onOpen={setTab} userId={user?.id} today={today} m={m}/>}

    {/* MA JOURNÉE — ce qui demande une action aujourd'hui */}
    {!clientMode && agenda && <TodayPanel agenda={agenda} onOpen={setTab} m={m}/>}

    {/* ACTIONS RAPIDES — ouvrent directement le formulaire de création */}
    {!clientMode && <div style={{
      display:"grid",
      gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",
      gap:10, marginBottom:22
    }}>
      {[
        {label:"Nouvel OS",        icon:I.os,       tab:"os"},
        {label:"Nouveau CR",       icon:I.reports,  tab:"reports"},
        {label:"Nouvelle tâche",   icon:I.tasks,    tab:"tasks"},
        {label:"Nouveau chantier", icon:I.projects, tab:"projects"},
      ].map((a,i)=>(
        <button key={i} onClick={()=>setTab(a.tab, newIntent())} className="u-press" style={{
          background:"#fff", border:"1px solid #E2E8F0", borderRadius:10,
          padding:"12px", minHeight:48, cursor:"pointer",
          textAlign:"left", fontWeight:600, fontSize:13, color:"#0F172A",
          display:"flex", alignItems:"center", gap:10, fontFamily:"inherit",
        }}>
          <span style={{
            width:32, height:32, borderRadius:8, flexShrink:0,
            background:"#F1F5F9", color:"#1E3A5F", display:"inline-flex",
            alignItems:"center", justifyContent:"center"
          }}><Icon d={a.icon} size={18}/></span>
          {a.label}
        </button>
      ))}
    </div>}

    {/* KPIs RAPIDES — 4 chiffres clés */}
    <div style={{
      display:"grid",
      gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",
      gap:10, marginBottom:20
    }}>
      {(clientMode ? [
        {label:"Chantiers actifs", value:enCours,
          total:data.chantiers.length, tab:"projects"},
        {label:"Phases en cours", value:overview.enCours.length,
          total:(data.planning||[]).length, tab:"planning"},
        {label:"Comptes rendus", value:(data.compteRendus||[]).length,
          total:null, tab:"reports"},
        {label:"OS actifs", value:osEnCours,
          total:osCount, tab:"os"},
      ] : [
        {label:"Chantiers actifs", value:enCours,
          total:data.chantiers.length, tab:"projects"},
        {label:"OS actifs",        value:osEnCours,
          total:osCount, tab:"os"},
        {label:"Tâches urgentes",  value:urgentTasks.length,
          total:allActiveTasks.length, alert:"#B91C1C", tab:"tasks"},
        {label:"En retard",        value:overdueTasks.length,
          total:allActiveTasks.length, alert:"#B45309", tab:"tasks"},
      ]).map((k,i)=>(
        <button key={i} onClick={()=>setTab(k.tab)} className="u-press" style={{
          background:"#fff", border:"1px solid #E2E8F0", borderRadius:10,
          padding:"12px 14px", cursor:"pointer", textAlign:"left",
          fontFamily:"inherit",
        }}>
          <div style={{
            fontSize:11, fontWeight:600, color:"#64748B",
            textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4
          }}>{k.label}</div>
          <div style={{display:"flex",alignItems:"baseline",gap:6}}>
            <span style={{
              fontSize:m?22:24, fontWeight:700, lineHeight:1,
              // Couleur seulement si le chiffre signale un problème
              color:k.alert && k.value>0 ? k.alert : "#0F172A",
            }}>{k.value}</span>
            {k.total!=null && <span style={{fontSize:12,color:"#64748B",fontWeight:500}}>
              / {k.total}
            </span>}
          </div>
        </button>
      ))}
    </div>

    {/* CHANTIERS EN COURS — click = ouverture directe du détail du chantier */}
    {chantiersEnCours.length>0&&(
      <div style={{
        background:"#fff", borderRadius:12, padding:m?14:18,
        border:"1px solid #E2E8F0",
        boxShadow:"0 1px 3px rgba(15,23,42,0.06)", marginBottom:18
      }}>
        <div style={{
          display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:14
        }}>
          <h2 style={{margin:0,fontSize:15,fontWeight:700,color:"#0F172A"}}>
            Chantiers en cours
          </h2>
          <button
            onClick={()=>setTab("projects")}
            style={{
              fontSize:13, color:"#1D4ED8", background:"none", minHeight:36,
              border:"none", cursor:"pointer", fontWeight:600, fontFamily:"inherit"
            }}
          >Voir tous →</button>
        </div>
        <div style={{
          display:"grid",
          gridTemplateColumns:m?"1fr":"repeat(3,1fr)",
          gap:12
        }}>
          {chantiersEnCours.map(ch=>{
            const ratio=pct(ch.depenses,ch.budget);
            // Rouge seulement si le budget est dépassé, sinon marine
            const over = ratio>100;
            const budgetColor = over ? "#DC2626" : "#1E3A5F";
            return(
              <div key={ch.id} onClick={()=>setTab("projects",ch.id)}
                role="button" tabIndex={0} aria-label={`Ouvrir le chantier ${ch.nom}`}
                onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); setTab("projects",ch.id); } }}
                className="u-press"
                style={{
                  border:"1px solid #E2E8F0",
                  borderRadius:10, padding:12,
                  cursor:"pointer", background:"#fff",
                }}>
                <div style={{marginBottom:8}}>
                  <div style={{
                    fontWeight:700, fontSize:13, color:"#0F172A", marginBottom:2,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                  }}>{ch.nom}</div>
                  <div style={{
                    fontSize:12, color:"#64748B",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                  }}>{ch.client}</div>
                </div>
                <PBar value={ch.depenses} max={ch.budget} color={budgetColor}/>
                <div style={{
                  display:"flex", justifyContent:"space-between",
                  marginTop:8, fontSize:12, color:"#64748B"
                }}>
                  <span>
                    <span style={{fontWeight:600,color:over?"#B91C1C":"#334155"}}>
                      {ratio}%
                    </span>
                    {" dépensé"}
                  </span>
                  <span>{fmtMoney(ch.depenses)} / {fmtMoney(ch.budget)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {/* COMMERCIAL — chiffres clés du CRM + signaux à saisir (devis consultés,
        signatures en attente, devis qui expirent, affaires dormantes…).
        Les relances du jour sont dans « Ma journée ». */}
    {!clientMode && hasCrm && (
      <CrmPanel insights={crmInsights} nbOverdue={nbOverdue} onOpen={setTab} m={m}/>
    )}

    {/* À FAIRE — tâches actives triées par priorité/échéance (interne MOE) */}
    {!clientMode && <div style={{
      background:"#fff",
      borderRadius:12, padding:m?14:18,
      border:"1px solid #E2E8F0",
      boxShadow:"0 1px 3px rgba(15,23,42,0.06)",
      marginBottom:18
    }}>
      <div style={{
        display:"flex", alignItems:"center",
        justifyContent:"space-between", gap:6, marginBottom:12
      }}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <h2 style={{margin:0,fontWeight:700,fontSize:15,color:"#0F172A"}}>À faire</h2>
          {urgentTasks.length>0&&(
            <Badge text={`${urgentTasks.length} urgente${urgentTasks.length>1?"s":""}`} color="#EF4444"/>
          )}
          {overdueTasks.length>0&&(
            <Badge text={`${overdueTasks.length} en retard`} color="#F59E0B"/>
          )}
        </div>
        {allActiveTasks.length>0 && (
          <button
            onClick={()=>setTab("tasks")}
            style={{
              fontSize:13, color:"#1D4ED8", background:"none", minHeight:36,
              border:"none", cursor:"pointer",
              fontWeight:600, fontFamily:"inherit"
            }}
          >Voir toutes →</button>
        )}
      </div>
      {allActiveTasks.length===0
        ? <div style={{
            textAlign:"center", padding:"14px 0",
            fontSize:13, color:"#64748B"
          }}>Aucune tâche en attente</div>
        : <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {allActiveTasks.slice(0,5).map((t,i)=>{
              const ch=chantierById.get(t.chantierId||t.chantier_id);
              const isUrgent=t.priorite==="Urgent";
              const isOverdue=!isUrgent&&t.echeance&&t.echeance<today;
              const isLast = i === Math.min(4, allActiveTasks.length - 1);
              const dotColor = isUrgent?"#DC2626":isOverdue?"#F59E0B":"#CBD5E1";
              const titleColor = isUrgent?"#B91C1C":"#0F172A";
              return(
                <div key={t.id} onClick={()=>setTab("tasks",t.id)}
                  role="button" tabIndex={0} className="u-press u-press--row"
                  onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); setTab("tasks",t.id); } }}
                  style={{
                  cursor:"pointer", padding:"10px 4px", minHeight:44, boxSizing:"border-box",
                  borderBottom:isLast?"none":"1px solid #F1F5F9",
                  display:"flex", alignItems:"center", gap:10,
                }}>
                  <span style={{
                    width:6, height:6, borderRadius:"50%",
                    background:dotColor, flexShrink:0
                  }}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{
                      fontSize:13, fontWeight:600,
                      color:titleColor,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                    }}>{t.titre}</div>
                    <div style={{
                      fontSize:12, color:"#64748B", marginTop:2,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                    }}>
                      {ch?.nom || "—"}
                      {isOverdue&&(
                        <span style={{
                          color:"#B45309",fontWeight:600,marginLeft:6
                        }}>· Échéance dépassée</span>
                      )}
                    </div>
                  </div>
                  <span style={{fontSize:14,color:"#CBD5E1",flexShrink:0}}>›</span>
                </div>
              );
            })}
          </div>
      }
    </div>}

    {/* BUDGET GLOBAL — vue d'ensemble financière */}
    <div style={{
      background:"#fff", borderRadius:12, padding:m?14:18,
      border:"1px solid #E2E8F0",
      boxShadow:"0 1px 3px rgba(15,23,42,0.06)"
    }}>
      <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700,color:"#0F172A"}}>
        Budget global
      </h3>
      <div style={{
        display:"grid",
        gridTemplateColumns:m?"1fr":"repeat(3,1fr)",
        gap:14
      }}>
        <div>
          <div style={{
            fontSize:11, color:"#64748B", fontWeight:600, marginBottom:4,
            textTransform:"uppercase", letterSpacing:"0.05em"
          }}>Alloué</div>
          <div style={{fontSize:m?20:22,fontWeight:700,color:"#0F172A"}}>
            {fmtMoney(totalB)}
          </div>
        </div>
        <div>
          <div style={{
            fontSize:11, color:"#64748B", fontWeight:600, marginBottom:4,
            textTransform:"uppercase", letterSpacing:"0.05em"
          }}>Dépensé</div>
          <div style={{
            fontSize:m?20:22, fontWeight:700,
            color: pct(totalD,totalB)>100 ? "#B91C1C" : "#0F172A"
          }}>{fmtMoney(totalD)}</div>
        </div>
        <div>
          <div style={{
            fontSize:11, color:"#64748B", fontWeight:600, marginBottom:4,
            textTransform:"uppercase", letterSpacing:"0.05em"
          }}>Reste</div>
          <div style={{fontSize:m?20:22,fontWeight:700,color:"#0F172A"}}>
            {fmtMoney(Math.max(0,totalB-totalD))}
          </div>
        </div>
      </div>
      <div style={{marginTop:12}}>
        <PBar
          value={totalD}
          max={totalB||1}
          color={pct(totalD,totalB)>100 ? "#DC2626" : "#1E3A5F"}
          h={8}
        />
        <div style={{fontSize:12,color:"#64748B",marginTop:6,textAlign:"right"}}>
          {pct(totalD,totalB)}% du budget consommé
        </div>
      </div>
    </div>
  </div>);
}
