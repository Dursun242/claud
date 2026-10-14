// Route /api/clients/invite — rattacher un client à un chantier par son
// adresse email (souvent Gmail), depuis la fiche chantier (migration 048).
// Réservée au staff (verifyStaff).
//   POST { chantierId, email, envoyer } →
//     - compte client autorisé (authorized_users, rôle client, actif) : il
//       peut se connecter avec Google ; une adresse de l'équipe est refusée ;
//     - adresse gardée sur le chantier (chantiers.client_email) ; si le
//       client s'est déjà connecté une fois, chantier rattaché tout de suite
//       (client_user_id), sinon à sa première connexion (link_my_chantiers) ;
//     - mail d'invitation si `envoyer` (SMTP configuré).
//   → { ok, linked, invited }

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import { smtpConfig, sendMail, smtpErrorMessage } from '@/app/lib/mailer'
import { devisMailHtml } from '@/app/lib/devisMailHtml'
import { COMPANY } from '@/app/lib/company'
import { LOGO_CID, LOGO_PNG_BASE64 } from '@/app/lib/companyLogo'
import { cleanEmail, namesFor, inviteMailText } from '@/app/lib/clientInvite'

const log = createLogger('clients-invite')
const UUID_RE = /^[0-9a-f-]{36}$/i
const fail = (error, status = 400, code) => Response.json({ error, ...(code ? { code } : {}) }, { status })
const missingColumn = (err) => /client_email/.test(err?.message || '') && /column|schema cache/i.test(err?.message || '')

/** Compte Supabase déjà créé pour cette adresse (première connexion faite). */
async function authUserId(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const users = data?.users || []
    const u = users.find(x => String(x.email || '').toLowerCase() === email)
    if (u) return u.id
    if (users.length < 200) return null
  }
  return null
}

export async function POST(request) {
  try {
    const { user, status } = await verifyStaff(request)
    if (!user) return fail(status === 403 ? 'Réservé à l’équipe' : 'Non autorisé', status)
    const body = await request.json().catch(() => ({}))
    const chantierId = String(body.chantierId || '')
    if (!UUID_RE.test(chantierId)) return fail('Chantier requis')
    const email = cleanEmail(body.email)
    if (!email) return fail('Adresse email invalide.')

    const admin = adminClient()
    const { data: ch, error: chErr } = await admin.from('chantiers').select('id, nom, client, client_user_id').eq('id', chantierId).maybeSingle()
    if (chErr || !ch) return fail('Chantier introuvable.', 404)

    // Compte client autorisé (jamais un compte de l'équipe)
    const { data: existing } = await admin.from('authorized_users').select('id, role, actif, prenom').eq('email', email).maybeSingle()
    if (existing && existing.role !== 'client') return fail('Cette adresse est celle d’un compte de l’équipe.', 409)
    const names = namesFor(ch.client, email)
    if (!existing) {
      const { error } = await admin.from('authorized_users').insert({ email, ...names, role: 'client', actif: true })
      if (error) { log.error('compte client', error.message); return fail('Compte client non créé.', 500) }
    } else if (!existing.actif || existing.prenom === 'DémoMOA') {
      // Compte désactivé, ou créé en visite de démo (limité aux chantiers de démo) : vrai client
      await admin.from('authorized_users').update({ actif: true, ...(existing.prenom === 'DémoMOA' ? names : {}) }).eq('id', existing.id)
    }

    // Adresse sur le chantier ; rattachement immédiat si le client s'est déjà connecté
    const uid = await authUserId(admin, email)
    const patch = { client_email: email, ...(uid ? { client_user_id: uid } : {}) }
    const { error: uErr } = await admin.from('chantiers').update(patch).eq('id', chantierId)
    if (uErr) {
      if (missingColumn(uErr)) return fail('Rattachement par adresse : appliquer la migration 048 (Supabase).', 503, 'MIGRATION_048')
      log.error('chantier', uErr.message)
      return fail('Chantier non mis à jour.', 500)
    }

    let invited = false
    if (body.envoyer) {
      const cfg = smtpConfig()
      if (cfg) {
        const url = new URL(request.url).origin
        const subject = `Suivi de votre chantier${ch.nom ? ` « ${ch.nom} »` : ''}`
        const text = inviteMailText({ client: ch.client, chantier: ch.nom, email, url, company: COMPANY })
        try {
          await sendMail(cfg, {
            to: email, subject, text,
            html: devisMailHtml({
              body: text.split('\n\n').filter(p => !p.includes(url)).join('\n\n'), company: COMPANY, title: subject, logoSrc: `cid:${LOGO_CID}`,
              action: { url, label: 'Suivre mon chantier', hint: `Connexion avec votre compte Google (${email}).` },
            }),
            attachments: [{ filename: 'logo-id-maitrise.png', content: Buffer.from(LOGO_PNG_BASE64, 'base64'), contentType: 'image/png', cid: LOGO_CID, contentDisposition: 'inline' }],
          })
          invited = true
        } catch (e) {
          log.warn('invitation', `${e?.code || ''} ${e?.message || e}`)
          return Response.json({ ok: true, linked: !!uid, invited: false, mailError: smtpErrorMessage(e) })
        }
      }
    }
    return Response.json({ ok: true, linked: !!uid, invited })
  } catch (err) {
    log.error('invitation client', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}
