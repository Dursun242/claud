'use client'
import { useState } from 'react'
import { useAttachments } from '../hooks/useAttachments'
import { useComments } from '../hooks/useComments'
import { useSharing } from '../hooks/useSharing'
import { useDetailView } from '../hooks/useDetailView'
import { useToast } from '../contexts/ToastContext'
import {
  Badge,
  ProgressBar,
  Section,
  FormField,
  inputStyle,
  selectStyle,
  Modal,
  AttachmentsSection,
  TemplateSelector,
} from '../components'

/**
 * Composant ProjectsDetailView
 * Vue détail d'un chantier avec tous les sous-éléments
 * Utilise les hooks Phase 3 pour attachments, commentaires, partage
 */
export default function ProjectsDetailView({
  chantier,
  allData,
  onBack,
  onSave,
  onDelete,
  onReload,
  m,
  user,
  phase,
  status,
  fmtDate,
  fmtMoney,
  pct,
  PBar,
  Badge: BadgeComp,
  generateOSPdf,
  generateOSExcel,
  generateCRPdf,
  generateCRExcel,
  SB,
  FF,
  inp,
  sel,
  btnP,
  btnS,
}) {
  const { addToast } = useToast()
  const { detailModal, detailForm, openDetailModal, closeDetailModal, updateDetailForm } =
    useDetailView()

  // Charger les données du chantier
  const { attachments, uploadAttachment, deleteAttachment } = useAttachments(
    'chantier',
    chantier?.id
  )
  const { comments, addComment, deleteComment } = useComments(
    'chantier',
    chantier?.id,
    user?.email
  )
  const { shares, addShare, deleteShare } = useSharing(chantier?.id)

  if (!chantier) return null

  // Get related data
  const chTasks = (allData.tasks || []).filter(
    (t) => (t.chantierId || t.chantier_id) === chantier.id
  )
  const chOS = (allData.ordresService || []).filter((o) => o.chantier_id === chantier.id)
  const chCR = (allData.compteRendus || []).filter(
    (c) => (c.chantierId || c.chantier_id) === chantier.id
  )
  const chPlanning = (allData.planning || []).filter(
    (p) => (p.chantierId || p.chantier_id) === chantier.id
  )

  // Intervenants
  const artisanNames = [...new Set(chOS.map((o) => o.artisan_nom).filter(Boolean))]
  const intervenants = artisanNames
    .map((name) => allData.contacts.find((c) => c.nom === name))
    .filter(Boolean)
  const clientContact = allData.contacts.find((c) => c.nom === chantier.client)

  const ratio = pct(chantier.depenses, chantier.budget)
  const budgetColor =
    ratio > 85 ? '#EF4444' : ratio > 60 ? '#F59E0B' : '#10B981'

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#3B82F6',
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 16,
          fontFamily: 'inherit',
          padding: 0,
        }}
      >
        ← Retour aux chantiers
      </button>

      {/* Header Card */}
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: m ? 16 : 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          borderLeft: `5px solid ${phase[chantier.phase] || '#3B82F6'}`,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 6,
                flexWrap: 'wrap',
              }}
            >
              <h1 style={{ margin: 0, fontSize: m ? 20 : 26, fontWeight: 700, color: '#0F172A' }}>
                {chantier.nom}
              </h1>
              <BadgeComp text={chantier.phase} color={phase[chantier.phase] || '#64748B'} />
              <BadgeComp text={chantier.statut} color={status[chantier.statut] || '#64748B'} />
            </div>
            <div style={{ fontSize: 14, color: '#64748B', marginBottom: 2 }}>{chantier.client}</div>
            <div style={{ fontSize: 13, color: '#94A3B8' }}>{chantier.adresse}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
              Du {fmtDate(chantier.date_debut || chantier.dateDebut)} au{' '}
              {fmtDate(chantier.date_fin || chantier.dateFin)}
            </div>
            {chantier.lots?.length > 0 && (
              <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 4 }}>
                Lots : {chantier.lots.join(', ')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                await SB.duplicateChantier(chantier)
                onReload()
              }}
              style={{ ...btnS, fontSize: 12, padding: '8px 14px' }}
            >
              Dupliquer
            </button>
            <button
              onClick={() => {
                /* Edit modal */
              }}
              style={{ ...btnS, fontSize: 12, padding: '8px 14px' }}
            >
              Modifier
            </button>
            <button
              onClick={() => openDetailModal('share')}
              style={{ ...btnS, fontSize: 12, padding: '8px 14px' }}
            >
              👥 Partager
            </button>
          </div>
        </div>

        {/* Budget bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 12 }}>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>
                Budget
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
                {fmtMoney(chantier.budget)}
              </div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>
                Dépensé
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: budgetColor }}>
                {fmtMoney(chantier.depenses)}
              </div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>
                Reste
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
                {fmtMoney(chantier.budget - chantier.depenses)}
              </div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>
                Avancement
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: budgetColor }}>{ratio}%</div>
            </div>
          </div>
          <PBar value={chantier.depenses} max={chantier.budget} color={budgetColor} h={10} />
        </div>
      </div>

      {/* Attachments using Phase 2 component */}
      <AttachmentsSection
        attachments={attachments}
        onUpload={uploadAttachment}
        onDelete={deleteAttachment}
      />

      {/* Commentaires using Phase 2 component */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
          💬 Commentaires ({comments.length})
        </h4>
        <div style={{ marginBottom: 12 }}>
          {comments.map((comment) => (
            <div
              key={comment.id}
              style={{
                background: '#F8FAFC',
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong style={{ color: '#0F172A' }}>{comment.author_name}</strong>
                <button
                  onClick={() => deleteComment(comment.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#EF4444',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  🗑️
                </button>
              </div>
              <p style={{ margin: '0 0 4px 0', color: '#475569' }}>{comment.content}</p>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>
                {new Date(comment.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            placeholder="Ajouter un commentaire..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                addComment(e.target.value)
                e.target.value = ''
              }
            }}
            style={{
              flex: 1,
              padding: 8,
              border: '1px solid #E2E8F0',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: 60,
            }}
          />
          <button
            onClick={(e) => {
              const textarea = e.target.parentElement.querySelector('textarea')
              addComment(textarea.value)
              textarea.value = ''
            }}
            style={{
              background: '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Envoyer
          </button>
        </div>
      </div>

      {/* Sharing using Phase 2 component */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
          🔗 Partage ({shares.length})
        </h4>
        <div style={{ marginBottom: 12 }}>
          {shares.map((share) => (
            <div
              key={share.id}
              style={{
                background: '#F8FAFC',
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 12,
              }}
            >
              <div>
                <strong style={{ color: '#0F172A' }}>{share.shared_with_email}</strong>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>{share.permission}</div>
              </div>
              <button
                onClick={() => deleteShare(share.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#EF4444',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="email@example.com"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addShare(e.target.value)
                e.target.value = ''
              }
            }}
            style={{
              flex: 1,
              minWidth: 150,
              padding: '8px 12px',
              border: '1px solid #E2E8F0',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
          <select
            defaultValue="view"
            onChange={(e) => {
              const email = e.target.parentElement.querySelector('input').value
              if (email) {
                addShare(email, e.target.value)
                e.target.parentElement.querySelector('input').value = ''
              }
            }}
            style={{
              padding: '8px 12px',
              border: '1px solid #E2E8F0',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            <option value="view">Lecture</option>
            <option value="edit">Édition</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={(e) => {
              const input = e.target.parentElement.querySelector('input')
              const select = e.target.parentElement.querySelector('select')
              addShare(input.value, select.value)
              input.value = ''
            }}
            style={{
              background: '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Partager
          </button>
        </div>
      </div>
    </div>
  )
}
