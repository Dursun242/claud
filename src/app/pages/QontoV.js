'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { LocalDB, SB, fmtDate, fmtMoney, inp, sel, ApiBadge } from '../dashboards/shared'
import { Badge } from '../components'
import AIQontoV from './AIQontoV'

const QT = { primary:"#7C3AED", light:"#F5F3FF", border:"#DDD6FE", gradient:"linear-gradient(135deg,#7C3AED,#A855F7,#C084FC)" };

function QontoBadge() {
  return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,background:QT.gradient,color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.1em"}}>API</span>;
}

export default function QontoV({m, data, reload}) {
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

  // Charge le token depuis Supabase (cross-device), fallback localStorage
  useEffect(() => {
    (async () => {
      try {
        const { data: row } = await supabase.from('settings').select('value').eq('key','qonto-token').single();
        const t = row?.value;
        if (t && t.includes(":")) { setSavedToken(t); setToken(t); return; }
      } catch {}
      // Fallback localStorage
      const t = LocalDB.get("qonto-token");
      if (t && t.includes(":")) { setSavedToken(t); setToken(t); }
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
    // Sauvegarde dans Supabase ET localStorage
    await supabase.from('settings').upsert({ key: 'qonto-token', value: t });
    LocalDB.set("qonto-token", t);
    setSavedToken(t);
    fetchAll(t);
  };

  const disconnect = async () => {
    await supabase.from('settings').delete().eq('key','qonto-token');
    LocalDB.set("qonto-token", "");
    setSavedToken(""); setToken(""); setConnected(false); setError("");
    setInvoices([]); setQuotes([]); setClients([]);
  };

  const fetchQonto = async (endpoint, tk) => {
    const res = await fetch(`/api/qonto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, token: tk })
    });
    if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || `Qonto ${res.status}`); }
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

  // ── Téléchargement PDF ──
  const downloadPdf = async (item, type) => {
    // 1. Champs directs possibles selon la version de l'API Qonto
    const directUrl = item.pdf_url || item.file_url || item.pdf_download_url
      || item.attachment?.url || item.file?.url || item.document_url
      || item.attachments?.[0]?.url;
    if (directUrl) { window.open(directUrl, "_blank"); return; }

    try {
      // 2. Récupération du détail complet
      const endpoint = type === "invoice" ? `client_invoices/${item.id}` : `quotes/${item.id}`;
      const detail = await fetchQonto(endpoint, savedToken);
      const doc = detail.client_invoice || detail.quote || detail;

      const docUrl = doc.pdf_url || doc.file_url || doc.pdf_download_url
        || doc.attachment?.url || doc.file?.url || doc.document_url
        || doc.attachments?.[0]?.url;
      if (docUrl) { window.open(docUrl, "_blank"); return; }

      // 3. Qonto stocke parfois le PDF dans un attachment séparé via attachment_ids
      const attId = doc.attachment_ids?.[0] || doc.attachment_id;
      if (attId) {
        const att = await fetchQonto(`attachments/${attId}`, savedToken);
        const attUrl = att.attachment?.url || att.url || att.file_url || att.file?.url;
        if (attUrl) { window.open(attUrl, "_blank"); return; }
      }

      alert("PDF non disponible via l'API Qonto pour ce document.");
    } catch(e) { alert("Erreur récupération PDF : " + e.message); }
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

  const invStatusColor = { draft:"#94A3B8", finalized:"#3B82F6", sent:"#8B5CF6", paid:"#10B981", canceled:"#EF4444", unpaid:"#F59E0B", pending:"#F59E0B" };
  const invStatusFr = { draft:"Brouillon", finalized:"Finalisée", sent:"Envoyée", paid:"Payée", canceled:"Annulée", unpaid:"Impayée", pending:"En attente" };
  const quoStatusColor = { pending_approval:"#F59E0B", approved:"#10B981", canceled:"#EF4444", draft:"#94A3B8" };
  const quoStatusFr = { pending_approval:"En attente", approved:"Approuvé", canceled:"Annulé", draft:"Brouillon" };

  // Qonto renvoie total_amount.value (string) ou total_amount_cents (int) selon la version
  const getAmt = (inv) => parseFloat(inv.total_amount?.value ?? (inv.total_amount_cents||0)/100) || 0;
  const paidInvoices = invoices.filter(i => i.status==="paid");
  const unpaidInvoices = invoices.filter(i => ["sent","finalized","unpaid","pending"].includes(i.status));
  const totalPaid = paidInvoices.reduce((s,i) => s + getAmt(i), 0);
  const totalUnpaid = unpaidInvoices.reduce((s,i) => s + getAmt(i), 0);

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
        <p style={{margin:"0 0 4px",fontSize:13,color:"#64748B"}}>Entrez votre clé API Qonto au format :</p>
        <p style={{margin:"0 0 12px",fontSize:13,fontWeight:700,color:"#7C3AED",fontFamily:"monospace"}}>login:secret-key</p>
        <p style={{margin:"0 0 16px",fontSize:11,color:"#94A3B8"}}>Trouvez-la dans Qonto → Paramètres → Intégrations → API</p>
        <input value={token} onChange={e=>setToken(e.target.value)} placeholder="exemple: mon-login:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" type="password"
          style={{...inp,maxWidth:420,margin:"0 auto 12px",display:"block",textAlign:"center",fontSize:12,borderColor:QT.border}} />
        <button onClick={saveToken} style={{padding:"10px 28px",borderRadius:8,background:QT.gradient,color:"#fff",border:"none",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(124,58,237,0.3)"}}>Connecter</button>
        <p style={{margin:"12px 0 0",fontSize:11,color:"#94A3B8"}}>Le token est stocké localement sur votre appareil uniquement.</p>
      </div>
    ) : (
      <>
        {/* CONNECTION STATUS */}
        <div style={{background:connected?"#F0FDF4":"#FEF2F2",border:`1.5px solid ${connected?"#BBF7D0":"#FECACA"}`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:connected?"#22C55E":"#EF4444",animation:connected?"pulseGlow 2s infinite":"none",flexShrink:0}}/>
            <span style={{fontWeight:600,color:connected?"#166534":"#991B1B"}}>{connected?"Connecté":"Échec de connexion"}</span>
            {connected && <span style={{color:"#64748B"}}>• {savedToken.split(":")[0]}</span>}
            <span style={{marginLeft:"auto",color:QT.primary,cursor:"pointer",fontWeight:600,fontSize:11}} onClick={()=>fetchAll(savedToken)}>Rafraîchir</span>
            <span style={{color:"#94A3B8",cursor:"pointer",fontSize:11}} onClick={disconnect}>Changer de compte</span>
          </div>
          {error && (
            <div style={{marginTop:8,background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:"8px 10px"}}>
              <div style={{color:"#DC2626",fontWeight:600,marginBottom:4}}>❌ {error}</div>
              {error.includes("401") && (
                <div style={{color:"#64748B",fontSize:11,lineHeight:1.6}}>
                  <b>Vérifiez vos identifiants Qonto :</b><br/>
                  1. Allez dans <b>Qonto → Paramètres → Intégrations → API</b><br/>
                  2. Copiez le <b>Login</b> et la <b>Secret key</b><br/>
                  3. Cliquez <b>"Changer de compte"</b> et entrez : <code style={{background:"#F1F5F9",padding:"1px 4px",borderRadius:3}}>votre-login:votre-secret-key</code>
                </div>
              )}
            </div>
          )}
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
                {l:"À encaisser",v:fmtMoney(totalUnpaid),c:totalUnpaid>0?"#EF4444":"#10B981"},
              ].map((k,i)=>(
                <div key={i} style={{background:"#fff",borderRadius:12,padding:m?12:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderTop:`3px solid ${k.c}`}}>
                  <div style={{fontSize:10,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",marginBottom:4}}>{k.l}</div>
                  <div style={{fontSize:m?18:24,fontWeight:700,color:k.c}}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* SUB-TABS */}
            <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
              {[{k:"factures",l:`Factures (${invoices.length})`},{k:"devis",l:`Devis (${quotes.length})`},{k:"clients",l:`Clients (${clients.length})`},{k:"ai",l:"🤖 Analyse IA"}].map(t=>(
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
                    <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                      <div style={{fontSize:16,fontWeight:700,color:inv.status==="paid"?"#10B981":"#0F172A"}}>{fmtMoney(getAmt(inv))}</div>
                      {(inv.vat_amount?.value||inv.vat_amount_cents) && <div style={{fontSize:10,color:"#94A3B8"}}>TVA: {fmtMoney(parseFloat(inv.vat_amount?.value??(inv.vat_amount_cents||0)/100))}</div>}
                      <button onClick={()=>downloadPdf(inv,"invoice")} style={{background:"#EF4444",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#fff"}}>⬇ PDF</button>
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
                      <div style={{fontSize:16,fontWeight:700,color:"#0F172A"}}>{fmtMoney(parseFloat(q.total_amount?.value??(q.total_amount_cents||0)/100)||0)}</div>
                      <button onClick={()=>downloadPdf(q,"quote")} style={{background:"#EF4444",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#fff",marginTop:4}}>⬇ PDF</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CLIENTS LIST */}
            {activeTab==="clients" && (
              <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:10}}>
                {clients.length===0 ? <p style={{color:"#94A3B8",fontSize:13,textAlign:"center",padding:20,gridColumn:"1/-1"}}>Aucun client trouvé</p> :
                clients.map(c=>{
                  const nom = c.name||`${c.first_name||""} ${c.last_name||""}`.trim();
                  const siret = c.siret || null;
                  const existBySiret = siret && (data?.contacts||[]).find(x=>x.siret===siret);
                  const existByName = (data?.contacts||[]).find(x=>(x.nom||"").toLowerCase()===nom.toLowerCase());
                  const existing = existBySiret || existByName;
                  return (
                  <div key={c.id} style={{background:"#fff",borderRadius:10,padding:14,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",borderLeft:`4px solid ${existing?"#10B981":c.kind==="company"?"#7C3AED":"#3B82F6"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                          <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{nom}</span>
                          <Badge text={c.kind==="company"?"Entreprise":"Particulier"} color={c.kind==="company"?"#7C3AED":"#3B82F6"}/>
                          {existing && <Badge text="Dans l'annuaire" color="#10B981"/>}
                        </div>
                        {c.email && <div style={{fontSize:11,color:"#64748B"}}>{c.email}</div>}
                        {c.phone_number && <div style={{fontSize:11,color:"#94A3B8"}}>{c.phone_number}</div>}
                        {c.billing_address?.street_address && <div style={{fontSize:10,color:"#CBD5E1",marginTop:2}}>{c.billing_address.street_address} {c.billing_address.zip_code} {c.billing_address.city}</div>}
                        {siret && <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>SIRET : {siret}</div>}
                        {existBySiret && <div style={{fontSize:10,color:"#10B981",marginTop:2}}>✓ SIRET identique à : {existBySiret.nom}</div>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                        <button
                          onClick={()=>importClient(c)}
                          disabled={!!importing[c.id]}
                          style={{background:existing?"#10B981":"#7C3AED",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff",whiteSpace:"nowrap",opacity:importing[c.id]?0.6:1}}
                        >{importing[c.id]?"...":(existing?"Mettre à jour":"Importer →")}</button>
                        {importMsg[c.id] && <span style={{fontSize:10,color:importMsg[c.id].startsWith("✅")?"#10B981":"#EF4444"}}>{importMsg[c.id]}</span>}
                      </div>
                    </div>
                  </div>
                );})}
              </div>
            )}

            {/* AI ANALYSIS */}
            {activeTab==="ai" && savedToken && (
              <AIQontoV qontoToken={savedToken} m={m} />
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
