'use client'
export default function ContactsV({ data, save, reload }) {
  return <div style={{ color: '#E2E8F0', padding: '20px' }}><h1>👥 Contacts</h1><p>{data?.contacts?.length || 0} contacts</p></div>
}
