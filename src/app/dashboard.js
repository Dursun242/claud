'use client'
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from './supabaseClient'
import { generateOSPdf, generateCRPdf, generateOSExcel, generateCRExcel } from './generators'

const LocalDB = {
  get(key) { try { if (typeof window === 'undefined') return null; const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(key, val) { try { if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error(e); } },
};

// ─── SUPABASE CRUD HELPERS ───
const SB = {
  async loadAll() {
    const [ch, co, ta, pl, rv, cr, os] = await Promise.all([
      supabase.from('chantiers').select('*').order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').order('nom'),
      supabase.from('taches').select('*').order('created_at', { ascending: false }),
      supabase.from('planning').select('*').order('debut'),
      supabase.from('rdv').select('*').order('date'),
      supabase.from('compte_rendus').select('*').order('date', { ascending: false }),
      supabase.from('ordres_service').select('*').order('created_at', { ascending: false }),
    ]);
    return {
      chantiers: (ch.data || []).map(c => ({ ...c, lots: c.lots || [] })),
      contacts: (co.data || []).map(c => ({ ...c, chantiers: [] })),
      tasks: (ta.data || []).map(t => ({ ...t, chantierId: t.chantier_id })),
      planning: (pl.data || []).map(p => ({ ...p, chantierId: p.chantier_id })),
      rdv: (rv.data || []).map(r => ({ ...r, chantierId: r.chantier_id, participants: r.participants || [] })),
      compteRendus: (cr.data || []).map(c => ({ ...c, chantierId: c.chantier_id })),
      ordresService: os.data || [],
    };
  },

  // Chantiers
  async upsertChantier(ch) {
    const row = { nom: ch.nom, client: ch.client, adresse: ch.adresse, phase: ch.phase, statut: ch.statut, budget: Number(ch.budget)||0, depenses: Number(ch.depenses)||0, date_debut: ch.dateDebut||ch.date_debut||null, date_fin: ch.dateFin||ch.date_fin||null, lots: ch.lots||[] };
    if (ch.id && String(ch.id).length > 10) {
      const { data, error } = await supabase.from('chantiers').update(row).eq('id', ch.id).select().single();
      if (error) console.error("❌ Update chantier:", error.message);
      else console.log("✅ Chantier mis à jour:", data?.nom);
      return data;
    } else {
      const { data, error } = await supabase.from('chantiers').insert(row).select().single();
      if (error) console.error("❌ Insert chantier:", error.message);
      else console.log("✅ Chantier créé:", data?.nom);
      return data;
    }
  },
  async deleteChantier(id) { await supabase.from('chantiers').delete().eq('id', id); },

  // Contacts
  async upsertContact(c) {
    const row = { nom: c.nom, type: c.type, specialite: c.specialite, tel: c.tel, email: c.email, adresse: c.adresse||null, siret: c.siret||null };
    if (c.id && String(c.id).length > 10) {
      const { data, error } = await supabase.from('contacts').update(row).eq('id', c.id).select().single();
      if (error) console.error("❌ Update contact:", error.message);
      return data;
    } else {
      const { data, error } = await supabase.from('contacts').insert(row).select().single();
      if (error) console.error("❌ Insert contact:", error.message);
      return data;
    }
  },
  async deleteContact(id) { await supabase.from('contacts').delete().eq('id', id); },

  // Tâches
  async upsertTask(t) {
    const row = { chantier_id: t.chantierId||t.chantier_id, titre: t.titre, priorite: t.priorite, statut: t.statut, echeance: t.echeance||null, lot: t.lot };
    if (t.id && String(t.id).length > 10) {
      const { data, error } = await supabase.from('taches').update(row).eq('id', t.id).select().single();
      if (error) console.error("❌ Update tâche:", error.message);
      return data;
    } else {
      const { data, error } = await supabase.from('taches').insert(row).select().single();
      if (error) console.error("❌ Insert tâche:", error.message);
      else console.log("✅ Tâche créée:", data?.titre);
      return data;
    }
  },
  async deleteTask(id) { await supabase.from('taches').delete().eq('id', id); },

  // Comptes Rendus
  async upsertCR(cr) {
    const row = { chantier_id: cr.chantierId||cr.chantier_id||null, date: cr.date||null, numero: Number(cr.numero)||1, resume: cr.resume||"", participants: cr.participants||"", decisions: cr.decisions||"" };
    if (cr.id && String(cr.id).length > 10) {
      const { data, error } = await supabase.from('compte_rendus').update(row).eq('id', cr.id).select().single();
      if (error) console.error("❌ Update CR:", error.message);
      else console.log("✅ CR mis à jour:", data?.numero);
      return data;
    } else {
      const { data, error } = await supabase.from('compte_rendus').insert(row).select().single();
      if (error) console.error("❌ Insert CR:", error.message);
      else console.log("✅ CR créé n°", data?.numero);
      return data;
    }
  },
  async deleteCR(id) { const { error } = await supabase.from('compte_rendus').delete().eq('id', id); if (error) console.error("❌ Delete CR:", error.message); },

  // Ordres de Service
  async upsertOS(os) {
    const row = { numero: os.numero||"OS-XXXX", chantier_id: os.chantier_id||null, client_nom: os.client_nom||"", client_adresse: os.client_adresse||"", artisan_nom: os.artisan_nom||"", artisan_specialite: os.artisan_specialite||"", artisan_tel: os.artisan_tel||"", artisan_email: os.artisan_email||"", artisan_siret: os.artisan_siret||"", date_emission: os.date_emission||null, date_intervention: os.date_intervention||null, date_fin_prevue: os.date_fin_prevue||null, prestations: os.prestations||[], montant_ht: Number(os.montant_ht)||0, montant_tva: Number(os.montant_tva)||0, montant_ttc: Number(os.montant_ttc)||0, statut: os.statut||'Brouillon', observations: os.observations||"", conditions: os.conditions||"" };
    if (os.id && String(os.id).length > 10) {
      const { data, error } = await supabase.from('ordres_service').update(row).eq('id', os.id).select().single();
      if (error) console.error("❌ Update OS:", error.message);
      else console.log("✅ OS mis à jour:", data?.numero);
      return data;
    } else {
      const { data, error } = await supabase.from('ordres_service').insert(row).select().single();
      if (error) console.error("❌ Insert OS:", error.message, JSON.stringify(row));
      else console.log("✅ OS créé:", data?.numero);
      return data;
    }
  },
  async deleteOS(id) { const { error } = await supabase.from('ordres_service').delete().eq('id', id); if (error) console.error("❌ Delete OS:", error.message); },
};

// ─── ICONS ───
const Icon = ({ d, size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const I = {
  dashboard: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  projects: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  planning: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z",
  budget: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  tasks: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  contacts: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  reports: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  ai: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z M12 8v4l3 3",
  send: "M22 2L11 13 M22 2l-7 20-4-9-9-4z",
  plus: "M12 5v14 M5 12h14",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  trash: "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18 M6 6l12 12",
  search: "M11 17.25a6.25 6.25 0 1 1 0-12.5 6.25 6.25 0 0 1 0 12.5z M16 16l4.5 4.5",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  mappin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  menu: "M3 12h18M3 6h18M3 18h18",
  mic: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8",
};

// ─── COLORS ───
const phase = { "Hors d'air": "#F59E0B", "Technique": "#3B82F6", "Finitions": "#10B981" };
const status = { "En cours": "#3B82F6", "Planifié": "#8B5CF6", "Terminé": "#10B981", "En attente": "#F59E0B", "Urgent": "#EF4444" };
const GC = { primary: "#EA4335", light: "#FEF2F2", border: "#FECACA", gradient: "linear-gradient(135deg, #EA4335 0%, #FBBC04 50%, #34A853 75%, #4285F4 100%)" };

// ─── GCAL EVENTS ───
const gcalEvents = [
  { id: "gc1", summary: "RDV MARYAM", start: "2026-03-17T12:00:00+01:00", end: "2026-03-17T13:00:00+01:00", location: "", description: "" },
  { id: "gc2", summary: "Garage Lucas", start: "2026-03-18T16:00:00+01:00", end: "2026-03-18T17:00:00+01:00", location: "Mairie - Oudalle", description: "" },
  { id: "gc3", summary: "FRIBOULET - Finaliser PC modificatif", start: "2026-03-19T14:00:00+01:00", end: "2026-03-19T16:00:00+01:00", location: "", description: "Dernière vérification dossier PC modificatif garage." },
  { id: "gc4", summary: "Eurofins LABORATOIRE", start: "2026-03-20T11:00:00+01:00", end: "2026-03-20T12:00:00+01:00", location: "Gonneville-la-Mallet", description: "" },
  { id: "gc5", summary: "FRIBOULET - Dépôt PC modificatif", start: "2026-03-20T14:00:00+01:00", end: "2026-03-20T15:00:00+01:00", location: "Mairie de Riville", description: "Dépôt permis modificatif pour ajout garage." },
];

// ─── DEFAULT DATA ───
const defaultData = {
  chantiers: [
    { id:"ch1",nom:"Résidence Les Voiles",client:"SCI Maritime",adresse:"12 Quai de Southampton, Le Havre",phase:"Technique",statut:"En cours",budget:450000,depenses:287000,dateDebut:"2025-09-01",dateFin:"2026-06-30",lots:["Gros œuvre","Électricité","Plomberie","Menuiserie"] },
    { id:"ch2",nom:"Bureaux Port 2000",client:"HAROPA",adresse:"Zone industrielle Port 2000",phase:"Hors d'air",statut:"En cours",budget:820000,depenses:195000,dateDebut:"2025-11-15",dateFin:"2026-12-31",lots:["Structure métallique","Bardage","Électricité","CVC"] },
    { id:"ch3",nom:"Villa Sainte-Adresse",client:"M. Durand",adresse:"8 Rue Émile Zola, Sainte-Adresse",phase:"Finitions",statut:"En cours",budget:280000,depenses:241000,dateDebut:"2025-03-01",dateFin:"2026-04-15",lots:["Peinture","Revêtements sols","Menuiserie int."] },
    { id:"ch4",nom:"Réhab. Immeuble Thiers",client:"Copropriété Thiers",adresse:"34 Rue Thiers, Le Havre",phase:"Hors d'air",statut:"Planifié",budget:620000,depenses:0,dateDebut:"2026-04-01",dateFin:"2027-03-31",lots:["Ravalement","Étanchéité","Menuiseries ext."] },
    { id:"ch5",nom:"Garage Lucas",client:"M. Lucas",adresse:"Oudalle",phase:"Technique",statut:"En cours",budget:85000,depenses:32000,dateDebut:"2026-01-15",dateFin:"2026-05-30",lots:["Maçonnerie","Charpente","Couverture"] },
    { id:"ch6",nom:"Maison Friboulet",client:"Famille Friboulet",adresse:"Riville",phase:"Hors d'air",statut:"En cours",budget:320000,depenses:78000,dateDebut:"2025-12-01",dateFin:"2026-09-30",lots:["Gros œuvre","Charpente","Menuiseries ext.","Électricité","Plomberie"] },
  ],
  tasks: [
    { id:"t1",chantierId:"ch1",titre:"Vérifier tirage câbles RJ45 - Niv.2",priorite:"Urgent",statut:"En cours",echeance:"2026-03-18",lot:"Électricité" },
    { id:"t2",chantierId:"ch1",titre:"Réception menuiseries alu",priorite:"En cours",statut:"Planifié",echeance:"2026-03-22",lot:"Menuiserie" },
    { id:"t3",chantierId:"ch3",titre:"Contrôle peinture T2 apt 4B",priorite:"En cours",statut:"En cours",echeance:"2026-03-19",lot:"Peinture" },
    { id:"t4",chantierId:"ch2",titre:"Validation plans structure - Phase EXE",priorite:"Urgent",statut:"En cours",echeance:"2026-03-17",lot:"Structure métallique" },
    { id:"t5",chantierId:"ch3",titre:"Pose revêtements sols RDC",priorite:"En cours",statut:"Planifié",echeance:"2026-03-25",lot:"Revêtements sols" },
    { id:"t6",chantierId:"ch6",titre:"Finaliser dossier PC modificatif",priorite:"Urgent",statut:"En cours",echeance:"2026-03-19",lot:"Administratif" },
    { id:"t7",chantierId:"ch6",titre:"Dépôt PC modificatif mairie Riville",priorite:"Urgent",statut:"Planifié",echeance:"2026-03-20",lot:"Administratif" },
  ],
  rdv: [
    { id:"r1",chantierId:"ch1",titre:"Réunion de chantier hebdo",date:"2026-03-17",heure:"09:00",lieu:"Sur site",participants:["Lefèvre","Costa"] },
    { id:"r2",chantierId:"ch2",titre:"Visite MOA",date:"2026-03-18",heure:"14:00",lieu:"Bureau",participants:["HAROPA"] },
  ],
  contacts: [
    { id:"c1",nom:"Lefèvre Électricité",type:"Artisan",specialite:"Électricité CFO/CFA",tel:"06 12 34 56 78",email:"lefevre.elec@mail.fr",chantiers:["ch1","ch2"] },
    { id:"c2",nom:"Costa Plomberie",type:"Artisan",specialite:"Plomberie / CVC",tel:"06 23 45 67 89",email:"costa.plomb@mail.fr",chantiers:["ch1"] },
    { id:"c3",nom:"Normandie Peinture",type:"Artisan",specialite:"Peinture / Ravalement",tel:"06 34 56 78 90",email:"norm.peinture@mail.fr",chantiers:["ch3","ch4"] },
    { id:"c4",nom:"HAROPA",type:"Client",specialite:"Maîtrise d'ouvrage",tel:"02 35 xx xx xx",email:"projets@haropa.fr",chantiers:["ch2"] },
    { id:"c5",nom:"SCI Maritime",type:"Client",specialite:"Promotion immobilière",tel:"02 35 xx xx xx",email:"contact@sci-maritime.fr",chantiers:["ch1"] },
    { id:"c6",nom:"M. Durand",type:"Client",specialite:"Particulier",tel:"06 45 67 89 01",email:"durand@mail.fr",chantiers:["ch3"] },
    { id:"c7",nom:"Point P Le Havre",type:"Fournisseur",specialite:"Matériaux gros œuvre",tel:"02 35 xx xx xx",email:"lehavre@pointp.fr",chantiers:["ch1","ch2","ch4"] },
    { id:"c8",nom:"Rexel Normandie",type:"Fournisseur",specialite:"Matériel électrique",tel:"02 35 xx xx xx",email:"normandie@rexel.fr",chantiers:["ch1","ch2"] },
    { id:"c9",nom:"Atelier Bois Normand",type:"Artisan",specialite:"Menuiserie bois/alu",tel:"06 56 78 90 12",email:"atelierbois@mail.fr",chantiers:["ch1","ch3"] },
    { id:"c10",nom:"Famille Friboulet",type:"Client",specialite:"Particulier",tel:"06 78 90 12 34",email:"friboulet@mail.fr",chantiers:["ch6"] },
    { id:"c11",nom:"Eurofins Laboratoire",type:"Fournisseur",specialite:"Analyses / Contrôle",tel:"02 35 xx xx xx",email:"contact@eurofins.fr",chantiers:["ch5","ch6"] },
    { id:"c12",nom:"Maryam (Architecte)",type:"Artisan",specialite:"Architecture",tel:"06 89 01 23 45",email:"maryam.archi@mail.fr",chantiers:["ch6"] },
  ],
  compteRendus: [
    { id:"cr1",chantierId:"ch1",date:"2026-03-10",numero:12,resume:"Avancement gros œuvre 85%. Retard électricité niveau 2.",participants:"Lefèvre, Costa",decisions:"Relance Lefèvre tirage câbles avant 18/03." },
  ],
  planning: [
    { id:"p1",chantierId:"ch1",lot:"Électricité",tache:"Tirage câbles Niv.2",debut:"2026-03-10",fin:"2026-03-21",avancement:40 },
    { id:"p2",chantierId:"ch1",lot:"Menuiserie",tache:"Pose menuiseries alu",debut:"2026-03-22",fin:"2026-04-05",avancement:0 },
    { id:"p3",chantierId:"ch2",lot:"Structure",tache:"Montage charpente zone B",debut:"2026-03-01",fin:"2026-04-15",avancement:55 },
    { id:"p4",chantierId:"ch3",lot:"Peinture",tache:"Finitions apt 4B",debut:"2026-03-10",fin:"2026-03-20",avancement:70 },
    { id:"p5",chantierId:"ch6",lot:"Gros œuvre",tache:"Fondations + Élévation",debut:"2026-01-15",fin:"2026-04-30",avancement:35 },
    { id:"p6",chantierId:"ch5",lot:"Maçonnerie",tache:"Murs garage",debut:"2026-02-01",fin:"2026-03-30",avancement:60 },
  ],
};

const uid = () => Math.random().toString(36).slice(2, 9);
const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"short"}) : "—";
const fmtMoney = n => new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n);
const pct = (a,b) => b ? Math.round(a/b*100) : 0;
const fmtTime = s => new Date(s).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
const fmtDayFr = s => new Date(s).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"});

// ─── SHARED COMPONENTS ───
function Modal({open,onClose,title,children,wide}) {
  if (!open) return null;
  return (<div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",backdropFilter:"blur(4px)",padding:16}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:"20px",width:wide?700:520,maxWidth:"100%",maxHeight:"85vh",overflow:"auto",boxShadow:"0 25px 50px rgba(0,0,0,0.25)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:17,fontWeight:700,color:"#0F172A"}}>{title}</h3>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon d={I.x} size={20} color="#94A3B8"/></button>
      </div>
      {children}
    </div>
  </div>);
}

function FF({label,children}) {
  return <div style={{marginBottom:12}}><label style={{display:"block",fontSize:11,fontWeight:600,color:"#64748B",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</label>{children}</div>;
}
const inp = {width:"100%",padding:"8px 12px",border:"1.5px solid #E2E8F0",borderRadius:8,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"};
const sel = {...inp,background:"#fff"};
const btnP = {padding:"10px 18px",background:"#1E3A5F",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"};
const btnS = {...btnP,background:"#F1F5F9",color:"#475569"};

function PBar({value,max=100,color="#3B82F6",h=8}) {
  return <div style={{background:"#F1F5F9",borderRadius:h,height:h,overflow:"hidden",width:"100%"}}><div style={{width:`${Math.min(Math.round(value/max*100),100)}%`,height:"100%",background:color,borderRadius:h,transition:"width .5s"}}/></div>;
}

function Badge({text,color}) {
  return <span style={{display:"inline-block",padding:"2px 8px",borderRadius:16,fontSize:10,fontWeight:700,background:color+"18",color,whiteSpace:"nowrap"}}>{text}</span>;
}

function ApiBadge() {
  return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,background:GC.gradient,color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.1em"}}>API</span>;
}

// ═══════════════════════════════════════════
// FLOATING NEON MIC BUTTON (4-branch cross, heartbeat, neon glow)
// ═══════════════════════════════════════════
function FloatingMic({ listening, onClick, transcript, onSend, onClear, isMobile }) {
  return (<>
    {/* FLOATING BUTTON — fixed bottom-right */}
    <div style={{
      position: "fixed", bottom: isMobile ? 24 : 32, right: isMobile ? 24 : 32, zIndex: 1100,
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10,
    }}>
      {/* Transcript bubble when listening */}
      {listening && transcript && (
        <div style={{
          background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)",
          borderRadius: 16, padding: "12px 16px", maxWidth: isMobile ? 260 : 340,
          color: "#fff", fontSize: 13, lineHeight: 1.5,
          border: "1px solid rgba(0,255,136,0.25)",
          boxShadow: "0 0 20px rgba(0,255,136,0.15), 0 8px 32px rgba(0,0,0,0.3)",
          animation: "fadeIn .2s ease",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#00FF88", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00FF88", animation: "neonPulse 1s infinite" }} />
            Transcription en direct
          </div>
          <div>{transcript}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={onSend} style={{ padding: "5px 12px", borderRadius: 8, background: "#00FF88", color: "#0F172A", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Envoyer à l'IA</button>
            <button onClick={onClear} style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(255,255,255,0.1)", color: "#94A3B8", border: "1px solid rgba(255,255,255,0.15)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Effacer</button>
          </div>
        </div>
      )}

      {/* The neon mic button */}
      <button onClick={onClick} style={{
        position: "relative", width: 64, height: 64, borderRadius: "50%",
        background: listening
          ? "radial-gradient(circle at 40% 40%, #ff2d2d 0%, #cc0000 60%, #990000 100%)"
          : "radial-gradient(circle at 40% 40%, #1E3A5F 0%, #0F172A 70%)",
        border: listening ? "2px solid rgba(255,50,50,0.6)" : "2px solid rgba(0,255,136,0.3)",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: listening
          ? "0 0 15px rgba(255,50,50,0.6), 0 0 40px rgba(255,50,50,0.3), 0 0 80px rgba(255,50,50,0.15), inset 0 0 15px rgba(255,100,100,0.2)"
          : "0 0 12px rgba(0,255,136,0.3), 0 0 30px rgba(0,255,136,0.15), 0 0 60px rgba(0,255,136,0.07), inset 0 0 10px rgba(0,255,136,0.08)",
        transition: "all .4s cubic-bezier(0.4,0,0.2,1)",
        animation: listening ? "none" : "neonBreathing 3s ease-in-out infinite",
      }}>
        {/* 4-branch cross SVG with heartbeat */}
        <svg width="30" height="30" viewBox="0 0 30 30" style={{ animation: listening ? "heartbeat 0.8s ease-in-out infinite" : "none", filter: listening ? "drop-shadow(0 0 4px rgba(255,200,200,0.8))" : "drop-shadow(0 0 3px rgba(0,255,136,0.6))" }}>
          {/* Top branch */}
          <rect x="12.5" y="1" width="5" height="11" rx="2.5" fill={listening ? "#fff" : "#00FF88"}>
            {listening && <animate attributeName="height" values="11;14;11;9;11" dur="0.8s" repeatCount="indefinite" />}
            {listening && <animate attributeName="y" values="1;-1;1;2;1" dur="0.8s" repeatCount="indefinite" />}
          </rect>
          {/* Right branch */}
          <rect x="18" y="12.5" width="11" height="5" rx="2.5" fill={listening ? "#fff" : "#00FF88"}>
            {listening && <animate attributeName="width" values="11;14;11;9;11" dur="0.8s" repeatCount="indefinite" begin="0.1s" />}
          </rect>
          {/* Bottom branch */}
          <rect x="12.5" y="18" width="5" height="11" rx="2.5" fill={listening ? "#fff" : "#00FF88"}>
            {listening && <animate attributeName="height" values="11;14;11;9;11" dur="0.8s" repeatCount="indefinite" begin="0.2s" />}
          </rect>
          {/* Left branch */}
          <rect x="1" y="12.5" width="11" height="5" rx="2.5" fill={listening ? "#fff" : "#00FF88"}>
            {listening && <animate attributeName="width" values="11;14;11;9;11" dur="0.8s" repeatCount="indefinite" begin="0.3s" />}
          </rect>
          {/* Center circle */}
          <circle cx="15" cy="15" r="4" fill={listening ? "#fff" : "#00FF88"} opacity="0.95">
            {listening && <animate attributeName="r" values="4;5;4;3.5;4" dur="0.8s" repeatCount="indefinite" />}
          </circle>
        </svg>

        {/* Neon glow rings */}
        <span style={{
          position: "absolute", inset: -3, borderRadius: "50%",
          border: `2px solid ${listening ? "rgba(255,80,80,0.5)" : "rgba(0,255,136,0.35)"}`,
          animation: listening ? "ripple 1.2s ease-out infinite" : "neonRing 3s ease-in-out infinite",
        }} />
        <span style={{
          position: "absolute", inset: -8, borderRadius: "50%",
          border: `1.5px solid ${listening ? "rgba(255,80,80,0.25)" : "rgba(0,255,136,0.15)"}`,
          animation: listening ? "ripple 1.2s ease-out infinite 0.25s" : "neonRing 3s ease-in-out infinite 1s",
        }} />
        {listening && <span style={{
          position: "absolute", inset: -14, borderRadius: "50%",
          border: "1px solid rgba(255,80,80,0.12)",
          animation: "ripple 1.2s ease-out infinite 0.5s",
        }} />}
      </button>
    </div>
  </>);
}

// Small inline MicButton for the AI chat input row
function MicButtonInline({ listening, onClick }) {
  return (
    <button onClick={onClick} style={{
      position: "relative", width: 44, height: 44, borderRadius: "50%",
      background: listening ? "linear-gradient(135deg, #EF4444, #DC2626)" : "linear-gradient(135deg, #1E3A5F, #3B82F6)",
      border: listening ? "2px solid rgba(255,80,80,0.4)" : "2px solid rgba(0,255,136,0.2)",
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: listening ? "0 0 12px rgba(239,68,68,0.5)" : "0 0 8px rgba(0,255,136,0.2)",
      transition: "all .3s", flexShrink: 0,
    }}>
      <svg width="22" height="22" viewBox="0 0 30 30" style={{ animation: listening ? "heartbeat 0.8s ease-in-out infinite" : "none" }}>
        <rect x="12.5" y="2" width="5" height="10" rx="2.5" fill="#fff" opacity={listening?1:0.9}>
          {listening && <animate attributeName="height" values="10;13;10;8;10" dur="0.8s" repeatCount="indefinite" />}
        </rect>
        <rect x="18" y="12.5" width="10" height="5" rx="2.5" fill="#fff" opacity={listening?1:0.9}>
          {listening && <animate attributeName="width" values="10;13;10;8;10" dur="0.8s" repeatCount="indefinite" begin="0.1s" />}
        </rect>
        <rect x="12.5" y="18" width="5" height="10" rx="2.5" fill="#fff" opacity={listening?1:0.9}>
          {listening && <animate attributeName="height" values="10;13;10;8;10" dur="0.8s" repeatCount="indefinite" begin="0.2s" />}
        </rect>
        <rect x="2" y="12.5" width="10" height="5" rx="2.5" fill="#fff" opacity={listening?1:0.9}>
          {listening && <animate attributeName="width" values="10;13;10;8;10" dur="0.8s" repeatCount="indefinite" begin="0.3s" />}
        </rect>
        <circle cx="15" cy="15" r="3.5" fill="#fff" opacity="0.95">
          {listening && <animate attributeName="r" values="3.5;4.5;3.5;3;3.5" dur="0.8s" repeatCount="indefinite" />}
        </circle>
      </svg>
    </button>
  );
}

// ═══════════════════════════════════════════
// MAIN APP (Responsive)
// ═══════════════════════════════════════════
export default function App() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Floating mic state
  const [floatListening, setFloatListening] = useState(false);
  const [floatTranscript, setFloatTranscript] = useState("");
  const floatRecogRef = useRef(null);

  const toggleFloatMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Reconnaissance vocale non supportée. Utilisez Chrome ou Safari."); return; }
    if (floatListening && floatRecogRef.current) {
      floatRecogRef.current.stop(); setFloatListening(false); return;
    }
    const r = new SR(); r.lang = "fr-FR"; r.continuous = true; r.interimResults = true;
    floatRecogRef.current = r; let final = "";
    r.onstart = () => { setFloatListening(true); setFloatTranscript(""); };
    r.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript + " ";
        else interim = ev.results[i][0].transcript;
      }
      setFloatTranscript(final + interim);
    };
    r.onerror = () => setFloatListening(false);
    r.onend = () => { setFloatListening(false); if (final.trim()) setFloatTranscript(final.trim()); };
    r.start();
  }, [floatListening]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check); return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Test Supabase connection
        const { data: testData, error: testError } = await supabase.from('chantiers').select('id').limit(1);
        
        if (testError) {
          console.error("❌ Supabase connection error:", testError.message);
          console.log("Fallback sur données locales");
          setData(defaultData);
          setLoading(false);
          return;
        }

        console.log("✅ Supabase connecté");

        // Load all data
        const sbData = await SB.loadAll();
        const hasData = sbData.chantiers.length > 0;

        if (hasData) {
          console.log(`✅ Données Supabase chargées: ${sbData.chantiers.length} chantiers, ${sbData.contacts.length} contacts, ${sbData.tasks.length} tâches`);
          setData(sbData);
        } else {
          console.log("📦 Base vide — insertion des données initiales...");
          
          // Seed chantiers
          const chantierRows = defaultData.chantiers.map(({ id, dateDebut, dateFin, ...rest }) => ({
            ...rest, date_debut: dateDebut || null, date_fin: dateFin || null
          }));
          const { data: insertedCh, error: errCh } = await supabase.from('chantiers').insert(chantierRows).select();
          if (errCh) console.error("❌ Erreur insert chantiers:", errCh.message);
          else console.log(`✅ ${insertedCh.length} chantiers insérés`);

          // Seed contacts
          const contactRows = defaultData.contacts.map(({ id, chantiers, ...rest }) => rest);
          const { data: insertedCo, error: errCo } = await supabase.from('contacts').insert(contactRows).select();
          if (errCo) console.error("❌ Erreur insert contacts:", errCo.message);
          else console.log(`✅ ${insertedCo.length} contacts insérés`);

          // Build name→UUID map for linking tasks
          const chMap = {};
          if (insertedCh) {
            defaultData.chantiers.forEach((defCh, i) => {
              if (insertedCh[i]) chMap[defCh.id] = insertedCh[i].id;
            });
          }

          // Seed tasks
          const taskRows = defaultData.tasks.map(({ id, chantierId, ...rest }) => ({
            ...rest, chantier_id: chMap[chantierId] || null
          })).filter(t => t.chantier_id);
          if (taskRows.length > 0) {
            const { error: errTa } = await supabase.from('taches').insert(taskRows);
            if (errTa) console.error("❌ Erreur insert tâches:", errTa.message);
            else console.log(`✅ ${taskRows.length} tâches insérées`);
          }

          // Seed CRs
          if (defaultData.compteRendus) {
            const crRows = defaultData.compteRendus.map(({ id, chantierId, ...rest }) => ({
              ...rest, chantier_id: chMap[chantierId] || null
            })).filter(c => c.chantier_id);
            if (crRows.length > 0) {
              const { error: errCr } = await supabase.from('compte_rendus').insert(crRows);
              if (errCr) console.error("❌ Erreur insert CR:", errCr.message);
              else console.log(`✅ ${crRows.length} CR insérés`);
            }
          }

          // Reload fresh from Supabase
          const freshData = await SB.loadAll();
          console.log(`✅ Reload: ${freshData.chantiers.length} chantiers depuis Supabase`);
          setData(freshData.chantiers.length > 0 ? freshData : defaultData);
        }
      } catch (e) {
        console.error("❌ Erreur globale:", e);
        setData(defaultData);
      }
      setLoading(false);
    })();
  }, []);

  // Reload data from Supabase
  const reload = useCallback(async () => {
    try {
      const sbData = await SB.loadAll();
      console.log(`🔄 Reload: ${sbData.chantiers.length} chantiers, ${sbData.tasks.length} tâches`);
      setData(sbData);
    } catch (e) {
      console.error("Reload error:", e);
    }
  }, []);

  // Legacy save
  const save = useCallback(async (d) => { setData(d); }, []);

  if (loading || !data) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:48,height:48,border:"4px solid #E2E8F0",borderTopColor:"#1E3A5F",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
    </div>
  );

  const tabs = [
    {key:"dashboard",label:"Tableau de bord",icon:I.dashboard},
    {key:"projects",label:"Chantiers",icon:I.projects},
    {key:"os",label:"Ordres de Service",icon:I.reports},
    {key:"reports",label:"Comptes Rendus",icon:I.reports},
    {key:"tasks",label:"Tâches",icon:I.tasks},
    {key:"planning",label:"Planning",icon:I.planning},
    {key:"budget",label:"Budget",icon:I.budget},
    {key:"contacts",label:"Annuaire",icon:I.contacts},
    {key:"qonto",label:"Qonto",icon:null,isQonto:true},
    {key:"gcal",label:"Agenda Google",icon:null,isGcal:true},
    {key:"ai",label:"Assistant IA",icon:I.ai},
  ];

  const switchTab = (k) => { setTab(k); if (isMobile) setSidebarOpen(false); };

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',sans-serif",background:"#F1F5F9",overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes heartbeat{0%,100%{transform:scale(1)}15%{transform:scale(1.18)}30%{transform:scale(1)}45%{transform:scale(1.12)}60%{transform:scale(1)}}
        @keyframes ripple{0%{transform:scale(1);opacity:1}100%{transform:scale(1.8);opacity:0}}
        @keyframes neonBreathing{0%,100%{box-shadow:0 0 12px rgba(0,255,136,0.3),0 0 30px rgba(0,255,136,0.15),0 0 60px rgba(0,255,136,0.07);border-color:rgba(0,255,136,0.3)}50%{box-shadow:0 0 18px rgba(0,255,136,0.5),0 0 45px rgba(0,255,136,0.25),0 0 90px rgba(0,255,136,0.12);border-color:rgba(0,255,136,0.5)}}
        @keyframes neonRing{0%,100%{opacity:0.4;transform:scale(1)}50%{opacity:0.8;transform:scale(1.05)}}
        @keyframes neonPulse{0%,100%{opacity:1;box-shadow:0 0 3px #00FF88}50%{opacity:0.5;box-shadow:0 0 8px #00FF88}}
        @keyframes pulse{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(234,67,53,0.3)}50%{box-shadow:0 0 0 6px rgba(234,67,53,0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:3px}
        input:focus,select:focus,textarea:focus{border-color:#3B82F6!important;outline:none}
      `}</style>

      {/* MOBILE OVERLAY */}
      {isMobile && sidebarOpen && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:998}} onClick={()=>setSidebarOpen(false)} />}

      {/* SIDEBAR */}
      <nav style={{
        width:isMobile?260:240,position:isMobile?"fixed":"relative",left:isMobile?(sidebarOpen?0:-280):0,top:0,bottom:0,
        background:"linear-gradient(195deg,#0F172A,#1E3A5F)",color:"#fff",display:"flex",flexDirection:"column",flexShrink:0,
        zIndex:999,transition:"left .3s ease",boxShadow:isMobile&&sidebarOpen?"4px 0 20px rgba(0,0,0,0.3)":"none"
      }}>
        <div style={{padding:"20px 16px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{fontSize:18,fontWeight:700}}>ID MAÎTRISE</div>
          <div style={{fontSize:10,color:"#94A3B8",marginTop:2,letterSpacing:"0.05em"}}>MAÎTRISE D'ŒUVRE • LE HAVRE</div>
        </div>
        <div style={{flex:1,padding:"10px 8px",display:"flex",flexDirection:"column",gap:2,overflow:"auto"}}>
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>switchTab(t.key)} style={{
              display:"flex",alignItems:"center",gap:9,padding:"9px 11px",border:"none",borderRadius:7,cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:tab===t.key?600:400,
              color:tab===t.key?(t.isGcal?"#FCA5A5":t.isQonto?"#C4B5FD":"#fff"):(t.isGcal?"#F87171":t.isQonto?"#A78BFA":"#94A3B8"),
              background:tab===t.key?(t.isGcal?"rgba(234,67,53,0.15)":t.isQonto?"rgba(124,58,237,0.15)":"rgba(255,255,255,0.12)"):"transparent",
              transition:"all .2s",textAlign:"left",width:"100%",
              borderLeft:t.isGcal&&tab===t.key?"3px solid #EA4335":t.isQonto&&tab===t.key?"3px solid #7C3AED":"3px solid transparent",
            }}>
              {t.isGcal ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#EA4335" strokeWidth="2"/><path d="M3 10h18" stroke="#EA4335" strokeWidth="2"/><path d="M8 2v4M16 2v4" stroke="#EA4335" strokeWidth="2" strokeLinecap="round"/></svg>
                : t.isQonto ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#7C3AED" strokeWidth="2"/><path d="M15 15l3 3" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/><path d="M9 12l2 2 4-4" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <Icon d={t.icon} size={16} color={tab===t.key?"#60A5FA":"#64748B"}/>}
              <span style={{flex:1}}>{t.label}</span>
              {t.isGcal && <ApiBadge/>}
              {t.isQonto && <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,background:"linear-gradient(135deg,#7C3AED,#A855F7)",color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.1em"}}>API</span>}
            </button>
          ))}
        </div>
        <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,0.08)",fontSize:10,color:"#64748B"}}>
          SARL ID MAITRISE<br/>9 Rue Henry Genestal, 76600 Le Havre
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main style={{flex:1,overflow:"auto",padding:isMobile?16:24,paddingTop:isMobile?60:24}}>
        {/* MOBILE HEADER */}
        {isMobile && (
          <div style={{position:"fixed",top:0,left:0,right:0,height:52,background:"#fff",borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",padding:"0 16px",zIndex:997,gap:12}}>
            <button onClick={()=>setSidebarOpen(true)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon d={I.menu} size={22} color="#0F172A"/></button>
            <span style={{fontSize:15,fontWeight:700,color:"#0F172A"}}>ID Maîtrise</span>
            <span style={{fontSize:11,color:"#94A3B8",marginLeft:"auto"}}>{tabs.find(t=>t.key===tab)?.label}</span>
          </div>
        )}
        <div style={{animation:"fadeIn .3s ease",maxWidth:1200}}>
          {tab==="dashboard"&&<DashboardV data={data} setTab={switchTab} m={isMobile}/>}
          {tab==="gcal"&&<GCalV m={isMobile}/>}
          {tab==="qonto"&&<QontoV m={isMobile}/>}
          {tab==="projects"&&<ProjectsV data={data} save={save} m={isMobile} reload={reload}/>}
          {tab==="planning"&&<PlanningV data={data} m={isMobile}/>}
          {tab==="budget"&&<BudgetV data={data} m={isMobile}/>}
          {tab==="tasks"&&<TasksV data={data} save={save} m={isMobile} reload={reload}/>}
          {tab==="contacts"&&<ContactsV data={data} save={save} m={isMobile} reload={reload}/>}
          {tab==="reports"&&<ReportsV data={data} save={save} m={isMobile} reload={reload}/>}
          {tab==="os"&&<OrdresServiceV data={data} m={isMobile} reload={reload}/>}
          {tab==="ai"&&<AIV data={data} save={save} m={isMobile} externalTranscript={floatTranscript} clearExternal={()=>setFloatTranscript("")} reload={reload}/>}
        </div>
      </main>

      {/* FLOATING NEON MIC — visible on ALL tabs */}
      {tab !== "ai" && (
        <FloatingMic
          listening={floatListening}
          onClick={toggleFloatMic}
          transcript={floatTranscript}
          isMobile={isMobile}
          onSend={() => { setTab("ai"); /* transcript will be picked up by AIV */ }}
          onClear={() => { setFloatTranscript(""); if (floatListening && floatRecogRef.current) { floatRecogRef.current.stop(); setFloatListening(false); } }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
function DashboardV({data,setTab,m}) {
  const today = new Date().toISOString().split("T")[0];
  const todayGcal = gcalEvents.filter(e=>e.start.split("T")[0]===today);
  const urgent = data.tasks.filter(t=>t.priorite==="Urgent"&&t.statut!=="Terminé");
  const enCours = data.chantiers.filter(c=>c.statut==="En cours");
  const totalB = data.chantiers.reduce((s,c)=>s+c.budget,0);
  const totalD = data.chantiers.reduce((s,c)=>s+c.depenses,0);
  const Card = ({children,style:s}) => <div style={{background:"#fff",borderRadius:12,padding:m?14:20,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",...s}}>{children}</div>;

  return (<div>
    <h1 style={{margin:0,fontSize:m?20:26,fontWeight:700,color:"#0F172A"}}>Bonjour Dursun</h1>
    <p style={{margin:"4px 0 20px",color:"#64748B",fontSize:m?12:14}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})} — {enCours.length} chantiers actifs</p>

    <div style={{display:"grid",gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",gap:m?10:16,marginBottom:20}}>
      {[{l:"Chantiers",v:enCours.length,c:"#3B82F6"},{l:"Tâches",v:data.tasks.filter(t=>t.statut!=="Terminé").length,c:"#8B5CF6"},{l:"Budget",v:fmtMoney(totalB),c:"#10B981"},{l:"Dépensé",v:pct(totalD,totalB)+"%",c:"#F59E0B"}].map((k,i)=>(
        <Card key={i}><div style={{fontSize:10,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",marginBottom:4}}>{k.l}</div><div style={{fontSize:m?20:28,fontWeight:700,color:k.c}}>{k.v}</div></Card>
      ))}
    </div>

    <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:16}}>
      {/* GCAL */}
      <Card style={{borderTop:`3px solid ${GC.primary}`,background:GC.light}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:700,fontSize:15}}>Agenda</span><ApiBadge/></div>
          <button onClick={()=>setTab("gcal")} style={{fontSize:11,color:GC.primary,background:"none",border:"none",cursor:"pointer",fontWeight:600}}>→</button>
        </div>
        {todayGcal.length===0?<p style={{color:"#94A3B8",fontSize:12}}>Aucun RDV GCal aujourd'hui</p>:todayGcal.map(ev=>(
          <div key={ev.id} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:`1px solid ${GC.border}`}}>
            <span style={{background:GC.primary,borderRadius:6,padding:"4px 8px",fontSize:12,fontWeight:700,color:"#fff",whiteSpace:"nowrap"}}>{fmtTime(ev.start)}</span>
            <div><div style={{fontSize:13,fontWeight:600,color:"#0F172A"}}>{ev.summary}</div>{ev.location&&<div style={{fontSize:11,color:"#64748B"}}>{ev.location}</div>}</div>
          </div>
        ))}
        {gcalEvents.filter(e=>e.start.split("T")[0]>today).slice(0,2).map(ev=>(
          <div key={ev.id} style={{display:"flex",gap:8,padding:"6px 0",opacity:.6}}>
            <span style={{fontSize:10,fontWeight:600,color:"#94A3B8",whiteSpace:"nowrap"}}>{fmtDayFr(ev.start)}</span>
            <span style={{fontSize:12,color:"#64748B"}}>{ev.summary}</span>
          </div>
        ))}
      </Card>

      {/* URGENT */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontWeight:700,fontSize:15}}>Tâches urgentes</span>
          <button onClick={()=>setTab("tasks")} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>→</button>
        </div>
        {urgent.length===0?<p style={{color:"#94A3B8",fontSize:12}}>RAS</p>:urgent.map(t=>{const ch=data.chantiers.find(c=>c.id===t.chantierId);return(
          <div key={t.id} style={{padding:"8px 0",borderBottom:"1px solid #F1F5F9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontSize:12,fontWeight:600,color:"#0F172A"}}>{t.titre}</div><div style={{fontSize:10,color:"#94A3B8"}}>{ch?.nom}</div></div>
            <Badge text={fmtDate(t.echeance)} color="#EF4444"/>
          </div>
        );})}
      </Card>

      {/* CHANTIERS */}
      <Card style={{gridColumn:m?"1":"1/-1"}}>
        <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700}}>Chantiers actifs</h3>
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"repeat(3,1fr)",gap:12}}>
          {enCours.map(ch=>(
            <div key={ch.id} style={{border:`1.5px solid ${phase[ch.phase]||"#E2E8F0"}`,borderRadius:10,padding:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontWeight:700,fontSize:12,color:"#0F172A"}}>{ch.nom}</span>
                <Badge text={ch.phase} color={phase[ch.phase]||"#64748B"}/>
              </div>
              <div style={{fontSize:10,color:"#64748B",marginBottom:6}}>{ch.client}</div>
              <PBar value={ch.depenses} max={ch.budget} color={phase[ch.phase]||"#3B82F6"}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:9,color:"#94A3B8"}}><span>{fmtMoney(ch.depenses)}</span><span>{pct(ch.depenses,ch.budget)}%</span></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </div>);
}

// ═══════════════════════════════════════════
// GOOGLE CALENDAR VIEW
// ═══════════════════════════════════════════
function GCalV({m}) {
  const today = new Date().toISOString().split("T")[0];
  const byDay = {}; gcalEvents.forEach(e=>{const d=e.start.split("T")[0];(byDay[d]=byDay[d]||[]).push(e);});

  return (<div>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
      <div style={{width:40,height:40,borderRadius:10,background:GC.gradient,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 3px 10px rgba(234,67,53,0.3)"}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#fff" strokeWidth="2"/><path d="M3 10h18" stroke="#fff" strokeWidth="2"/></svg>
      </div>
      <div><h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Google Calendar <ApiBadge/></h1><p style={{margin:0,fontSize:12,color:"#64748B"}}>Suivi Pro ID MAITRISE</p></div>
    </div>

    <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:8,fontSize:12}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:"#22C55E",animation:"pulseGlow 2s infinite"}}/><span style={{fontWeight:600,color:"#166534"}}>Connecté</span><span style={{color:"#64748B"}}>• dursunozkan88@gmail.com</span>
    </div>

    <div style={{background:"#fff",borderRadius:14,padding:m?14:20,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:`1px solid ${GC.border}`}}>
      {Object.keys(byDay).sort().map(day=>{const isT=day===today; return(
        <div key={day} style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{background:isT?GC.primary:"#F1F5F9",color:isT?"#fff":"#64748B",borderRadius:8,padding:"4px 12px",fontSize:12,fontWeight:700}}>{fmtDayFr(day+"T00:00:00")}{isT?" • Aujourd'hui":""}</span>
            <div style={{flex:1,height:1,background:isT?GC.border:"#F1F5F9"}}/>
          </div>
          {byDay[day].map(ev=>(
            <div key={ev.id} style={{display:"flex",gap:12,padding:"10px 12px",marginBottom:6,borderRadius:10,background:isT?GC.light:"#FAFAFA",border:`1.5px solid ${isT?GC.border:"#F1F5F9"}`}}>
              <div style={{minWidth:55,textAlign:"center"}}><div style={{fontSize:14,fontWeight:700,color:GC.primary}}>{fmtTime(ev.start)}</div><div style={{fontSize:10,color:"#94A3B8"}}>{fmtTime(ev.end)}</div></div>
              <div style={{width:3,borderRadius:3,background:GC.gradient,flexShrink:0}}/>
              <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}><span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{ev.summary}</span><ApiBadge/></div>
                {ev.description&&<div style={{fontSize:11,color:"#64748B",marginBottom:2}}>{ev.description}</div>}
                {ev.location&&<div style={{fontSize:11,color:"#94A3B8",display:"flex",alignItems:"center",gap:3}}><Icon d={I.mappin} size={10} color="#94A3B8"/>{ev.location}</div>}
              </div>
            </div>
          ))}
        </div>
      );})}
    </div>
  </div>);
}

// ═══════════════════════════════════════════
// QONTO VIEW (Factures, Devis, Clients)
// ═══════════════════════════════════════════
const QT = { primary:"#7C3AED", light:"#F5F3FF", border:"#DDD6FE", gradient:"linear-gradient(135deg,#7C3AED,#A855F7,#C084FC)" };

function QontoBadge() {
  return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,background:QT.gradient,color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.1em"}}>API</span>;
}

function QontoV({m}) {
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [activeTab, setActiveTab] = useState("factures");
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [qLoading, setQLoading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  // Load saved token
  useEffect(() => {
    (async () => {
      const t = LocalDB.get("qonto-token");
      if (t) { setSavedToken(t); setToken(t); }
    })();
  }, []);

  const saveToken = async () => {
    if (!token.trim()) return;
    LocalDB.set("qonto-token", token.trim());
    setSavedToken(token.trim());
    fetchAll(token.trim());
  };

  const disconnect = async () => {
    LocalDB.set("qonto-token", "");
    setSavedToken(""); setToken(""); setConnected(false);
    setInvoices([]); setQuotes([]); setClients([]);
  };

  const fetchQonto = async (endpoint, tk) => {
    const res = await fetch(`https://thirdparty.qonto.com/v2/${endpoint}`, {
      headers: { "Authorization": `Bearer ${tk}` }
    });
    if (!res.ok) throw new Error(`Qonto API ${res.status}: ${res.statusText}`);
    return res.json();
  };

  const fetchAll = async (tk) => {
    setQLoading(true); setError("");
    try {
      const [invData, quoData, cliData] = await Promise.all([
        fetchQonto("client_invoices?exclude_imports=false", tk),
        fetchQonto("quotes", tk),
        fetchQonto("clients", tk),
      ]);
      setInvoices(invData.client_invoices || []);
      setQuotes(quoData.quotes || []);
      setClients(cliData.clients || []);
      setConnected(true);
    } catch (e) {
      setError(e.message || "Erreur de connexion à Qonto");
      setConnected(false);
    }
    setQLoading(false);
  };

  useEffect(() => { if (savedToken) fetchAll(savedToken); }, [savedToken]);

  const invStatusColor = { draft:"#94A3B8", finalized:"#3B82F6", sent:"#8B5CF6", paid:"#10B981", canceled:"#EF4444", unpaid:"#F59E0B", pending:"#F59E0B" };
  const invStatusFr = { draft:"Brouillon", finalized:"Finalisée", sent:"Envoyée", paid:"Payée", canceled:"Annulée", unpaid:"Impayée", pending:"En attente" };
  const quoStatusColor = { pending_approval:"#F59E0B", approved:"#10B981", canceled:"#EF4444", draft:"#94A3B8" };
  const quoStatusFr = { pending_approval:"En attente", approved:"Approuvé", canceled:"Annulé", draft:"Brouillon" };

  const totalInvoices = invoices.reduce((s,i) => s + (i.total_amount_cents||0), 0) / 100;
  const paidInvoices = invoices.filter(i => i.status==="paid");
  const unpaidInvoices = invoices.filter(i => ["sent","finalized","unpaid","pending"].includes(i.status));
  const totalPaid = paidInvoices.reduce((s,i) => s + (i.total_amount_cents||0), 0) / 100;
  const totalUnpaid = unpaidInvoices.reduce((s,i) => s + (i.total_amount_cents||0), 0) / 100;

  return (<div>
    {/* HEADER */}
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      <div style={{width:44,height:44,borderRadius:12,background:QT.gradient,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 14px rgba(124,58,237,0.3)"}}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2"/><path d="M15 15l3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <div style={{flex:1}}>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Qonto <QontoBadge/></h1>
        <p style={{margin:0,fontSize:12,color:"#64748B"}}>Factures, Devis & Clients — API Qonto v2</p>
      </div>
      {connected && <a href="https://app.qonto.com" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",borderRadius:8,background:QT.primary,color:"#fff",textDecoration:"none",fontSize:12,fontWeight:600}}>Ouvrir Qonto</a>}
    </div>

    {/* TOKEN CONFIG */}
    {!savedToken ? (
      <div style={{background:"#fff",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:`2px dashed ${QT.border}`,textAlign:"center",maxWidth:500,margin:"40px auto"}}>
        <div style={{width:60,height:60,borderRadius:"50%",background:QT.light,margin:"0 auto 16px",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h3 style={{margin:"0 0 6px",fontSize:17,fontWeight:700}}>Connecter Qonto</h3>
        <p style={{margin:"0 0 16px",fontSize:13,color:"#64748B"}}>Entrez votre Bearer Token ou votre clé API Qonto.<br/>Trouvez-la dans Qonto → Paramètres → Intégrations → API</p>
        <input value={token} onChange={e=>setToken(e.target.value)} placeholder="Votre token API Qonto..." type="password"
          style={{...inp,maxWidth:400,margin:"0 auto 12px",display:"block",textAlign:"center",fontSize:13,borderColor:QT.border}} />
        <button onClick={saveToken} style={{padding:"10px 28px",borderRadius:8,background:QT.gradient,color:"#fff",border:"none",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(124,58,237,0.3)"}}>Connecter</button>
        <p style={{margin:"12px 0 0",fontSize:11,color:"#94A3B8"}}>Le token est stocké localement sur votre appareil uniquement.</p>
      </div>
    ) : (
      <>
        {/* CONNECTION STATUS */}
        <div style={{background:connected?"#F0FDF4":"#FEF2F2",border:`1.5px solid ${connected?"#BBF7D0":"#FECACA"}`,borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:connected?"#22C55E":"#EF4444",animation:connected?"pulseGlow 2s infinite":"none"}}/>
          <span style={{fontWeight:600,color:connected?"#166534":"#991B1B"}}>{connected?"Connecté":"Déconnecté"}</span>
          {error && <span style={{color:"#DC2626",fontSize:11}}>{error}</span>}
          <span style={{marginLeft:"auto",color:QT.primary,cursor:"pointer",fontWeight:600,fontSize:11}} onClick={()=>fetchAll(savedToken)}>Rafraîchir</span>
          <span style={{color:"#94A3B8",cursor:"pointer",fontSize:11}} onClick={disconnect}>Déconnecter</span>
        </div>

        {qLoading ? (
          <div style={{textAlign:"center",padding:40}}>
            <div style={{width:40,height:40,border:"4px solid #E2E8F0",borderTopColor:QT.primary,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/>
            <p style={{color:"#64748B",fontSize:13}}>Chargement depuis Qonto...</p>
          </div>
        ) : connected && (
          <>
            {/* KPI */}
            <div style={{display:"grid",gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",gap:12,marginBottom:20}}>
              {[
                {l:"Factures",v:invoices.length,c:QT.primary},
                {l:"Devis",v:quotes.length,c:"#A855F7"},
                {l:"Encaissé",v:fmtMoney(totalPaid),c:"#10B981"},
                {l:"Impayé",v:fmtMoney(totalUnpaid),c:totalUnpaid>0?"#EF4444":"#10B981"},
              ].map((k,i)=>(
                <div key={i} style={{background:"#fff",borderRadius:12,padding:m?12:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderTop:`3px solid ${k.c}`}}>
                  <div style={{fontSize:10,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",marginBottom:4}}>{k.l}</div>
                  <div style={{fontSize:m?18:24,fontWeight:700,color:k.c}}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* SUB-TABS */}
            <div style={{display:"flex",gap:6,marginBottom:16}}>
              {[{k:"factures",l:`Factures (${invoices.length})`},{k:"devis",l:`Devis (${quotes.length})`},{k:"clients",l:`Clients (${clients.length})`}].map(t=>(
                <button key={t.k} onClick={()=>setActiveTab(t.k)} style={{padding:"8px 16px",borderRadius:20,border:"1.5px solid",borderColor:activeTab===t.k?QT.primary:"#E2E8F0",background:activeTab===t.k?QT.primary:"#fff",color:activeTab===t.k?"#fff":"#64748B",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>
              ))}
            </div>

            {/* FACTURES LIST */}
            {activeTab==="factures" && (
              <div style={{display:"grid",gap:8}}>
                {invoices.length===0 ? <p style={{color:"#94A3B8",fontSize:13,textAlign:"center",padding:20}}>Aucune facture trouvée</p> :
                invoices.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).map(inv=>(
                  <div key={inv.id} style={{background:"#fff",borderRadius:10,padding:m?12:16,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",borderLeft:`4px solid ${invStatusColor[inv.status]||"#94A3B8"}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{flex:1,minWidth:180}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                        <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{inv.number||"—"}</span>
                        <Badge text={invStatusFr[inv.status]||inv.status} color={invStatusColor[inv.status]||"#94A3B8"}/>
                        <QontoBadge/>
                      </div>
                      <div style={{fontSize:11,color:"#64748B"}}>{inv.contact_email||"—"} {inv.issue_date ? `• ${fmtDate(inv.issue_date)}` : ""} {inv.due_date ? `• Éch. ${fmtDate(inv.due_date)}` : ""}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:16,fontWeight:700,color:inv.status==="paid"?"#10B981":"#0F172A"}}>{inv.total_amount ? `${inv.total_amount.value} €` : "—"}</div>
                      {inv.vat_amount && <div style={{fontSize:10,color:"#94A3B8"}}>TVA: {inv.vat_amount.value} €</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* DEVIS LIST */}
            {activeTab==="devis" && (
              <div style={{display:"grid",gap:8}}>
                {quotes.length===0 ? <p style={{color:"#94A3B8",fontSize:13,textAlign:"center",padding:20}}>Aucun devis trouvé</p> :
                quotes.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).map(q=>(
                  <div key={q.id} style={{background:"#fff",borderRadius:10,padding:m?12:16,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",borderLeft:`4px solid ${quoStatusColor[q.status]||"#94A3B8"}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{flex:1,minWidth:180}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                        <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{q.number||"—"}</span>
                        <Badge text={quoStatusFr[q.status]||q.status} color={quoStatusColor[q.status]||"#94A3B8"}/>
                        <QontoBadge/>
                      </div>
                      <div style={{fontSize:11,color:"#64748B"}}>{q.contact_email||"—"} {q.issue_date ? `• Émis ${fmtDate(q.issue_date)}` : ""} {q.expiry_date ? `• Expire ${fmtDate(q.expiry_date)}` : ""}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:16,fontWeight:700,color:"#0F172A"}}>{q.total_amount ? `${q.total_amount.value} €` : "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CLIENTS LIST */}
            {activeTab==="clients" && (
              <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:10}}>
                {clients.length===0 ? <p style={{color:"#94A3B8",fontSize:13,textAlign:"center",padding:20,gridColumn:"1/-1"}}>Aucun client trouvé</p> :
                clients.map(c=>(
                  <div key={c.id} style={{background:"#fff",borderRadius:10,padding:14,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",borderLeft:`4px solid ${c.kind==="company"?"#7C3AED":"#3B82F6"}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{c.name||`${c.first_name||""} ${c.last_name||""}`}</span>
                      <Badge text={c.kind==="company"?"Entreprise":"Particulier"} color={c.kind==="company"?"#7C3AED":"#3B82F6"}/>
                    </div>
                    {c.email && <div style={{fontSize:11,color:"#64748B"}}>{c.email}</div>}
                    {c.phone_number && <div style={{fontSize:11,color:"#94A3B8"}}>{c.phone_number}</div>}
                    {(c.address||c.billing_address?.street_address) && <div style={{fontSize:10,color:"#CBD5E1",marginTop:3}}>{c.billing_address?.street_address||c.address} {c.billing_address?.city||c.city} {c.billing_address?.zip_code||c.zip_code}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </>
    )}

    {/* FOOTER */}
    <div style={{marginTop:16,padding:"10px 14px",background:"#F8FAFC",borderRadius:8,display:"flex",alignItems:"center",gap:8,fontSize:11,color:"#94A3B8",flexWrap:"wrap"}}>
      <span style={{background:QT.gradient,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontWeight:700}}>Qonto API v2</span>
      <span>•</span>
      <span>Lecture seule — GET /v2/client_invoices, /v2/quotes, /v2/clients</span>
    </div>
  </div>);
}

// ═══════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════
function ProjectsV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});
  const openNew=()=>{setForm({nom:"",client:"",adresse:"",phase:"Hors d'air",statut:"Planifié",budget:"",depenses:0,dateDebut:"",dateFin:"",lots:""});setModal("new");};
  const handleSave=async()=>{const e={...form,budget:Number(form.budget)||0,depenses:Number(form.depenses)||0,lots:typeof form.lots==="string"?(form.lots||"").split(",").map(l=>l.trim()).filter(Boolean):form.lots||[]};await SB.upsertChantier(e);setModal(null);reload();};
  const handleDelete=async(id)=>{await SB.deleteChantier(id);reload();};

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Chantiers</h1>
      <button onClick={openNew} style={{...btnP,fontSize:12}}><Icon d={I.plus} size={14} color="#fff"/> Nouveau</button>
    </div>
    <div style={{display:"grid",gap:12}}>
      {data.chantiers.map(ch=>(
        <div key={ch.id} style={{background:"#fff",borderRadius:12,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderLeft:`4px solid ${phase[ch.phase]||"#94A3B8"}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
            <div style={{flex:1,minWidth:200}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}><span style={{fontSize:m?14:16,fontWeight:700}}>{ch.nom}</span><Badge text={ch.phase} color={phase[ch.phase]||"#64748B"}/><Badge text={ch.statut} color={status[ch.statut]||"#64748B"}/></div>
              <div style={{fontSize:12,color:"#64748B"}}>{ch.client} — {ch.adresse}</div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Lots: {ch.lots.join(", ")}</div>
            </div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>{setForm({...ch,lots:ch.lots.join(", "),budget:String(ch.budget),depenses:String(ch.depenses)});setModal("edit");}} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:6,padding:5,cursor:"pointer"}}><Icon d={I.edit} size={14} color="#64748B"/></button>
              <button onClick={()=>handleDelete(ch.id)} style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:5,cursor:"pointer"}}><Icon d={I.trash} size={14} color="#EF4444"/></button>
            </div>
          </div>
          <div style={{marginTop:10}}><PBar value={ch.depenses} max={ch.budget} color={phase[ch.phase]||"#3B82F6"}/><div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,color:"#94A3B8"}}><span>{fmtMoney(ch.depenses)} / {fmtMoney(ch.budget)}</span><span>{pct(ch.depenses,ch.budget)}%</span></div></div>
        </div>
      ))}
    </div>
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau chantier":"Modifier"}>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 14px"}}>
        <FF label="Nom"><input style={inp} value={form.nom||""} onChange={e=>setForm({...form,nom:e.target.value})}/></FF>
        <FF label="Client"><input style={inp} value={form.client||""} onChange={e=>setForm({...form,client:e.target.value})}/></FF>
        <FF label="Adresse"><input style={inp} value={form.adresse||""} onChange={e=>setForm({...form,adresse:e.target.value})}/></FF>
        <FF label="Phase"><select style={sel} value={form.phase||""} onChange={e=>setForm({...form,phase:e.target.value})}><option>Hors d'air</option><option>Technique</option><option>Finitions</option></select></FF>
        <FF label="Statut"><select style={sel} value={form.statut||""} onChange={e=>setForm({...form,statut:e.target.value})}><option>Planifié</option><option>En cours</option><option>En attente</option><option>Terminé</option></select></FF>
        <FF label="Budget €"><input type="number" style={inp} value={form.budget||""} onChange={e=>setForm({...form,budget:e.target.value})}/></FF>
        <FF label="Dépenses €"><input type="number" style={inp} value={form.depenses||""} onChange={e=>setForm({...form,depenses:e.target.value})}/></FF>
        <FF label="Début"><input type="date" style={inp} value={form.dateDebut||""} onChange={e=>setForm({...form,dateDebut:e.target.value})}/></FF>
        <FF label="Fin"><input type="date" style={inp} value={form.dateFin||""} onChange={e=>setForm({...form,dateFin:e.target.value})}/></FF>
        <FF label="Lots (virgules)"><input style={inp} value={form.lots||""} onChange={e=>setForm({...form,lots:e.target.value})}/></FF>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}><button onClick={()=>setModal(null)} style={btnS}>Annuler</button><button onClick={handleSave} style={btnP}>Enregistrer</button></div>
    </Modal>
  </div>);
}

// ═══════════════════════════════════════════
// PLANNING
// ═══════════════════════════════════════════
function PlanningV({data,m}) {
  const [filter,setFilter]=useState("all");
  const items = filter==="all"?data.planning:data.planning.filter(p=>p.chantierId===filter);
  const min=new Date(Math.min(...data.planning.map(p=>new Date(p.debut).getTime())));
  const max=new Date(Math.max(...data.planning.map(p=>new Date(p.fin).getTime())));
  const total=Math.ceil((max-min)/864e5)+1;

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Planning</h1>
      <select style={{...sel,width:"auto"}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tous</option>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select>
    </div>
    <div style={{background:"#fff",borderRadius:12,padding:m?12:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",overflowX:"auto"}}>
      {items.map(p=>{const ch=data.chantiers.find(c=>c.id===p.chantierId);const s=Math.ceil((new Date(p.debut)-min)/864e5);const d=Math.ceil((new Date(p.fin)-new Date(p.debut))/864e5)+1;const c=phase[ch?.phase]||"#3B82F6";
        return(<div key={p.id} style={{display:"flex",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #F8FAFC",minWidth:m?500:"auto"}}>
          <div style={{width:m?150:200,flexShrink:0,paddingRight:12}}><div style={{fontSize:12,fontWeight:600,color:"#0F172A"}}>{p.tache}</div><div style={{fontSize:10,color:"#94A3B8"}}>{ch?.nom} • {p.lot}</div></div>
          <div style={{flex:1,position:"relative",height:24}}>
            <div style={{position:"absolute",left:`${s/total*100}%`,width:`${d/total*100}%`,top:3,height:18,background:c+"22",borderRadius:5,border:`1.5px solid ${c}`}}>
              <div style={{width:`${p.avancement}%`,height:"100%",background:c+"55",borderRadius:4}}/><span style={{position:"absolute",right:4,top:1,fontSize:9,fontWeight:700,color:c}}>{p.avancement}%</span>
            </div>
          </div>
        </div>);
      })}
    </div>
  </div>);
}

// ═══════════════════════════════════════════
// BUDGET
// ═══════════════════════════════════════════
function BudgetV({data,m}) {
  return (<div>
    <h1 style={{margin:"0 0 20px",fontSize:m?18:24,fontWeight:700}}>Budget / OS</h1>
    <div style={{display:"grid",gap:16}}>
      {data.chantiers.map(ch=>{const r=pct(ch.depenses,ch.budget);const c=r>85?"#EF4444":r>60?"#F59E0B":"#10B981";return(
        <div key={ch.id} style={{background:"#fff",borderRadius:12,padding:m?14:20,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div><h3 style={{margin:0,fontSize:m?14:16,fontWeight:700}}>{ch.nom}</h3><span style={{fontSize:11,color:"#64748B"}}>{ch.client}</span></div>
            <Badge text={ch.phase} color={phase[ch.phase]||"#64748B"}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:14}}>
            {[["Budget",fmtMoney(ch.budget),"#0F172A"],["Dépensé",fmtMoney(ch.depenses),c],["Reste",fmtMoney(ch.budget-ch.depenses),"#0F172A"],["Lots",ch.lots.length,"#0F172A"]].map(([l,v,cl],i)=>(
              <div key={i} style={{background:"#F8FAFC",borderRadius:8,padding:10}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:600,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:m?16:20,fontWeight:700,color:cl}}>{v}</div></div>
            ))}
          </div>
          <PBar value={ch.depenses} max={ch.budget} color={c} h={10}/><div style={{textAlign:"right",fontSize:11,fontWeight:600,color:c,marginTop:3}}>{r}%</div>
        </div>
      );})}
    </div>
  </div>);
}

// ═══════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════
function TasksV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});const [filter,setFilter]=useState("all");
  const tasks = filter==="all"?data.tasks:data.tasks.filter(t=>t.statut===filter);
  const openNew=()=>{setForm({chantierId:data.chantiers[0]?.id||"",titre:"",priorite:"En cours",statut:"Planifié",echeance:"",lot:""});setModal("new");};
  const handleSave=async()=>{await SB.upsertTask(form);setModal(null);reload();};
  const toggle=async(t)=>{const cy=["Planifié","En cours","Terminé"];const next=cy[(cy.indexOf(t.statut)+1)%3];await SB.upsertTask({...t,statut:next});reload();};
  const handleDelete=async(id)=>{await SB.deleteTask(id);reload();};

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Tâches</h1>
      <div style={{display:"flex",gap:8}}>
        <select style={{...sel,width:"auto",fontSize:12}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Toutes</option><option value="En cours">En cours</option><option value="Planifié">Planifiées</option><option value="Terminé">Terminées</option></select>
        <button onClick={openNew} style={{...btnP,fontSize:12,padding:"8px 14px"}}>+ Tâche</button>
      </div>
    </div>
    <div style={{display:"grid",gap:6}}>
      {tasks.map(t=>{const ch=data.chantiers.find(c=>c.id===t.chantierId);return(
        <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:10,padding:m?"10px 12px":"12px 16px",boxShadow:"0 1px 2px rgba(0,0,0,0.04)"}}>
          <button onClick={()=>toggle(t)} style={{width:24,height:24,borderRadius:"50%",border:`2px solid ${status[t.statut]||"#CBD5E1"}`,background:t.statut==="Terminé"?"#10B981":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>{t.statut==="Terminé"&&<Icon d={I.check} size={12} color="#fff"/>}</button>
          <div style={{flex:1,opacity:t.statut==="Terminé"?.5:1}}><div style={{fontSize:13,fontWeight:600,color:"#0F172A"}}>{t.titre}</div><div style={{fontSize:10,color:"#94A3B8"}}>{ch?.nom} • {t.lot}</div></div>
          <Badge text={t.priorite} color={status[t.priorite]||"#64748B"}/>{!m&&<span style={{fontSize:11,color:"#94A3B8"}}>{fmtDate(t.echeance)}</span>}
          <button onClick={()=>{setForm(t);setModal("edit");}} style={{background:"none",border:"none",cursor:"pointer",padding:2}}><Icon d={I.edit} size={13} color="#94A3B8"/></button>
          <button onClick={()=>handleDelete(t.id)} style={{background:"none",border:"none",cursor:"pointer",padding:2}}><Icon d={I.trash} size={13} color="#CBD5E1"/></button>
        </div>
      );})}
    </div>
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouvelle tâche":"Modifier"}>
      <FF label="Chantier"><select style={sel} value={form.chantierId||""} onChange={e=>setForm({...form,chantierId:e.target.value})}>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></FF>
      <FF label="Titre"><input style={inp} value={form.titre||""} onChange={e=>setForm({...form,titre:e.target.value})}/></FF>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <FF label="Lot"><input style={inp} value={form.lot||""} onChange={e=>setForm({...form,lot:e.target.value})}/></FF>
        <FF label="Échéance"><input type="date" style={inp} value={form.echeance||""} onChange={e=>setForm({...form,echeance:e.target.value})}/></FF>
        <FF label="Priorité"><select style={sel} value={form.priorite||""} onChange={e=>setForm({...form,priorite:e.target.value})}><option>En cours</option><option>Urgent</option><option>En attente</option></select></FF>
        <FF label="Statut"><select style={sel} value={form.statut||""} onChange={e=>setForm({...form,statut:e.target.value})}><option>Planifié</option><option>En cours</option><option>Terminé</option></select></FF>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setModal(null)} style={btnS}>Annuler</button><button onClick={handleSave} style={btnP}>OK</button></div>
    </Modal>
  </div>);
}

// ═══════════════════════════════════════════
// CONTACTS
// ═══════════════════════════════════════════
function ContactsV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});const [tf,setTf]=useState("all");const [q,setQ]=useState("");
  const tc={Artisan:"#F59E0B",Client:"#3B82F6",Fournisseur:"#10B981"};
  const list=data.contacts.filter(c=>(tf==="all"||c.type===tf)&&(!q||c.nom.toLowerCase().includes(q.toLowerCase())||(c.specialite||"").toLowerCase().includes(q.toLowerCase())));
  const openNew=()=>{setForm({nom:"",type:"Artisan",specialite:"",tel:"",email:"",chantiers:""});setModal("new");};
  const handleSave=async()=>{await SB.upsertContact(form);setModal(null);reload();};
  const handleDelete=async(id)=>{await SB.deleteContact(id);reload();};

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Annuaire</h1>
      <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Contact</button>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      <div style={{position:"relative",flex:1,minWidth:180}}><span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><Icon d={I.search} size={14} color="#94A3B8"/></span><input placeholder="Rechercher..." style={{...inp,paddingLeft:30,fontSize:13}} value={q} onChange={e=>setQ(e.target.value)}/></div>
      {["all","Artisan","Client","Fournisseur"].map(t=><button key={t} onClick={()=>setTf(t)} style={{padding:"6px 12px",borderRadius:16,border:"1.5px solid",borderColor:tf===t?"#1E3A5F":"#E2E8F0",background:tf===t?"#1E3A5F":"#fff",color:tf===t?"#fff":"#64748B",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{t==="all"?"Tous":t+"s"}</button>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:10}}>
      {list.map(c=>(
        <div key={c.id} style={{background:"#fff",borderRadius:10,padding:m?12:16,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",borderLeft:`4px solid ${tc[c.type]||"#94A3B8"}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:14,fontWeight:700}}>{c.nom}</span><Badge text={c.type} color={tc[c.type]}/></div>
              <div style={{fontSize:11,color:"#64748B",marginBottom:4}}>{c.specialite}</div>
              <div style={{fontSize:11,color:"#94A3B8"}}>{c.tel} • {c.email}</div>
              <div style={{fontSize:10,color:"#CBD5E1",marginTop:3}}>{c.chantiers.map(id=>data.chantiers.find(x=>x.id===id)?.nom).filter(Boolean).join(", ")||"—"}</div>
            </div>
            <div style={{display:"flex",gap:3}}>
              <button onClick={()=>{setForm({...c,chantiers:c.chantiers.join(", ")});setModal("edit");}} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.edit} size={13} color="#94A3B8"/></button>
              <button onClick={()=>handleDelete(c.id)} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.trash} size={13} color="#CBD5E1"/></button>
            </div>
          </div>
        </div>
      ))}
    </div>
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau contact":"Modifier"}>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 14px"}}>
        <FF label="Nom"><input style={inp} value={form.nom||""} onChange={e=>setForm({...form,nom:e.target.value})}/></FF>
        <FF label="Type"><select style={sel} value={form.type||""} onChange={e=>setForm({...form,type:e.target.value})}><option>Artisan</option><option>Client</option><option>Fournisseur</option></select></FF>
        <FF label="Spécialité"><input style={inp} value={form.specialite||""} onChange={e=>setForm({...form,specialite:e.target.value})}/></FF>
        <FF label="Tél"><input style={inp} value={form.tel||""} onChange={e=>setForm({...form,tel:e.target.value})}/></FF>
        <FF label="Email"><input style={inp} value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})}/></FF>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setModal(null)} style={btnS}>Annuler</button><button onClick={handleSave} style={btnP}>OK</button></div>
    </Modal>
  </div>);
}

// ═══════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════
function ReportsV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});
  const openNew=()=>{setForm({chantierId:data.chantiers[0]?.id||"",date:new Date().toISOString().split("T")[0],numero:(data.compteRendus||[]).length+1,resume:"",participants:"",decisions:""});setModal("new");};
  const handleSave=async()=>{await SB.upsertCR(form);setModal(null);reload();};
  const handleDelete=async(id)=>{await SB.deleteCR(id);reload();};

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Comptes Rendus</h1>
      <button onClick={openNew} style={{...btnP,fontSize:12}}>+ CR</button>
    </div>
    {(data.compteRendus||[]).sort((a,b)=>new Date(b.date)-new Date(a.date)).map(cr=>{const ch=data.chantiers.find(c=>c.id===(cr.chantierId||cr.chantier_id));return(
      <div key={cr.id} style={{background:"#fff",borderRadius:12,padding:m?14:20,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{background:"#1E3A5F",color:"#fff",borderRadius:6,padding:"3px 8px",fontSize:12,fontWeight:700}}>CR n°{cr.numero}</span><span style={{fontWeight:700,fontSize:14}}>{ch?.nom}</span><span style={{fontSize:11,color:"#94A3B8"}}>{fmtDate(cr.date)}</span></div>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>generateCRPdf(cr,ch)} title="PDF" style={{background:"#EF4444",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#fff"}}>PDF</button>
            <button onClick={()=>generateCRExcel(cr,ch)} title="Excel" style={{background:"#10B981",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#fff"}}>XLS</button>
            <button onClick={()=>{setForm(cr);setModal("edit");}} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.edit} size={14} color="#94A3B8"/></button>
            <button onClick={()=>handleDelete(cr.id)} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.trash} size={14} color="#CBD5E1"/></button>
          </div>
        </div>
        <div style={{fontSize:13,color:"#334155",lineHeight:1.6,marginBottom:8}}>{cr.resume}</div>
        <div style={{fontSize:11}}><span style={{fontWeight:600,color:"#64748B"}}>Présents:</span> <span style={{color:"#94A3B8"}}>{cr.participants}</span></div>
        {cr.decisions&&<div style={{marginTop:8,background:"#FEF3C7",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#92400E"}}><b>Décisions:</b> {cr.decisions}</div>}
      </div>
    );})}
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau CR":"Modifier"} wide>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Chantier"><select style={sel} value={form.chantierId||""} onChange={e=>setForm({...form,chantierId:e.target.value})}>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></FF>
        <FF label="Date"><input type="date" style={inp} value={form.date||""} onChange={e=>setForm({...form,date:e.target.value})}/></FF>
        <FF label="N°"><input type="number" style={inp} value={form.numero||""} onChange={e=>setForm({...form,numero:e.target.value})}/></FF>
      </div>
      <FF label="Résumé"><textarea style={{...inp,minHeight:80,resize:"vertical"}} value={form.resume||""} onChange={e=>setForm({...form,resume:e.target.value})}/></FF>
      <FF label="Participants"><input style={inp} value={form.participants||""} onChange={e=>setForm({...form,participants:e.target.value})}/></FF>
      <FF label="Décisions"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={form.decisions||""} onChange={e=>setForm({...form,decisions:e.target.value})}/></FF>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setModal(null)} style={btnS}>Annuler</button><button onClick={handleSave} style={btnP}>OK</button></div>
    </Modal>
  </div>);
}

// ═══════════════════════════════════════════
// AI ASSISTANT + SPEECH-TO-TEXT MIC
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// ORDRES DE SERVICE (avec PDF + Excel)
// ═══════════════════════════════════════════
function OrdresServiceV({data,m,reload}) {
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [prestations,setPrestations]=useState([]);

  const nextNum = () => {
    const existing = (data.ordresService||[]).length;
    return `OS-2026-${String(existing+1).padStart(3,"0")}`;
  };

  const openNew = () => {
    const ch = data.chantiers[0];
    setForm({
      numero: nextNum(), chantier_id: ch?.id||"", chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"",
      client_nom: ch?.client||"", client_adresse: "",
      artisan_nom: "", artisan_specialite: "", artisan_tel: "", artisan_email: "", artisan_siret: "",
      date_emission: new Date().toISOString().split("T")[0], date_intervention: "", date_fin_prevue: "",
      observations: "", conditions: "Paiement à 30 jours à compter de la réception de la facture.",
      statut: "Brouillon",
    });
    setPrestations([{ description:"", unite:"m²", quantite:"", prix_unitaire:"", tva_taux:"20" }]);
    setModal("new");
  };

  const updateChantier = (chId) => {
    const ch = data.chantiers.find(c=>c.id===chId);
    setForm(f=>({...f, chantier_id: chId, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"", client_nom: ch?.client||""}));
  };

  const updateArtisan = (name) => {
    const co = data.contacts.find(c=>c.nom===name);
    if (co) setForm(f=>({...f, artisan_nom:co.nom, artisan_specialite:co.specialite||"", artisan_tel:co.tel||"", artisan_email:co.email||"", artisan_siret:co.siret||""}));
    else setForm(f=>({...f, artisan_nom:name}));
  };

  const addPrestation = () => setPrestations(p=>[...p,{ description:"", unite:"u", quantite:"", prix_unitaire:"", tva_taux:"20" }]);
  const removePrestation = (i) => setPrestations(p=>p.filter((_,j)=>j!==i));
  const updatePrestation = (i,field,val) => setPrestations(p=>p.map((x,j)=>j===i?{...x,[field]:val}:x));

  const calcTotals = () => {
    let ht=0, tva=0;
    prestations.forEach(p=>{
      const l = (parseFloat(p.quantite)||0)*(parseFloat(p.prix_unitaire)||0);
      ht += l; tva += l*(parseFloat(p.tva_taux)||20)/100;
    });
    return { ht, tva, ttc: ht+tva };
  };

  const handleSave = async () => {
    const t = calcTotals();
    const osData = { ...form, prestations, montant_ht:t.ht, montant_tva:t.tva, montant_ttc:t.ttc };
    await SB.upsertOS(osData);
    setModal(null);
    reload();
  };

  const handlePdf = (os) => {
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
    generateOSPdf({ ...os, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"" });
  };

  const handleExcel = (os) => {
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
    generateOSExcel({ ...os, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"" });
  };

  const handleDelete = async (id) => { await SB.deleteOS(id); reload(); };

  const osStatusColor = { "Brouillon":"#94A3B8", "Émis":"#3B82F6", "Signé":"#8B5CF6", "En cours":"#F59E0B", "Terminé":"#10B981", "Annulé":"#EF4444" };
  const totals = calcTotals();

  const artisans = data.contacts.filter(c=>c.type==="Artisan");

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700,color:"#0F172A"}}>Ordres de Service</h1>
      <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouvel OS</button>
    </div>

    {/* LISTE DES OS */}
    <div style={{display:"grid",gap:12}}>
      {(data.ordresService||[]).length===0 ?
        <div style={{background:"#fff",borderRadius:12,padding:30,textAlign:"center",color:"#94A3B8",fontSize:13}}>Aucun ordre de service. Cliquez "+ Nouvel OS" pour en créer un.</div>
      : (data.ordresService||[]).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).map(os=>{
        const ch = data.chantiers.find(c=>c.id===os.chantier_id);
        return (
          <div key={os.id} style={{background:"#fff",borderRadius:12,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderLeft:`4px solid ${osStatusColor[os.statut]||"#94A3B8"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{background:"#1E3A5F",color:"#fff",borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700}}>{os.numero}</span>
                  <Badge text={os.statut} color={osStatusColor[os.statut]||"#94A3B8"}/>
                  <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{ch?.nom||"—"}</span>
                </div>
                <div style={{fontSize:12,color:"#64748B"}}>{os.artisan_nom} ({os.artisan_specialite}) — Client : {os.client_nom}</div>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Émis {fmtDate(os.date_emission)} • Intervention {fmtDate(os.date_intervention)} • {(os.prestations||[]).length} prestation(s)</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:18,fontWeight:700,color:"#1E3A5F"}}>{fmtMoney(os.montant_ttc||0)}</div>
                <div style={{fontSize:10,color:"#94A3B8"}}>HT: {fmtMoney(os.montant_ht||0)}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
              <button onClick={()=>handlePdf(os)} style={{background:"#EF4444",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>Télécharger PDF</button>
              <button onClick={()=>handleExcel(os)} style={{background:"#10B981",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>Exporter Excel</button>
              <button onClick={()=>handleDelete(os.id)} style={{background:"none",border:"1px solid #FECACA",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,color:"#EF4444"}}>Supprimer</button>
            </div>
          </div>
        );
      })}
    </div>

    {/* MODAL CRÉATION OS */}
    <Modal open={!!modal} onClose={()=>setModal(null)} title="Nouvel Ordre de Service" wide>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="N° OS"><input style={inp} value={form.numero||""} onChange={e=>setForm({...form,numero:e.target.value})}/></FF>
        <FF label="Chantier"><select style={sel} value={form.chantier_id||""} onChange={e=>updateChantier(e.target.value)}>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></FF>
        <FF label="Statut"><select style={sel} value={form.statut||""} onChange={e=>setForm({...form,statut:e.target.value})}><option>Brouillon</option><option>Émis</option><option>Signé</option><option>En cours</option><option>Terminé</option><option>Annulé</option></select></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="Client">{form.client_nom && <div style={{fontSize:13,padding:"8px 0",color:"#0F172A",fontWeight:600}}>{form.client_nom}</div>}</FF>
        <FF label="Artisan"><select style={sel} value={form.artisan_nom||""} onChange={e=>updateArtisan(e.target.value)}>
          <option value="">— Sélectionner —</option>
          {artisans.map(a=><option key={a.id} value={a.nom}>{a.nom} ({a.specialite})</option>)}
        </select></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Date émission"><input type="date" style={inp} value={form.date_emission||""} onChange={e=>setForm({...form,date_emission:e.target.value})}/></FF>
        <FF label="Date intervention"><input type="date" style={inp} value={form.date_intervention||""} onChange={e=>setForm({...form,date_intervention:e.target.value})}/></FF>
        <FF label="Date fin prévue"><input type="date" style={inp} value={form.date_fin_prevue||""} onChange={e=>setForm({...form,date_fin_prevue:e.target.value})}/></FF>
      </div>

      {/* PRESTATIONS */}
      <div style={{marginTop:12,marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase"}}>Prestations</span>
          <button onClick={addPrestation} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>+ Ajouter une ligne</button>
        </div>
        {prestations.map((p,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:m?"1fr":"3fr 1fr 1fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"end"}}>
            <input placeholder="Description" style={{...inp,fontSize:12}} value={p.description} onChange={e=>updatePrestation(i,"description",e.target.value)}/>
            <select style={{...sel,fontSize:12}} value={p.unite} onChange={e=>updatePrestation(i,"unite",e.target.value)}>
              <option>u</option><option>m²</option><option>ml</option><option>m³</option><option>kg</option><option>h</option><option>forfait</option><option>ens</option>
            </select>
            <input placeholder="Qté" type="number" style={{...inp,fontSize:12}} value={p.quantite} onChange={e=>updatePrestation(i,"quantite",e.target.value)}/>
            <input placeholder="PU HT €" type="number" step="0.01" style={{...inp,fontSize:12}} value={p.prix_unitaire} onChange={e=>updatePrestation(i,"prix_unitaire",e.target.value)}/>
            <select style={{...sel,fontSize:12}} value={p.tva_taux} onChange={e=>updatePrestation(i,"tva_taux",e.target.value)}>
              <option value="20">20%</option><option value="10">10%</option><option value="5.5">5.5%</option><option value="0">0%</option>
            </select>
            <button onClick={()=>removePrestation(i)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon d={I.trash} size={14} color="#EF4444"/></button>
          </div>
        ))}
      </div>

      {/* TOTAUX */}
      <div style={{background:"#F8FAFC",borderRadius:8,padding:12,display:"flex",justifyContent:"flex-end",gap:20,marginBottom:12}}>
        <div><span style={{fontSize:11,color:"#64748B"}}>Total HT : </span><span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{fmtMoney(totals.ht)}</span></div>
        <div><span style={{fontSize:11,color:"#64748B"}}>TVA : </span><span style={{fontSize:14,fontWeight:700,color:"#F59E0B"}}>{fmtMoney(totals.tva)}</span></div>
        <div><span style={{fontSize:11,color:"#64748B"}}>TTC : </span><span style={{fontSize:16,fontWeight:700,color:"#1E3A5F"}}>{fmtMoney(totals.ttc)}</span></div>
      </div>

      <FF label="Observations"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={form.observations||""} onChange={e=>setForm({...form,observations:e.target.value})}/></FF>
      <FF label="Conditions de paiement"><textarea style={{...inp,minHeight:40,resize:"vertical"}} value={form.conditions||""} onChange={e=>setForm({...form,conditions:e.target.value})}/></FF>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
        <button onClick={()=>setModal(null)} style={btnS}>Annuler</button>
        <button onClick={handleSave} style={btnP}>Enregistrer l'OS</button>
      </div>
    </Modal>
  </div>);
}

// ═══════════════════════════════════════════
// AI ASSISTANT
// ═══════════════════════════════════════════
function AIV({data,save,m,externalTranscript,clearExternal,reload}) {
  const [messages,setMessages]=useState([{role:"assistant",content:"Bonjour Dursun ! Je suis l'assistant IA d'**ID Maîtrise**.\n\nJe peux tout faire :\n• **\"Crée un OS pour le chantier Friboulet, artisan Lefèvre...\"** → Ordre de Service\n• **\"Rédige un CR pour Les Voiles, présents : Lefèvre, Costa...\"** → Compte Rendu\n• **\"Nouveau chantier Villa Dupont, budget 200 000€...\"** → Chantier\n• **\"Ajoute une tâche urgente...\"** → Tâche\n• **\"RDV demain 14h réunion de chantier...\"** → Google Calendar\n• **\"Résumé avancement du chantier Les Voiles\"** → Analyse\n\nParlez ou tapez !"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [listening,setListening]=useState(false);
  const [gcalAction,setGcalAction]=useState(null);
  const recognRef = useRef(null);
  const endRef=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  // Pick up transcript from floating mic
  useEffect(() => {
    if (externalTranscript && externalTranscript.trim()) {
      setInput(externalTranscript);
      if (clearExternal) clearExternal();
    }
  }, [externalTranscript, clearExternal]);

  // ─── SPEECH RECOGNITION ───
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("La reconnaissance vocale n'est pas supportée sur ce navigateur. Utilisez Chrome ou Safari."); return; }
    
    if (listening && recognRef.current) {
      recognRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SR();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognRef.current = recognition;

    let finalTranscript = "";

    recognition.onstart = () => setListening(true);
    
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interim = transcript;
        }
      }
      setInput(finalTranscript + interim);
    };

    recognition.onerror = (e) => {
      console.error("Speech error:", e.error);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      if (finalTranscript.trim()) {
        setInput(finalTranscript.trim());
      }
    };

    recognition.start();
  }, [listening]);

  const sendMessage = async () => {
    if (!input.trim()||loading) return;
    const userMsg=input.trim(); setInput(""); 
    if (listening && recognRef.current) { recognRef.current.stop(); setListening(false); }
    setMessages(prev=>[...prev,{role:"user",content:userMsg}]); setLoading(true);

    try {
      const sys = `Tu es l'assistant IA d'ID Maîtrise, maîtrise d'œuvre BTP au Havre (9 Rue Henry Genestal, 76600). Le gérant est Dursun. Tu gères le quotidien des chantiers.

DONNÉES ACTUELLES (Supabase): ${JSON.stringify(data,null,0)}
GOOGLE CALENDAR: ${JSON.stringify(gcalEvents,null,0)}

TU PEUX TOUT FAIRE :
1. Créer des chantiers, tâches, contacts, comptes rendus, ordres de service
2. Résumer l'avancement d'un chantier (budget consommé, tâches en cours, prochains RDV)
3. Créer des RDV dans Google Calendar (utilise l'action add_gcal_event)
4. Lister, rechercher et analyser toutes les données

ACTIONS — utilise un bloc JSON entre <<<ACTION>>> et <<<END_ACTION>>>

add_chantier: {"type":"add_chantier","data":{"nom":"...","client":"...","adresse":"...","phase":"...","statut":"Planifié","budget":0,"dateDebut":"YYYY-MM-DD","dateFin":"YYYY-MM-DD","lots":["..."]}}

add_task: {"type":"add_task","data":{"chantier_id":"UUID","titre":"...","priorite":"Urgent|En cours|En attente","statut":"Planifié|En cours|Terminé","echeance":"YYYY-MM-DD","lot":"..."}}

add_contact: {"type":"add_contact","data":{"nom":"...","type":"Artisan|Client|Fournisseur","specialite":"...","tel":"...","email":"..."}}

add_cr: {"type":"add_cr","data":{"chantier_id":"UUID","date":"YYYY-MM-DD","numero":1,"resume":"...","participants":"...","decisions":"..."}}

add_os: {"type":"add_os","data":{"numero":"OS-2026-XXX","chantier_id":"UUID","client_nom":"...","client_adresse":"...","artisan_nom":"...","artisan_specialite":"...","artisan_tel":"...","artisan_email":"...","artisan_siret":"...","date_emission":"YYYY-MM-DD","date_intervention":"YYYY-MM-DD","date_fin_prevue":"YYYY-MM-DD","prestations":[{"description":"...","unite":"m²","quantite":10,"prix_unitaire":45.00,"tva_taux":20}],"observations":"...","conditions":"Paiement à 30 jours.","statut":"Émis"}}

add_gcal_event: {"type":"add_gcal_event","data":{"title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","location":"...","description":"..."}}

RÈGLES :
- Réponds TOUJOURS en français, concis et professionnel
- Utilise les vrais UUID des chantiers/contacts depuis les données
- Pour les OS, calcule les montants : montant_ht = somme(qte×pu), montant_tva = somme(qte×pu×tva/100), montant_ttc = ht+tva
- Phase libre (pas de contrainte)
- Quand on te demande un résumé/avancement, analyse les données et donne un point clair`;


      const response = await fetch("/api/claude", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, system:sys,
          messages:messages.filter((m,i)=>m.role!=="assistant"||i>0).concat([{role:"user",content:userMsg}]).map(m=>({role:m.role,content:m.content})),
        }),
      });
      const result = await response.json();
      let text = result.content?.map(c=>c.text||"").join("\n") || "Désolé, erreur.";

      const act = text.match(/<<<ACTION>>>([\s\S]*?)<<<END_ACTION>>>/);
      if (act) {
        try {
          const a=JSON.parse(act[1].trim());
          let actionLabel = "";
          
          if(a.type==="add_chantier") { await SB.upsertChantier(a.data); actionLabel="Chantier créé"; }
          else if(a.type==="add_task") { await SB.upsertTask(a.data); actionLabel="Tâche créée"; }
          else if(a.type==="add_contact") { await SB.upsertContact(a.data); actionLabel="Contact créé"; }
          else if(a.type==="add_cr") { await SB.upsertCR(a.data); actionLabel="Compte rendu créé"; }
          else if(a.type==="add_os") {
            // Calculate totals for OS
            const prests = a.data.prestations || [];
            let ht=0, tva=0;
            prests.forEach(p => { const l=(parseFloat(p.quantite)||0)*(parseFloat(p.prix_unitaire)||0); ht+=l; tva+=l*(parseFloat(p.tva_taux)||20)/100; });
            await SB.upsertOS({ ...a.data, montant_ht:ht, montant_tva:tva, montant_ttc:ht+tva });
            actionLabel="Ordre de Service créé";
          }
          else if(a.type==="add_gcal_event") {
            // Flag for GCal — will be handled by the parent
            setGcalAction(a.data);
            actionLabel="RDV Google Calendar à créer";
          }
          
          if(reload) reload();
          text=text.replace(/<<<ACTION>>>[\s\S]*?<<<END_ACTION>>>/,"").trim()+`\n\n✅ **${actionLabel} dans Supabase !**`;
        } catch(err) { 
          console.error("❌ Action error:", err);
          text=text.replace(/<<<ACTION>>>[\s\S]*?<<<END_ACTION>>>/,"").trim(); 
        }
      }
      setMessages(prev=>[...prev,{role:"assistant",content:text}]);
    } catch {
      setMessages(prev=>[...prev,{role:"assistant",content:"❌ Erreur API."}]);
    }
    setLoading(false); inputRef.current?.focus();
  };

  const renderMd = text => text.split("\n").map((line,i) => {
    let h=line.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>');
    return <div key={i} style={{marginBottom:line===""?6:1}} dangerouslySetInnerHTML={{__html:h||"&nbsp;"}}/>;
  });

  return (
    <div style={{display:"flex",flexDirection:"column",height:m?"calc(100vh - 76px)":"calc(100vh - 48px)"}}>
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Assistant IA</h1>
          <ApiBadge/>
        </div>
        <p style={{margin:"2px 0 0",fontSize:12,color:"#64748B"}}>Parlez ou tapez — connecté à vos données et Google Calendar</p>
      </div>

      {/* CHAT */}
      <div style={{flex:1,overflow:"auto",background:"#fff",borderRadius:12,padding:m?12:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:12}}>
        {messages.map((msg,i)=>(
          <div key={i} style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",marginBottom:10}}>
            <div style={{maxWidth:m?"88%":"75%",padding:"10px 14px",borderRadius:msg.role==="user"?"12px 12px 3px 12px":"12px 12px 12px 3px",background:msg.role==="user"?"linear-gradient(135deg,#1E3A5F,#2563EB)":"#F8FAFC",color:msg.role==="user"?"#fff":"#334155",fontSize:13,lineHeight:1.6,border:msg.role==="user"?"none":"1px solid #E2E8F0"}}>
              {msg.role==="assistant"?renderMd(msg.content):msg.content}
            </div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",gap:5,padding:10}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#94A3B8",animation:`pulse 1.4s ease-in-out ${i*.2}s infinite`}}/>)}</div>}
        <div ref={endRef}/>
      </div>

      {/* INPUT + MIC */}
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <MicButtonInline listening={listening} onClick={startListening} />
        <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()}
          placeholder={listening?"🎙️ Je vous écoute...":"Tapez ou appuyez sur le micro..."}
          style={{...inp,flex:1,padding:"12px 16px",fontSize:14,borderRadius:12,background:listening?"#FEF2F2":"#fff",borderColor:listening?"#FECACA":"#E2E8F0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}/>
        <button onClick={sendMessage} disabled={loading} style={{...btnP,padding:"12px 16px",borderRadius:12,opacity:loading?.6:1,display:"flex",alignItems:"center",gap:5}}>
          <Icon d={I.send} size={16} color="#fff"/>{!m&&"Envoyer"}
        </button>
      </div>

      {/* QUICK ACTIONS */}
      <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
        {["Crée un OS pour...", "Rédige un CR pour...", "Résumé avancement chantiers", "Tâches urgentes", "Crée un RDV demain", "Liste artisans actifs"].map(q=>(
          <button key={q} onClick={()=>setInput(q)} style={{padding:"5px 12px",borderRadius:16,border:"1px solid #E2E8F0",background:"#fff",color:"#64748B",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{q}</button>
        ))}
      </div>
    </div>
  );
}
