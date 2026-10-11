'use client'
import { useMemo } from 'react'
import { pct, fmtMoney, PBar, COMPANY, Icon, I } from '../dashboards/shared'
import { buildAgenda, buildClientOverview, localISO } from '../lib/today'
import { newIntent } from '../lib/navIntent'
import TodayPanel from '../components/dashboard/TodayPanel'
import PrioritiesPanel from '../components/dashboard/PrioritiesPanel'
import { buildPriorities } from '../lib/priorities'
import CrmPanel from '../components/dashboard/CrmPanel'
import { buildCrmDaily, buildConformiteItems } from '../lib/dailyPriorities'
import { useConformite } from '../hooks/useConformite'
import ClientOverview from '../components/dashboard/ClientOverview'
import Emoji from '../components/Emoji'
import { EMOJI } from '../lib/emoji'
import { Skeleton } from '../components/Skeleton'

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
    chantiersEnCours, totalB, totalD, enCours, osEnCours, osCount,
  } = useMemo(() => {
    const chantiers = data.chantiers || [];
    const os = data.ordresService || [];
    return {
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
    };
  }, [data.chantiers, data.ordresService]);

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
        margin:0, fontSize:m?28:32, fontWeight:700, color:"var(--label)", letterSpacing:"-0.02em",
        // Force le wrapping pour les prénoms longs (ex: noms composés, adresse
        // email utilisée en fallback) — évite tout débordement horizontal.
        wordBreak:"break-word", overflowWrap:"anywhere"
      }}>{getGreeting()} {firstName}</h1>
      <p style={{
        margin:"6px 0 0", color:"var(--label-secondary)",
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
          background:"#fff", border:"1px solid var(--separator)", borderRadius:10,
          padding:"12px", minHeight:48, cursor:"pointer",
          textAlign:"left", fontWeight:600, fontSize:13, color:"var(--label)",
          display:"flex", alignItems:"center", gap:10, fontFamily:"inherit",
        }}>
          <span style={{
            width:32, height:32, borderRadius:8, flexShrink:0,
            background:"var(--grouped-bg)", color:"var(--accent)", display:"inline-flex",
            alignItems:"center", justifyContent:"center"
          }}><Icon d={a.icon} size={18}/></span>
          {a.label}
        </button>
      ))}
    </div>}

    {/* CHIFFRES CLÉS — les tâches urgentes et en retard sont dans « Ma journée » */}
    <div style={{
      display:"grid",
      gridTemplateColumns:m||!clientMode?"repeat(2,1fr)":"repeat(4,1fr)",
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
      ]).map((k,i)=>(
        <button key={i} onClick={()=>setTab(k.tab)} className="u-press" style={{
          background:"#fff", border:"1px solid var(--separator)", borderRadius:10,
          padding:"12px 14px", cursor:"pointer", textAlign:"left",
          fontFamily:"inherit",
        }}>
          <div style={{
            fontSize:11, fontWeight:600, color:"var(--label-secondary)",
            textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4
          }}>{k.label}</div>
          <div style={{display:"flex",alignItems:"baseline",gap:6}}>
            <span style={{
              fontSize:m?22:24, fontWeight:700, lineHeight:1,
              // Couleur seulement si le chiffre signale un problème
              color:k.alert && k.value>0 ? k.alert : "var(--label)",
            }}>{k.value}</span>
            {k.total!=null && <span style={{fontSize:12,color:"var(--label-secondary)",fontWeight:500}}>
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
        border:"1px solid var(--separator)",
        boxShadow:"0 1px 3px rgba(0,0,0,0.06)", marginBottom:18
      }}>
        <div style={{
          display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:14
        }}>
          <h2 style={{margin:0,fontSize:17,fontWeight:600,color:"var(--label)",display:"flex",alignItems:"center",gap:8}}>
            <Emoji e={EMOJI.chantiers} />Chantiers en cours
          </h2>
          <button
            onClick={()=>setTab("projects")} className="u-hit"
            style={{
              fontSize:15, color:"var(--accent-text)", background:"none", minHeight:36,
              border:"none", cursor:"pointer", fontWeight:600, fontFamily:"inherit"
            }}
          >Voir tout</button>
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
            const budgetColor = over ? "#D70015" : "#0071E3";
            return(
              <div key={ch.id} onClick={()=>setTab("projects",ch.id)}
                role="button" tabIndex={0} aria-label={`Ouvrir le chantier ${ch.nom}`}
                onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); setTab("projects",ch.id); } }}
                className="u-press"
                style={{
                  border:"1px solid var(--separator)",
                  borderRadius:10, padding:12,
                  cursor:"pointer", background:"#fff",
                }}>
                <div style={{marginBottom:8}}>
                  <div style={{
                    fontWeight:700, fontSize:13, color:"var(--label)", marginBottom:2,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                  }}>{ch.nom}</div>
                  <div style={{
                    fontSize:12, color:"var(--label-secondary)",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                  }}>{ch.client}</div>
                </div>
                <PBar value={ch.depenses} max={ch.budget} color={budgetColor}/>
                <div style={{
                  display:"flex", justifyContent:"space-between",
                  marginTop:8, fontSize:12, color:"var(--label-secondary)"
                }}>
                  <span>
                    <span style={{fontWeight:600,color:over?"var(--red-text)":"var(--label-2)"}}>
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
    {/* Commercial encore en chargement : place réservée (pas de saut) */}
    {!clientMode && !hasCrm && !ready && (
      <div aria-hidden="true" style={{
        background:"#fff", borderRadius:12, padding:m?14:18, marginBottom:18,
        border:"1px solid var(--separator)", minHeight:200, boxSizing:"border-box",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <Skeleton width={28} height={28} radius={8}/>
          <Skeleton width={120} height={17}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",gap:8}}>
          {[0,1,2,3].map(i=><Skeleton key={i} height={62} radius={10}/>)}
        </div>
      </div>
    )}

    {/* BUDGET — espace client seulement (côté équipe : pages Chantiers et CRM) */}
    {clientMode && (
    <div style={{
      background:"#fff", borderRadius:12, padding:m?14:18,
      border:"1px solid var(--separator)",
      boxShadow:"0 1px 3px rgba(0,0,0,0.06)"
    }}>
      <h3 style={{margin:"0 0 14px",fontSize:17,fontWeight:600,color:"var(--label)",display:"flex",alignItems:"center",gap:8}}>
        <Emoji e={EMOJI.budget} />Budget global
      </h3>
      <div style={{
        display:"grid",
        gridTemplateColumns:m?"1fr":"repeat(3,1fr)",
        gap:14
      }}>
        <div>
          <div style={{
            fontSize:11, color:"var(--label-secondary)", fontWeight:600, marginBottom:4,
            textTransform:"uppercase", letterSpacing:"0.05em"
          }}>Alloué</div>
          <div style={{fontSize:m?20:22,fontWeight:700,color:"var(--label)"}}>
            {fmtMoney(totalB)}
          </div>
        </div>
        <div>
          <div style={{
            fontSize:11, color:"var(--label-secondary)", fontWeight:600, marginBottom:4,
            textTransform:"uppercase", letterSpacing:"0.05em"
          }}>Dépensé</div>
          <div style={{
            fontSize:m?20:22, fontWeight:700,
            color: pct(totalD,totalB)>100 ? "var(--red-text)" : "var(--label)"
          }}>{fmtMoney(totalD)}</div>
        </div>
        <div>
          <div style={{
            fontSize:11, color:"var(--label-secondary)", fontWeight:600, marginBottom:4,
            textTransform:"uppercase", letterSpacing:"0.05em"
          }}>Reste</div>
          <div style={{fontSize:m?20:22,fontWeight:700,color:"var(--label)"}}>
            {fmtMoney(Math.max(0,totalB-totalD))}
          </div>
        </div>
      </div>
      <div style={{marginTop:12}}>
        <PBar
          value={totalD}
          max={totalB||1}
          color={pct(totalD,totalB)>100 ? "#D70015" : "#0071E3"}
          h={8}
        />
        <div style={{fontSize:12,color:"var(--label-secondary)",marginTop:6,textAlign:"right"}}>
          {pct(totalD,totalB)}% du budget consommé
        </div>
      </div>
    </div>
    )}
  </div>);
}
