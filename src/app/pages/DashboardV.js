'use client'
import { useMemo } from 'react'
import { pct, fmtMoney, phase, PBar, COMPANY } from '../dashboards/shared'

// Salutation selon l'heure de la journée
const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 6) return "Bonne nuit"
  if (h < 12) return "Bonjour"
  if (h < 18) return "Bon après-midi"
  return "Bonsoir"
}

export default function DashboardV({data,setTab,m,user}) {
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

  // Prénom par défaut : valeur du metadata Google, sinon le prénom de l'utilisateur
  // Supabase, sinon le gérant défini dans COMPANY.
  const firstName = user?.user_metadata?.full_name?.split(" ")[0]
    || user?.email?.split("@")[0]
    || COMPANY.gerant;

  return (<div>
    {/* HEADER */}
    <div style={{marginBottom:22}}>
      <h1 style={{
        margin:0, fontSize:m?22:28, fontWeight:700, color:"#0F172A"
      }}>{getGreeting()} {firstName}</h1>
      <p style={{
        margin:"6px 0 0", color:"#64748B",
        fontSize:m?12:13, textTransform:"capitalize"
      }}>{new Date().toLocaleDateString("fr-FR", {
        weekday:"long", day:"numeric", month:"long"
      })}</p>
    </div>

    {/* ACTIONS RAPIDES — avec accent de couleur par type d'action */}
    <div style={{
      display:"grid",
      gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",
      gap:10, marginBottom:22
    }}>
      {[
        {label:"Nouvel OS",       icon:"📋", tab:"os",       color:"#8B5CF6", bg:"#F5F3FF"},
        {label:"Nouveau CR",      icon:"📝", tab:"reports",  color:"#3B82F6", bg:"#EFF6FF"},
        {label:"Nouvelle tâche",  icon:"✓",  tab:"tasks",    color:"#F59E0B", bg:"#FFFBEB"},
        {label:"Nouveau chantier",icon:"🏗️", tab:"projects", color:"#10B981", bg:"#ECFDF5"},
      ].map((a,i)=>(
        <button key={i} onClick={()=>setTab(a.tab)} style={{
          background:"#fff", border:"1.5px solid #E2E8F0", borderRadius:10,
          padding:"14px 12px", cursor:"pointer",
          transition:"transform .15s, box-shadow .15s, border-color .15s",
          textAlign:"center", fontWeight:600, fontSize:12, color:"#0F172A",
          display:"flex", flexDirection:"column",
          alignItems:"center", gap:8, fontFamily:"inherit",
        }}
        onMouseEnter={e=>{
          e.currentTarget.style.borderColor=a.color;
          e.currentTarget.style.transform="translateY(-2px)";
          e.currentTarget.style.boxShadow=`0 4px 12px ${a.color}22`;
        }}
        onMouseLeave={e=>{
          e.currentTarget.style.borderColor="#E2E8F0";
          e.currentTarget.style.transform="";
          e.currentTarget.style.boxShadow="none";
        }}>
          <span style={{
            fontSize:22, width:40, height:40, borderRadius:10,
            background:a.bg, display:"inline-flex",
            alignItems:"center", justifyContent:"center"
          }}>{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>

    {/* KPIs RAPIDES — 4 chiffres clés */}
    <div style={{
      display:"grid",
      gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",
      gap:10, marginBottom:20
    }}>
      {[
        {label:"Chantiers actifs", value:enCours,
          total:data.chantiers.length, color:"#3B82F6", tab:"projects"},
        {label:"OS actifs",        value:osEnCours,
          total:osCount, color:"#8B5CF6", tab:"os"},
        {label:"Tâches urgentes",  value:urgentTasks.length,
          total:allActiveTasks.length, color:"#EF4444", tab:"tasks"},
        {label:"En retard",        value:overdueTasks.length,
          total:allActiveTasks.length, color:"#F59E0B", tab:"tasks"},
      ].map((k,i)=>(
        <button key={i} onClick={()=>setTab(k.tab)} style={{
          background:"#fff", border:"1px solid #E2E8F0", borderRadius:10,
          padding:"12px 14px", cursor:"pointer", textAlign:"left",
          fontFamily:"inherit",
          transition:"border-color .15s, transform .15s",
        }}
        onMouseEnter={e=>{
          e.currentTarget.style.borderColor=k.color;
          e.currentTarget.style.transform="translateY(-1px)";
        }}
        onMouseLeave={e=>{
          e.currentTarget.style.borderColor="#E2E8F0";
          e.currentTarget.style.transform="";
        }}>
          <div style={{
            fontSize:10, fontWeight:700, color:"#94A3B8",
            textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4
          }}>{k.label}</div>
          <div style={{display:"flex",alignItems:"baseline",gap:6}}>
            <span style={{
              fontSize:m?22:26, fontWeight:700, color:k.color, lineHeight:1
            }}>{k.value}</span>
            <span style={{fontSize:11,color:"#94A3B8",fontWeight:500}}>
              / {k.total}
            </span>
          </div>
        </button>
      ))}
    </div>

    {/* CHANTIERS EN COURS — click = ouverture directe du détail du chantier */}
    {chantiersEnCours.length>0&&(
      <div style={{
        background:"#fff", borderRadius:14, padding:m?14:18,
        boxShadow:"0 1px 3px rgba(0,0,0,0.06)", marginBottom:18
      }}>
        <div style={{
          display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:14
        }}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:"#0F172A"}}>
            Chantiers en cours
          </h2>
          <button
            onClick={()=>setTab("projects")}
            style={{
              fontSize:11, color:"#3B82F6", background:"none",
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
            const budgetColor=ratio>85?"#EF4444":ratio>60?"#F59E0B":"#10B981";
            const phaseColor = phase[ch.phase]||"#94A3B8";
            return(
              <div key={ch.id} onClick={()=>setTab("projects",ch.id)}
                style={{
                  border:`1.5px solid #E2E8F0`,
                  borderLeft:`4px solid ${phaseColor}`,
                  borderRadius:10, padding:12,
                  cursor:"pointer", background:"#fff",
                  transition:"box-shadow .15s, transform .15s, border-color .15s"
                }}
                onMouseEnter={e=>{
                  e.currentTarget.style.boxShadow="0 4px 12px rgba(15,23,42,0.1)";
                  e.currentTarget.style.transform="translateY(-2px)";
                  e.currentTarget.style.borderColor=phaseColor;
                  e.currentTarget.style.borderLeftColor=phaseColor;
                }}
                onMouseLeave={e=>{
                  e.currentTarget.style.boxShadow="none";
                  e.currentTarget.style.transform="";
                  e.currentTarget.style.borderColor="#E2E8F0";
                  e.currentTarget.style.borderLeftColor=phaseColor;
                }}>
                <div style={{marginBottom:8}}>
                  <div style={{
                    fontWeight:700, fontSize:13, color:"#0F172A", marginBottom:2,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                  }}>{ch.nom}</div>
                  <div style={{
                    fontSize:11, color:"#64748B",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                  }}>{ch.client}</div>
                </div>
                <PBar value={ch.depenses} max={ch.budget} color={budgetColor}/>
                <div style={{
                  display:"flex", justifyContent:"space-between",
                  marginTop:8, fontSize:10, color:"#94A3B8"
                }}>
                  <span>
                    <span style={{fontWeight:600,color:budgetColor}}>
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

    {/* À FAIRE — tâches actives triées par priorité/échéance */}
    <div style={{
      background:urgentTasks.length>0?"#FEF2F2":"#fff",
      borderRadius:14, padding:m?14:18,
      border:`1.5px solid ${urgentTasks.length>0?"#FECACA":"#E2E8F0"}`,
      marginBottom:18
    }}>
      <div style={{
        display:"flex", alignItems:"center",
        justifyContent:"space-between", gap:6, marginBottom:12
      }}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontWeight:700,fontSize:15,color:"#0F172A"}}>⚡ À faire</span>
          {urgentTasks.length>0&&(
            <span style={{
              background:"#EF4444", color:"#fff",
              borderRadius:6, padding:"2px 8px",
              fontSize:11, fontWeight:700
            }}>
              {urgentTasks.length} urgente{urgentTasks.length>1?"s":""}
            </span>
          )}
          {overdueTasks.length>0&&(
            <span style={{
              background:"#F59E0B", color:"#fff",
              borderRadius:6, padding:"2px 8px",
              fontSize:11, fontWeight:700
            }}>
              {overdueTasks.length} en retard
            </span>
          )}
        </div>
        {allActiveTasks.length>0 && (
          <button
            onClick={()=>setTab("tasks")}
            style={{
              fontSize:11, color:"#3B82F6", background:"none",
              border:"none", cursor:"pointer",
              fontWeight:600, fontFamily:"inherit"
            }}
          >Voir toutes →</button>
        )}
      </div>
      {allActiveTasks.length===0
        ? <div style={{
            textAlign:"center", padding:"14px 0",
            fontSize:13, color:"#94A3B8"
          }}>🎉 Aucune tâche en attente</div>
        : <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {allActiveTasks.slice(0,5).map((t,i)=>{
              const ch=chantierById.get(t.chantierId||t.chantier_id);
              const isUrgent=t.priorite==="Urgent";
              const today=new Date().toISOString().split("T")[0];
              const isOverdue=!isUrgent&&t.echeance&&t.echeance<today;
              const isLast = i === Math.min(4, allActiveTasks.length - 1);
              const dotColor = isUrgent?"#EF4444":isOverdue?"#F59E0B":"#CBD5E1";
              const titleColor = isUrgent?"#EF4444":isOverdue?"#B45309":"#0F172A";
              return(
                <div key={t.id} onClick={()=>setTab("tasks",t.id)} style={{
                  cursor:"pointer", padding:"8px 0",
                  borderBottom:isLast?"none":"1px solid #F1F5F9",
                  display:"flex", alignItems:"center", gap:10,
                }}>
                  <span style={{
                    width:6, height:6, borderRadius:"50%",
                    background:dotColor, flexShrink:0
                  }}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{
                      fontSize:12, fontWeight:(isUrgent||isOverdue)?700:600,
                      color:titleColor,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                    }}>{t.titre}</div>
                    <div style={{
                      fontSize:10, color:"#94A3B8", marginTop:2,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                    }}>
                      {ch?.nom || "—"}
                      {isOverdue&&(
                        <span style={{
                          color:"#F59E0B",fontWeight:700,marginLeft:6
                        }}>⚠ Éch. dépassée</span>
                      )}
                    </div>
                  </div>
                  <span style={{fontSize:14,color:"#CBD5E1",flexShrink:0}}>›</span>
                </div>
              );
            })}
          </div>
      }
    </div>

    {/* BUDGET GLOBAL — vue d'ensemble financière */}
    <div style={{
      background:"#fff", borderRadius:14, padding:m?14:18,
      boxShadow:"0 1px 3px rgba(0,0,0,0.06)"
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
            fontSize:10, color:"#94A3B8", fontWeight:700, marginBottom:4,
            textTransform:"uppercase", letterSpacing:"0.05em"
          }}>Alloué</div>
          <div style={{fontSize:m?22:26,fontWeight:700,color:"#0F172A"}}>
            {fmtMoney(totalB)}
          </div>
        </div>
        <div>
          <div style={{
            fontSize:10, color:"#94A3B8", fontWeight:700, marginBottom:4,
            textTransform:"uppercase", letterSpacing:"0.05em"
          }}>Dépensé</div>
          <div style={{
            fontSize:m?22:26, fontWeight:700,
            color: pct(totalD,totalB)>85
              ? "#EF4444"
              : pct(totalD,totalB)>60 ? "#F59E0B" : "#10B981"
          }}>{fmtMoney(totalD)}</div>
        </div>
        <div>
          <div style={{
            fontSize:10, color:"#94A3B8", fontWeight:700, marginBottom:4,
            textTransform:"uppercase", letterSpacing:"0.05em"
          }}>Reste</div>
          <div style={{fontSize:m?22:26,fontWeight:700,color:"#0F172A"}}>
            {fmtMoney(Math.max(0,totalB-totalD))}
          </div>
        </div>
      </div>
      <div style={{marginTop:12}}>
        <PBar
          value={totalD}
          max={totalB||1}
          color={
            pct(totalD,totalB)>85
              ? "#EF4444"
              : pct(totalD,totalB)>60 ? "#F59E0B" : "#10B981"
          }
          h={8}
        />
        <div style={{fontSize:11,color:"#64748B",marginTop:6,textAlign:"right"}}>
          {pct(totalD,totalB)}% du budget consommé
        </div>
      </div>
    </div>
  </div>);
}
