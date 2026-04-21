'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { SB, fmtDate, fmtMoney, inp } from '../dashboards/shared'
import { Badge } from '../components'
import { useToast } from '../contexts/ToastContext'
import AIQontoV from './AIQontoV'

const QT = {
  primary:"#7C3AED", light:"#F5F3FF", border:"#DDD6FE",
  gradient:"linear-gradient(135deg,#7C3AED,#A855F7,#C084FC)"
};

// Style commun pour le bouton PDF (soft)
const pdfBtn = {
  background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:5,
  padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700,
  color:"#DC2626",fontFamily:"inherit",
}

function QontoBadge() {
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",gap:3,
      padding:"2px 7px",borderRadius:5,background:QT.gradient,
      color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.1em"
    }}>API</span>
  );
}

export default function QontoV({m, data, reload}) {
  const { addToast } = useToast();
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [activeTab, setActiveTab] = useState("factures");
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [qLoading, setQLoading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [importing, setImporting] = useState({});
  const [importMsg, setImportMsg] = useState({});
  // Recherche locale par onglet (factures/devis/clients)
  const [searchFactures, setSearchFactures] = useState("");
  const [searchDevis, setSearchDevis] = useState("");
  const [searchClients, setSearchClients] = useState("");
  // PDF download state : quel item est en cours de fetch
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  // PDFs dont on sait (après fetch) qu'ils ne sont pas disponibles via l'API
  const [pdfUnavailable, setPdfUnavailable] = useState(() => new Set());

  // Charge le token depuis Supabase (cross-device)
  useEffect(() => {
    (async () => {
      try {
        const { data: row } = await supabase.from('settings').select('value').eq('key','qonto-token').single();
        const t = row?.value;
        if (t && t.includes(":")) { setSavedToken(t); setToken(t); }
      } catch {}
    })();
  }, []);

  const saveToken = async () => {
    const t = token.trim();
    if (!t) return;
    if (!t.includes(":")) {
      setError("Format invalide — doit être login:secret-key (avec deux-points).");
      return;
    }
    setError("");
    // Sauvegarde dans Supabase uniquement (pas de localStorage — token sensible)
    await supabase.from('settings').upsert({ key: 'qonto-token', value: t });
    SB.log('update', 'settings', 'qonto-token', 'Qonto — connexion', { action: 'connect' });
    setSavedToken(t);
    // useEffect [savedToken] déclenchera automatiquement fetchAll()
  };

  const disconnect = async () => {
    await supabase.from('settings').delete().eq('key','qonto-token');
    SB.log('delete', 'settings', 'qonto-token', 'Qonto — déconnexion', { action: 'disconnect' });
    setSavedToken(""); setToken(""); setConnected(false); setError("");
    setInvoices([]); setQuotes([]); setClients([]);
  };

  // AbortController partagé par fetchAll : si l'utilisateur quitte la page
  // (ou reconnecte avec un autre token) on annule les 3 requêtes en vol.
  const qontoAbortRef = useRef(null);

  // Depuis le fix sécurité P0 : on ne passe plus le token Qonto dans le body.
  // Le serveur /api/qonto le récupère directement dans Supabase via le
  // service role key (table settings, key='qonto-token'). On envoie juste
  // le JWT Supabase pour s'authentifier auprès de notre propre API.
  const fetchQonto = useCallback(async (endpoint, signal) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/qonto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ endpoint }),
      signal,
    });
    if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || `Qonto ${res.status}`); }
    return res.json();
  }, []);

  const fetchAll = useCallback(async () => {
    qontoAbortRef.current?.abort();
    const controller = new AbortController();
    qontoAbortRef.current = controller;
    setQLoading(true); setError("");
    try {
      const [invData, quoData, cliData] = await Promise.all([
        fetchQonto("client_invoices?exclude_imports=false", controller.signal),
        fetchQonto("quotes", controller.signal),
        fetchQonto("clients", controller.signal),
      ]);
      setInvoices(invData.client_invoices || []);
      setQuotes(quoData.quotes || []);
      setClients(cliData.clients || []);
      setConnected(true);
    } catch (e) {
      if (e?.name === 'AbortError') return; // unmount ou reconnexion : silence
      setError(e.message || "Erreur de connexion à Qonto");
      setConnected(false);
    }
    setQLoading(false);
  }, [fetchQonto]);

  useEffect(() => { if (savedToken) fetchAll(); }, [savedToken, fetchAll]);

  // Annule les requêtes Qonto en vol au démontage (onglet fermé ou nav).
  useEffect(() => () => { qontoAbortRef.current?.abort() }, []);

  // ── Téléchargement PDF ──
  //
  // Deux causes d'échec principales :
  // 1. L'API Qonto v2 n'expose pas toujours pdf_url selon le plan :
  //    on essaie 3 chemins successifs (champ direct → détail → attachment)
  // 2. Popup bloqué sur iOS Safari : window.open() après un await est
  //    silencieusement ignoré par le browser. On détecte ça et on propose
  //    un fallback cliquable dans un toast persistant.
  const downloadPdf = async (item, type) => {
    if (pdfLoadingId) return; // un seul téléchargement à la fois
    const id = item.id;

    // Helper : ouvre l'URL dans un nouvel onglet en détectant le popup block.
    // Si popup bloqué, affiche un toast persistant avec une action "Ouvrir"
    // qui est un vrai clic user → le browser autorise la navigation.
    const openPdfOrFallback = (url, label) => {
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win || win.closed || typeof win.closed === 'undefined') {
        // Popup bloqué (iOS Safari fréquent après un fetch async)
        addToast(`Ouvrir ${label}`, "info", {
          duration: 0, // persistant jusqu'au click
          action: {
            label: "Ouvrir PDF",
            onClick: () => { window.location.href = url; },
          },
        });
      } else {
        addToast(`${label} ouvert`, "success", 2000);
      }
    };

    // 1. Champ direct disponible dans l'objet list ?
    const directUrl = item.pdf_url || item.file_url || item.pdf_download_url
      || item.attachment?.url || item.file?.url || item.document_url
      || item.attachments?.[0]?.url;
    if (directUrl) {
      // Synchrone → pas de popup block
      openPdfOrFallback(directUrl, item.number || "PDF");
      return;
    }

    // Pas de champ direct → on fetch le détail (opération async, coûteuse)
    setPdfLoadingId(id);
    try {
      // 2. Récupération du détail complet
      const endpoint = type === "invoice" ? `client_invoices/${id}` : `quotes/${id}`;
      const detail = await fetchQonto(endpoint);
      const doc = detail.client_invoice || detail.quote || detail;

      const docUrl = doc.pdf_url || doc.file_url || doc.pdf_download_url
        || doc.attachment?.url || doc.file?.url || doc.document_url
        || doc.attachments?.[0]?.url;
      if (docUrl) { openPdfOrFallback(docUrl, item.number || "PDF"); return; }

      // 3. Qonto stocke parfois le PDF dans un attachment séparé
      const attId = doc.attachment_ids?.[0] || doc.attachment_id;
      if (attId) {
        const att = await fetchQonto(`attachments/${attId}`);
        const attUrl = att.attachment?.url || att.url || att.file_url || att.file?.url;
        if (attUrl) { openPdfOrFallback(attUrl, item.number || "PDF"); return; }
      }

      // Aucune URL trouvée → on marque le document comme indisponible
      // et on propose un fallback vers l'app Qonto web
      setPdfUnavailable(prev => new Set(prev).add(id));
      addToast(
        `PDF non disponible via l'API Qonto pour ${item.number || "ce document"}`,
        "warning",
        {
          duration: 0,
          action: {
            label: "Ouvrir Qonto",
            onClick: () => { window.open("https://app.qonto.com", "_blank", "noopener,noreferrer"); },
          },
        }
      );
    } catch(e) {
      addToast("Erreur récupération PDF : " + e.message, "error");
    } finally {
      setPdfLoadingId(null);
    }
  };

  // ── Import client Qonto → Annuaire ──
  const importClient = async (c) => {
    const id = c.id;
    setImporting(p=>({...p,[id]:true})); setImportMsg(p=>({...p,[id]:""}));
    try {
      const siret = c.siret || c.vat_number?.replace(/^FR\d{2}/,"") || null;
      // Recherche si contact existant par SIRET ou nom
      const existBySiret = siret && (data?.contacts||[]).find(x=>x.siret===siret);
      const existByName = (data?.contacts||[]).find(x=>(x.nom||"").toLowerCase()===(c.name||"").toLowerCase());
      const existing = existBySiret || existByName;
      const nom = c.name || `${c.first_name||""} ${c.last_name||""}`.trim() || "—";
      const addr = c.billing_address || {};
      const contactData = {
        id: existing?.id,
        nom,
        societe: nom,
        type: existing?.type || (c.kind==="company"?"Client":"Client"),
        email: c.email || existing?.email || null,
        tel: c.phone_number || existing?.tel || null,
        adresse: addr.street_address || existing?.adresse || null,
        code_postal: addr.zip_code || existing?.code_postal || null,
        ville: addr.city || existing?.ville || null,
        siret: siret || existing?.siret || null,
        tva_intra: c.vat_number || existing?.tva_intra || null,
        actif: true,
      };
      await SB.upsertContact(contactData);
      await reload();
      setImportMsg(p=>({...p,[id]: existing ? "✅ Mis à jour" : "✅ Importé"}));
    } catch(e) {
      setImportMsg(p=>({...p,[id]:"❌ " + e.message}));
    }
    setImporting(p=>({...p,[id]:false}));
  };

  const invStatusColor = {
    draft:"#94A3B8", finalized:"#3B82F6", sent:"#8B5CF6",
    paid:"#10B981", canceled:"#EF4444", unpaid:"#F59E0B", pending:"#F59E0B"
  };
  const invStatusFr = {
    draft:"Brouillon", finalized:"Finalisée", sent:"Envoyée",
    paid:"Payée", canceled:"Annulée", unpaid:"Impayée", pending:"En attente"
  };
  const quoStatusColor = { pending_approval:"#F59E0B", approved:"#10B981", canceled:"#EF4444", draft:"#94A3B8" };
  const quoStatusFr = { pending_approval:"En attente", approved:"Approuvé", canceled:"Annulé", draft:"Brouillon" };

  // Qonto renvoie total_amount.value (string) ou total_amount_cents (int) selon la version
  const getAmt = (inv) => parseFloat(inv.total_amount?.value ?? (inv.total_amount_cents||0)/100) || 0;
  const paidInvoices = invoices.filter(i => i.status==="paid");
  const unpaidInvoices = invoices.filter(i => ["sent","finalized","unpaid","pending"].includes(i.status));
  const totalPaid = paidInvoices.reduce((s,i) => s + getAmt(i), 0);
  const totalUnpaid = unpaidInvoices.reduce((s,i) => s + getAmt(i), 0);

  // Listes filtrées par recherche locale + triées par date desc
  const filteredInvoices = useMemo(() => {
    const s = searchFactures.toLowerCase().trim();
    const list = s
      ? invoices.filter(inv =>
          (inv.number||"").toLowerCase().includes(s) ||
          (inv.contact_email||"").toLowerCase().includes(s)
        )
      : invoices;
    return [...list].sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
  }, [invoices, searchFactures]);

  const filteredQuotes = useMemo(() => {
    const s = searchDevis.toLowerCase().trim();
    const list = s
      ? quotes.filter(q => (q.number||"").toLowerCase().includes(s) || (q.contact_email||"").toLowerCase().includes(s))
      : quotes;
    return [...list].sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
  }, [quotes, searchDevis]);

  const filteredClients = useMemo(() => {
    const s = searchClients.toLowerCase().trim();
    if (!s) return clients;
    return clients.filter(c => {
      const nom = c.name || `${c.first_name||""} ${c.last_name||""}`.trim();
      return nom.toLowerCase().includes(s) || (c.email||"").toLowerCase().includes(s) || (c.siret||"").includes(s);
    });
  }, [clients, searchClients]);

  // Petit composant de barre de recherche locale (réutilisé dans les 3 onglets)
  const LocalSearch = ({ value, onChange, placeholder }) => (
    <div style={{position:"relative",marginBottom:10}}>
      <svg style={{
        position:"absolute",left:9,top:"50%",
        transform:"translateY(-50%)",opacity:0.5
      }} width="13" height="13" viewBox="0 0 24 24"
        fill="none" stroke="#64748B" strokeWidth="2.5">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding:"7px 10px 7px 28px",borderRadius:7,
          border:"1px solid #E2E8F0",fontSize:12,
          width:m?"100%":320,boxSizing:"border-box",fontFamily:"inherit"
        }}
      />
    </div>
  );

  return (<div>
    {/* HEADER */}
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      <div style={{
        width:44,height:44,borderRadius:12,background:QT.gradient,
        display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:"0 4px 14px rgba(124,58,237,0.3)"
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2"/>
          <path d="M15 15l3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{flex:1}}>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Qonto <QontoBadge/></h1>
        <p style={{margin:0,fontSize:12,color:"#64748B"}}>Factures, Devis & Clients — API Qonto v2</p>
      </div>
      {connected && (
        <a href="https://app.qonto.com" target="_blank" rel="noopener noreferrer"
          style={{
            display:"flex",alignItems:"center",gap:5,
            padding:"8px 14px",borderRadius:8,background:QT.primary,
            color:"#fff",textDecoration:"none",fontSize:12,fontWeight:600
          }}>Ouvrir Qonto</a>
      )}
    </div>

    {/* TOKEN CONFIG */}
    {!savedToken ? (
      <div style={{
        background:"#fff",borderRadius:14,padding:24,
        boxShadow:"0 1px 3px rgba(0,0,0,0.06)",
        border:`2px dashed ${QT.border}`,textAlign:"center",
        maxWidth:500,margin:"40px auto"
      }}>
        <div style={{
          width:60,height:60,borderRadius:"50%",background:QT.light,
          margin:"0 auto 16px",display:"flex",alignItems:"center",
          justifyContent:"center"
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              stroke="#7C3AED" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h3 style={{margin:"0 0 6px",fontSize:17,fontWeight:700}}>Connecter Qonto</h3>
        <p style={{margin:"0 0 4px",fontSize:13,color:"#64748B"}}>Entrez votre clé API Qonto au format :</p>
        <p style={{
          margin:"0 0 12px",fontSize:13,fontWeight:700,
          color:"#7C3AED",fontFamily:"monospace"
        }}>login:secret-key</p>
        <p style={{margin:"0 0 16px",fontSize:11,color:"#94A3B8"}}>
          Trouvez-la dans Qonto → Paramètres → Intégrations → API
        </p>
        <input value={token} onChange={e=>setToken(e.target.value)}
          placeholder="exemple: mon-login:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          type="password"
          style={{
            ...inp,maxWidth:420,margin:"0 auto 12px",
            display:"block",textAlign:"center",
            fontSize:12,borderColor:QT.border
          }} />
        <button onClick={saveToken} style={{
          padding:"10px 28px",borderRadius:8,background:QT.gradient,
          color:"#fff",border:"none",fontSize:14,fontWeight:600,
          cursor:"pointer",fontFamily:"inherit",
          boxShadow:"0 2px 8px rgba(124,58,237,0.3)"
        }}>Connecter</button>
        <p style={{margin:"12px 0 0",fontSize:11,color:"#94A3B8"}}>
          Le token est stocké de façon sécurisée dans votre base Supabase.
        </p>
      </div>
    ) : (
      <>
        {/* CONNECTION STATUS */}
        <div style={{
          background:connected?"#F0FDF4":"#FEF2F2",
          border:`1.5px solid ${connected?"#BBF7D0":"#FECACA"}`,
          borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12
        }}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{
              width:8,height:8,borderRadius:"50%",
              background:connected?"#22C55E":"#EF4444",
              animation:connected?"pulseGlow 2s infinite":"none",flexShrink:0
            }}/>
            <span style={{fontWeight:600,color:connected?"#166534":"#991B1B"}}>
              {connected?"Connecté":"Échec de connexion"}
            </span>
            {connected && <span style={{color:"#64748B"}}>• {savedToken.split(":")[0]}</span>}
            <span style={{
              marginLeft:"auto",color:QT.primary,
              cursor:"pointer",fontWeight:600,fontSize:11
            }} onClick={()=>fetchAll()}>Rafraîchir</span>
            <span style={{color:"#94A3B8",cursor:"pointer",fontSize:11}} onClick={disconnect}>Changer de compte</span>
          </div>
          {error && (
            <div style={{
              marginTop:8,background:"#FEF2F2",
              border:"1px solid #FECACA",borderRadius:6,padding:"8px 10px"
            }}>
              <div style={{color:"#DC2626",fontWeight:600,marginBottom:4}}>❌ {error}</div>
              {error.includes("401") && (
                <div style={{color:"#64748B",fontSize:11,lineHeight:1.6}}>
                  <b>Vérifiez vos identifiants Qonto :</b><br/>
                  1. Allez dans <b>Qonto → Paramètres → Intégrations → API</b><br/>
                  2. Copiez le <b>Login</b> et la <b>Secret key</b><br/>
                  3. Cliquez <b>"Changer de compte"</b> et entrez :{" "}
                  <code style={{background:"#F1F5F9",padding:"1px 4px",borderRadius:3}}>
                    votre-login:votre-secret-key
                  </code>
                </div>
              )}
            </div>
          )}
        </div>

        {qLoading ? (
          <div style={{textAlign:"center",padding:40}}>
            <div style={{
              width:40,height:40,border:"4px solid #E2E8F0",
              borderTopColor:QT.primary,borderRadius:"50%",
              animation:"spin 1s linear infinite",margin:"0 auto 12px"
            }}/>
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
                {l:"À encaisser",v:fmtMoney(totalUnpaid),c:totalUnpaid>0?"#EF4444":"#10B981"},
              ].map((k,i)=>(
                <div key={i} style={{
                  background:"#fff",borderRadius:12,padding:m?12:16,
                  boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderTop:`3px solid ${k.c}`
                }}>
                  <div style={{
                    fontSize:10,fontWeight:600,color:"#94A3B8",
                    textTransform:"uppercase",marginBottom:4
                  }}>{k.l}</div>
                  <div style={{fontSize:m?18:24,fontWeight:700,color:k.c}}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* SUB-TABS */}
            <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
              {[
                {k:"factures",l:`Factures (${invoices.length})`},
                {k:"devis",l:`Devis (${quotes.length})`},
                {k:"clients",l:`Clients (${clients.length})`},
                {k:"ai",l:"🤖 Analyse IA"}
              ].map(t=>(
                <button key={t.k} onClick={()=>setActiveTab(t.k)} style={{
                  padding:"8px 16px",borderRadius:20,border:"1.5px solid",
                  borderColor:activeTab===t.k?QT.primary:"#E2E8F0",
                  background:activeTab===t.k?QT.primary:"#fff",
                  color:activeTab===t.k?"#fff":"#64748B",
                  fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"
                }}>{t.l}</button>
              ))}
            </div>

            {/* FACTURES LIST */}
            {activeTab==="factures" && (
              <>
                <LocalSearch value={searchFactures} onChange={setSearchFactures}
                  placeholder="Rechercher n° ou email…"/>
                <div style={{display:"grid",gap:8}}>
                  {filteredInvoices.length===0 ? (
                    <div style={{
                      background:"#fff",borderRadius:10,padding:"30px 20px",
                      textAlign:"center",boxShadow:"0 1px 2px rgba(0,0,0,0.04)"
                    }}>
                      <div style={{fontSize:30,opacity:0.5,marginBottom:6}}>🧾</div>
                      <div style={{fontSize:13,color:"#64748B",fontWeight:600}}>
                        {searchFactures ? "Aucun résultat" : "Aucune facture"}
                      </div>
                    </div>
                  ) : filteredInvoices.map(inv=>(
                    <div key={inv.id} style={{
                      background:"#fff",borderRadius:10,padding:m?12:16,
                      boxShadow:"0 1px 2px rgba(15,23,42,0.05)",
                      borderLeft:`4px solid ${invStatusColor[inv.status]||"#94A3B8"}`,
                      display:"flex",justifyContent:"space-between",
                      alignItems:"center",flexWrap:"wrap",gap:8
                    }}>
                      <div style={{flex:1,minWidth:180}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                          <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{inv.number||"—"}</span>
                          <Badge text={invStatusFr[inv.status]||inv.status}
                            color={invStatusColor[inv.status]||"#94A3B8"}/>
                          <QontoBadge/>
                        </div>
                        <div style={{fontSize:11,color:"#64748B"}}>
                          {inv.contact_email||"—"}
                          {inv.issue_date ? ` • ${fmtDate(inv.issue_date)}` : ""}
                          {inv.due_date ? ` • Éch. ${fmtDate(inv.due_date)}` : ""}
                        </div>
                      </div>
                      <div style={{
                        textAlign:"right",display:"flex",
                        flexDirection:"column",alignItems:"flex-end",gap:4
                      }}>
                        <div style={{
                          fontSize:16,fontWeight:700,
                          color:inv.status==="paid"?"#10B981":"#0F172A"
                        }}>{fmtMoney(getAmt(inv))}</div>
                        {(inv.vat_amount?.value||inv.vat_amount_cents) && (
                          <div style={{fontSize:10,color:"#94A3B8"}}>
                            TVA: {fmtMoney(parseFloat(inv.vat_amount?.value??(inv.vat_amount_cents||0)/100))}
                          </div>
                        )}
                        {pdfUnavailable.has(inv.id) ? (
                          <a href="https://app.qonto.com" target="_blank" rel="noopener noreferrer"
                            title="PDF non disponible via l'API Qonto — ouvrir sur l'app Qonto"
                            style={{
                              ...pdfBtn,background:"#FEF3C7",
                              color:"#92400E",border:"1px solid #FDE68A",
                              textDecoration:"none"
                            }}>
                            ↗ Voir Qonto
                          </a>
                        ) : (
                          <button onClick={()=>downloadPdf(inv,"invoice")}
                            disabled={pdfLoadingId!==null}
                            title={pdfLoadingId===inv.id?"Récupération du PDF…":"Télécharger le PDF"}
                            style={{
                              ...pdfBtn,
                              opacity:pdfLoadingId===inv.id?0.7:(pdfLoadingId?0.5:1),
                              cursor:pdfLoadingId?'wait':'pointer'
                            }}>
                            {pdfLoadingId===inv.id ? (
                              <><span style={{
                                display:"inline-block",width:9,height:9,
                                border:"2px solid #FECACA",borderTopColor:"#DC2626",
                                borderRadius:"50%",
                                animation:"spin .8s linear infinite",
                                marginRight:4,verticalAlign:"middle"
                              }}/>Récup…</>
                            ) : '⬇ PDF'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* DEVIS LIST */}
            {activeTab==="devis" && (
              <>
                <LocalSearch value={searchDevis} onChange={setSearchDevis}
                  placeholder="Rechercher n° ou email…"/>
                <div style={{display:"grid",gap:8}}>
                  {filteredQuotes.length===0 ? (
                    <div style={{
                      background:"#fff",borderRadius:10,padding:"30px 20px",
                      textAlign:"center",boxShadow:"0 1px 2px rgba(0,0,0,0.04)"
                    }}>
                      <div style={{fontSize:30,opacity:0.5,marginBottom:6}}>📑</div>
                      <div style={{fontSize:13,color:"#64748B",fontWeight:600}}>
                        {searchDevis ? "Aucun résultat" : "Aucun devis"}
                      </div>
                    </div>
                  ) : filteredQuotes.map(q=>(
                    <div key={q.id} style={{
                      background:"#fff",borderRadius:10,padding:m?12:16,
                      boxShadow:"0 1px 2px rgba(15,23,42,0.05)",
                      borderLeft:`4px solid ${quoStatusColor[q.status]||"#94A3B8"}`,
                      display:"flex",justifyContent:"space-between",
                      alignItems:"center",flexWrap:"wrap",gap:8
                    }}>
                      <div style={{flex:1,minWidth:180}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                          <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{q.number||"—"}</span>
                          <Badge text={quoStatusFr[q.status]||q.status} color={quoStatusColor[q.status]||"#94A3B8"}/>
                          <QontoBadge/>
                        </div>
                        <div style={{fontSize:11,color:"#64748B"}}>
                          {q.contact_email||"—"}
                          {q.issue_date ? ` • Émis ${fmtDate(q.issue_date)}` : ""}
                          {q.expiry_date ? ` • Expire ${fmtDate(q.expiry_date)}` : ""}
                        </div>
                      </div>
                      <div style={{
                        textAlign:"right",display:"flex",
                        flexDirection:"column",alignItems:"flex-end",gap:4
                      }}>
                        <div style={{fontSize:16,fontWeight:700,color:"#0F172A"}}>
                          {fmtMoney(parseFloat(q.total_amount?.value??(q.total_amount_cents||0)/100)||0)}
                        </div>
                        {pdfUnavailable.has(q.id) ? (
                          <a href="https://app.qonto.com" target="_blank" rel="noopener noreferrer"
                            title="PDF non disponible via l'API Qonto — ouvrir sur l'app Qonto"
                            style={{
                              ...pdfBtn,background:"#FEF3C7",
                              color:"#92400E",border:"1px solid #FDE68A",
                              textDecoration:"none"
                            }}>
                            ↗ Voir Qonto
                          </a>
                        ) : (
                          <button onClick={()=>downloadPdf(q,"quote")}
                            disabled={pdfLoadingId!==null}
                            title={pdfLoadingId===q.id?"Récupération du PDF…":"Télécharger le PDF"}
                            style={{
                              ...pdfBtn,
                              opacity:pdfLoadingId===q.id?0.7:(pdfLoadingId?0.5:1),
                              cursor:pdfLoadingId?'wait':'pointer'
                            }}>
                            {pdfLoadingId===q.id ? (
                              <><span style={{
                                display:"inline-block",width:9,height:9,
                                border:"2px solid #FECACA",borderTopColor:"#DC2626",
                                borderRadius:"50%",
                                animation:"spin .8s linear infinite",
                                marginRight:4,verticalAlign:"middle"
                              }}/>Récup…</>
                            ) : '⬇ PDF'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* CLIENTS LIST */}
            {activeTab==="clients" && (
              <>
                <LocalSearch value={searchClients} onChange={setSearchClients}
                  placeholder="Rechercher nom, email ou SIRET…"/>
                <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:10}}>
                  {filteredClients.length===0 ? (
                    <div style={{
                      background:"#fff",borderRadius:10,padding:"30px 20px",
                      textAlign:"center",boxShadow:"0 1px 2px rgba(0,0,0,0.04)",
                      gridColumn:"1/-1"
                    }}>
                      <div style={{fontSize:30,opacity:0.5,marginBottom:6}}>👥</div>
                      <div style={{fontSize:13,color:"#64748B",fontWeight:600}}>
                        {searchClients ? "Aucun résultat" : "Aucun client"}
                      </div>
                    </div>
                  ) : filteredClients.map(c=>{
                  const nom = c.name||`${c.first_name||""} ${c.last_name||""}`.trim();
                  const siret = c.siret || null;
                  const existBySiret = siret && (data?.contacts||[]).find(x=>x.siret===siret);
                  const existByName = (data?.contacts||[]).find(x=>(x.nom||"").toLowerCase()===nom.toLowerCase());
                  const existing = existBySiret || existByName;
                  return (
                  <div key={c.id} style={{
                    background:"#fff",borderRadius:10,padding:14,
                    boxShadow:"0 1px 2px rgba(0,0,0,0.04)",
                    borderLeft:`4px solid ${existing?"#10B981":c.kind==="company"?"#7C3AED":"#3B82F6"}`
                  }}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                          <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{nom}</span>
                          <Badge text={c.kind==="company"?"Entreprise":"Particulier"}
                            color={c.kind==="company"?"#7C3AED":"#3B82F6"}/>
                          {existing && <Badge text="Dans l'annuaire" color="#10B981"/>}
                        </div>
                        {c.email && <div style={{fontSize:11,color:"#64748B"}}>{c.email}</div>}
                        {c.phone_number && <div style={{fontSize:11,color:"#94A3B8"}}>{c.phone_number}</div>}
                        {c.billing_address?.street_address && (
                          <div style={{fontSize:10,color:"#CBD5E1",marginTop:2}}>
                            {c.billing_address.street_address}{" "}
                            {c.billing_address.zip_code}{" "}
                            {c.billing_address.city}
                          </div>
                        )}
                        {siret && <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>SIRET : {siret}</div>}
                        {existBySiret && (
                          <div style={{fontSize:10,color:"#10B981",marginTop:2}}>
                            ✓ SIRET identique à : {existBySiret.nom}
                          </div>
                        )}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                        <button
                          onClick={()=>importClient(c)}
                          disabled={!!importing[c.id]}
                          style={{
                            background:existing?"#10B981":"#7C3AED",
                            border:"none",borderRadius:6,padding:"5px 12px",
                            cursor:"pointer",fontSize:11,fontWeight:700,
                            color:"#fff",whiteSpace:"nowrap",
                            opacity:importing[c.id]?0.6:1
                          }}
                        >{importing[c.id]?"...":(existing?"Mettre à jour":"Importer →")}</button>
                        {importMsg[c.id] && (
                          <span style={{fontSize:10,color:importMsg[c.id].startsWith("✅")?"#10B981":"#EF4444"}}>
                            {importMsg[c.id]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );})}
                </div>
              </>
            )}

            {/* AI ANALYSIS */}
            {activeTab==="ai" && savedToken && (
              <AIQontoV m={m} />
            )}
          </>
        )}
      </>
    )}

    {/* FOOTER */}
    <div style={{
      marginTop:16,padding:"10px 14px",background:"#F8FAFC",
      borderRadius:8,display:"flex",alignItems:"center",
      gap:8,fontSize:11,color:"#94A3B8",flexWrap:"wrap"
    }}>
      <span style={{
        background:QT.gradient,WebkitBackgroundClip:"text",
        WebkitTextFillColor:"transparent",fontWeight:700
      }}>Qonto API v2</span>
      <span>•</span>
      <span>Lecture seule — GET /v2/client_invoices, /v2/quotes, /v2/clients</span>
    </div>
  </div>);
}
