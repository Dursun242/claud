'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { SB, Icon, I, ApiBadge, inp, btnP, COMPANY } from '../dashboards/shared'
import { MicButtonInline } from '../components'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../supabaseClient'

// Message d'accueil de l'assistant (identique après un reset)
const WELCOME_MESSAGE = {
  role: "assistant",
  content: `Bonjour ${COMPANY.gerant} ! Je suis l'assistant IA d'**ID Maîtrise**.\n\nJe peux tout faire :\n• **"Crée un OS pour le chantier Friboulet, artisan Lefèvre..."** → Ordre de Service\n• **"Rédige un CR pour Les Voiles, présents : Lefèvre, Costa..."** → Compte Rendu\n• **"Nouveau chantier Villa Dupont, budget 200 000€..."** → Chantier\n• **"Ajoute une tâche urgente..."** → Tâche\n• **"Résumé avancement du chantier Les Voiles"** → Analyse\n\nParlez ou tapez !`,
}

// Prépare un résumé des données pour l'IA — évite d'envoyer les champs inutiles ou trop lourds
function prepareDataForAI(data) {
  if (!data) return {}
  return {
    chantiers: (data.chantiers || []).map(c => ({
      id: c.id, nom: c.nom, client: c.client, adresse: c.adresse,
      phase: c.phase, statut: c.statut, budget: c.budget,
      dateDebut: c.date_debut, dateFin: c.date_fin, lots: c.lots,
    })),
    contacts: (data.contacts || []).map(c => ({
      id: c.id, nom: c.nom, type: c.type, specialite: c.specialite,
      tel: c.tel, email: c.email, siret: c.siret,
    })),
    tasks: (data.tasks || []).slice(0, 50).map(t => ({
      id: t.id, chantier_id: t.chantier_id, titre: t.titre,
      priorite: t.priorite, statut: t.statut, echeance: t.echeance, lot: t.lot,
    })),
    compteRendus: (data.compteRendus || []).slice(0, 20).map(cr => ({
      id: cr.id, chantier_id: cr.chantier_id, date: cr.date, numero: cr.numero,
      resume: cr.resume?.slice(0, 200),
    })),
    ordresService: (data.ordresService || []).slice(0, 20).map(os => ({
      id: os.id, numero: os.numero, chantier_id: os.chantier_id,
      artisan_nom: os.artisan_nom, statut: os.statut, date_emission: os.date_emission,
    })),
  }
}

export default function AIV({data,save,m,externalTranscript,clearExternal,reload}) {
  const { addToast } = useToast();
  const [messages,setMessages]=useState([WELCOME_MESSAGE]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [listening,setListening]=useState(false);
  const recognRef = useRef(null);
  const endRef=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  // Auto-focus à l'ouverture de la page
  useEffect(() => { inputRef.current?.focus(); }, []);

  const resetConversation = () => {
    setMessages([WELCOME_MESSAGE]);
    setInput("");
    addToast("Nouvelle conversation", "info");
    inputRef.current?.focus();
  };

  // Pick up transcript from floating mic
  useEffect(() => {
    if (externalTranscript && externalTranscript.trim()) {
      setInput(externalTranscript);
      if (clearExternal) clearExternal();
    }
  }, [externalTranscript, clearExternal]);

  // ─── SPEECH RECOGNITION ───
  const startListening = useCallback(() => {
    const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!SR) { addToast("Reconnaissance vocale non supportée. Utilise Chrome ou Safari.", "warning"); return; }

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
  }, [listening, addToast]);

  const sendMessage = async () => {
    if (!input.trim()||loading) return;
    const userMsg=input.trim(); setInput("");
    if (listening && recognRef.current) { recognRef.current.stop(); setListening(false); }
    setMessages(prev=>[...prev,{role:"user",content:userMsg}]); setLoading(true);

    try {
      const sys = `Tu es l'assistant IA d'ID Maîtrise, maîtrise d'œuvre BTP au Havre (9 Rue Henry Genestal, 76600). Le gérant est Dursun. Tu gères le quotidien des chantiers.

DONNÉES ACTUELLES (Supabase): ${JSON.stringify(prepareDataForAI(data),null,0)}

TU PEUX TOUT FAIRE :
1. Créer des chantiers, tâches, contacts, comptes rendus (CR), ordres de service (OS)
2. Résumer l'avancement d'un chantier (budget consommé, tâches en cours)
3. Lister, rechercher et analyser toutes les données

RÈGLE ABSOLUE : Lorsque l'utilisateur te demande de créer ou modifier quelque chose (OS, CR, chantier, tâche, contact), tu DOIS OBLIGATOIREMENT inclure un bloc action dans ta réponse. Sans ce bloc, rien n'est enregistré en base de données.

FORMAT OBLIGATOIRE DU BLOC ACTION (copie exactement cette syntaxe) :
<<<ACTION>>>
{"type":"...", "data":{...}}
<<<END_ACTION>>>

TYPES D'ACTIONS DISPONIBLES :

add_chantier: {"type":"add_chantier","data":{"nom":"...","client":"...","adresse":"...","phase":"...","statut":"Planifié","budget":0,"dateDebut":"YYYY-MM-DD","dateFin":"YYYY-MM-DD","lots":["..."]}}

add_task: {"type":"add_task","data":{"chantier_id":"UUID-DU-CHANTIER","titre":"...","priorite":"Urgent","statut":"Planifié","echeance":"YYYY-MM-DD","lot":"..."}}

add_contact: {"type":"add_contact","data":{"nom":"...","type":"Artisan","specialite":"...","tel":"...","email":"...","adresse":"...","siret":"...","notes":"..."}}

update_contact: {"type":"update_contact","data":{"id":"UUID-EXISTANT","nom":"...","type":"...","specialite":"...","tel":"...","email":"...","adresse":"...","siret":"...","notes":"..."}}

add_cr: {"type":"add_cr","data":{"chantier_id":"UUID-DU-CHANTIER","date":"YYYY-MM-DD","numero":1,"resume":"...","participants":"Nom1, Nom2","decisions":"..."}}

update_cr: {"type":"update_cr","data":{"id":"UUID-EXISTANT","chantier_id":"UUID-DU-CHANTIER","date":"YYYY-MM-DD","numero":1,"resume":"...","participants":"...","decisions":"..."}}

add_os: {"type":"add_os","data":{"numero":"OS-2026-001","chantier_id":"UUID-DU-CHANTIER","client_nom":"...","client_adresse":"...","artisan_nom":"...","artisan_specialite":"...","artisan_tel":"...","artisan_email":"...","artisan_siret":"...","date_emission":"YYYY-MM-DD","date_intervention":"YYYY-MM-DD","date_fin_prevue":"YYYY-MM-DD","prestations":[{"description":"...","unite":"m²","quantite":10,"prix_unitaire":45.00,"tva_taux":20}],"observations":"...","conditions":"Paiement à 30 jours.","statut":"Émis"}}

update_os: {"type":"update_os","data":{"id":"UUID-EXISTANT","numero":"OS-2026-001","chantier_id":"UUID-DU-CHANTIER","client_nom":"...","artisan_nom":"...","artisan_specialite":"...","artisan_tel":"...","artisan_email":"...","artisan_siret":"...","date_emission":"YYYY-MM-DD","date_intervention":"YYYY-MM-DD","date_fin_prevue":"YYYY-MM-DD","prestations":[{"description":"...","unite":"m²","quantite":10,"prix_unitaire":45.00,"tva_taux":20}],"observations":"...","conditions":"...","statut":"..."}}

RÈGLES :
- Réponds TOUJOURS en français, concis et professionnel
- Utilise TOUJOURS les vrais UUID des chantiers/contacts présents dans les données ci-dessus
- Pour les OS, les montants (montant_ht, montant_tva, montant_ttc) sont calculés automatiquement par le système depuis les prestations — ne les inclus pas dans le JSON
- Si le chantier demandé n'existe pas dans les données, indique-le clairement
- Le bloc <<<ACTION>>> doit contenir un JSON valide sur une seule ligne ou multiligne — pas de commentaires ni de texte dans le JSON
- Quand on te demande un résumé/avancement, analyse les données et donne un point clair sans bloc action`;


      // JWT Supabase requis par /api/claude pour éviter que n'importe qui
      // avec l'URL puisse drainer notre quota Anthropic.
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/claude", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization": `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:4000, system:sys,
          messages:messages.filter((m,i)=>m.role!=="assistant"||i>0).concat([{role:"user",content:userMsg}]).map(m=>({role:m.role,content:m.content})),
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erreur API (${response.status}) : ${errText.slice(0,200)}`);
      }
      const result = await response.json();
      let text = result.content?.map(c=>c.text||"").join("\n") || "Désolé, erreur.";

      const act = text.match(/<<<ACTION>>>([\s\S]*?)<<<END_ACTION>>>/);
      if (act) {
        try {
          const a=JSON.parse(act[1].trim());
          let actionLabel = "";

          // Tague le prochain log SB.upsert avec source=ai : évite
          // de créer 2 entrées (le log métier + un "ai_action") et
          // permet de filtrer après coup dans LogsV via metadata.
          SB.setLogContext({ source: 'ai', action_type: a.type });
          try {
            if(a.type==="add_chantier") { await SB.upsertChantier(a.data); actionLabel="Chantier créé"; }
            else if(a.type==="add_task") { await SB.upsertTask(a.data); actionLabel="Tâche créée"; }
            else if(a.type==="add_contact") { await SB.upsertContact(a.data); actionLabel="Contact créé"; }
            else if(a.type==="update_contact") { await SB.upsertContact(a.data); actionLabel="Contact mis à jour"; }
            else if(a.type==="add_cr") { await SB.upsertCR(a.data); actionLabel="Compte rendu créé"; }
            else if(a.type==="update_cr") { await SB.upsertCR(a.data); actionLabel="Compte rendu mis à jour"; }
            else if(a.type==="add_os" || a.type==="update_os") {
              const prests = a.data.prestations || [];
              let ht=0, tva=0;
              prests.forEach(p => { const l=(parseFloat(p.quantite)||0)*(parseFloat(p.prix_unitaire)||0); ht+=l; tva+=l*(parseFloat(p.tva_taux)||20)/100; });
              await SB.upsertOS({ ...a.data, montant_ht:ht, montant_tva:tva, montant_ttc:ht+tva });
              actionLabel = a.type==="update_os" ? "Ordre de Service mis à jour" : "Ordre de Service créé";
            }
          } finally {
            SB.clearLogContext();
          }
          if(reload) await reload();
          text=text.replace(/<<<ACTION>>>[\s\S]*?<<<END_ACTION>>>/,"").trim()+`\n\n✅ **${actionLabel} dans Supabase !**`;
          if (actionLabel) addToast(actionLabel, "success");
        } catch(err) {
          console.error("❌ Action error:", err);
          text=text.replace(/<<<ACTION>>>[\s\S]*?<<<END_ACTION>>>/,"").trim()+`\n\n❌ **Erreur Supabase :** ${err.message}`;
          addToast("Erreur : " + err.message, "error");
        }
      }
      setMessages(prev=>[...prev,{role:"assistant",content:text}]);
    } catch(err) {
      setMessages(prev=>[...prev,{role:"assistant",content:`❌ Erreur : ${err.message}`}]);
    }
    setLoading(false); inputRef.current?.focus();
  };

  const renderMd = text => (
    <ReactMarkdown components={{
      p: ({node, ...props}) => <p style={{margin:"0 0 6px 0"}} {...props}/>,
      strong: ({node, ...props}) => <strong style={{fontWeight:700}} {...props}/>,
      em: ({node, ...props}) => <em style={{fontStyle:"italic"}} {...props}/>,
      ul: ({node, ...props}) => <ul style={{marginLeft:"20px",marginTop:0,marginBottom:"6px"}} {...props}/>,
      ol: ({node, ...props}) => <ol style={{marginLeft:"20px",marginTop:0,marginBottom:"6px"}} {...props}/>,
      code: ({node, inline, ...props}) => inline
        ? <code style={{background:"#F1F5F9",padding:"2px 6px",borderRadius:4,fontSize:"0.9em",fontFamily:"monospace"}} {...props}/>
        : <pre style={{background:"#F1F5F9",padding:"10px",borderRadius:6,overflow:"auto",marginTop:"6px",marginBottom:"6px"}}><code {...props}/></pre>,
      a: ({node, ...props}) => <a style={{color:"#3B82F6",textDecoration:"underline",cursor:"pointer"}} target="_blank" rel="noopener noreferrer" {...props}/>
    }}>
      {text}
    </ReactMarkdown>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",height:m?"calc(100vh - 76px)":"calc(100vh - 48px)"}}>
      <div style={{marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Assistant IA</h1>
            <ApiBadge/>
          </div>
          <p style={{margin:"2px 0 0",fontSize:12,color:"#64748B"}}>
            Parlez ou tapez — {messages.length - 1} message{messages.length-1>1?"s":""} dans cette conversation
          </p>
        </div>
        {messages.length > 1 && (
          <button onClick={resetConversation} title="Effacer la conversation et recommencer" style={{
            background:"#F1F5F9",border:"1px solid #E2E8F0",borderRadius:8,
            padding:"6px 12px",fontSize:11,fontWeight:600,color:"#475569",
            cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:4,
          }}>
            ↻ Nouvelle conversation
          </button>
        )}
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
        {loading && (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:10}}>
            <div style={{display:"flex",gap:5}}>
              {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#94A3B8",animation:`pulse 1.4s ease-in-out ${i*.2}s infinite`}}/>)}
            </div>
            <span style={{fontSize:11,color:"#94A3B8",fontStyle:"italic"}}>Claude réfléchit…</span>
          </div>
        )}
        <div ref={endRef}/>
      </div>

      {/* INPUT + MIC — textarea pour autoriser les retours à la ligne avec Shift+Enter */}
      <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
        <MicButtonInline listening={listening} onClick={startListening} />
        <textarea
          ref={inputRef}
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
          }}
          rows={1}
          placeholder={listening?"🎙️ Je vous écoute…":"Tape ou appuie sur le micro · Shift+Entrée = nouvelle ligne"}
          style={{
            ...inp,flex:1,padding:"12px 16px",fontSize:14,borderRadius:12,
            background:listening?"#FEF2F2":"#fff",
            borderColor:listening?"#FECACA":"#E2E8F0",
            boxShadow:"0 1px 3px rgba(0,0,0,0.06)",
            resize:"none",minHeight:46,maxHeight:140,
            fontFamily:"inherit",lineHeight:1.4,
          }}
        />
        <button onClick={sendMessage} disabled={loading||!input.trim()} style={{...btnP,padding:"12px 16px",borderRadius:12,opacity:(loading||!input.trim())?.6:1,display:"flex",alignItems:"center",gap:5}}>
          <Icon d={I.send} size={16} color="#fff"/>{!m&&"Envoyer"}
        </button>
      </div>

      {/* QUICK ACTIONS — suggestions cliquables */}
      <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
        {[
          {t:"Crée un OS pour…",           c:"#8B5CF6"},
          {t:"Rédige un CR pour…",          c:"#3B82F6"},
          {t:"Résumé avancement chantiers", c:"#10B981"},
          {t:"Tâches urgentes",             c:"#EF4444"},
          {t:"Crée un RDV demain",          c:"#F59E0B"},
          {t:"Liste artisans actifs",       c:"#6366F1"},
        ].map(q=>(
          <button
            key={q.t}
            onClick={()=>{setInput(q.t); inputRef.current?.focus();}}
            style={{
              padding:"5px 12px",borderRadius:16,
              border:`1px solid ${q.c}33`,
              background:`${q.c}0A`,
              color:q.c,fontSize:11,fontWeight:500,
              cursor:"pointer",fontFamily:"inherit",
            }}
          >{q.t}</button>
        ))}
      </div>
    </div>
  );
}
