// Base Supabase en mémoire pour les tests de routes (service role) :
// tables (select / insert / update / delete, filtres eq / gt / in / is,
// order, limit, single, maybeSingle) et stockage (URL de dépôt signée,
// download, remove, URL signée). Pas un test : utilitaire.

export function memoryDb(seed = {}, { errors = {} } = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map(r => ({ ...r }))]))
  const files = new Map()
  let n = 0

  function query(table) {
    const st = { op: 'select', filters: [], order: null, limit: null, values: null }
    const rows = () => (tables[table] ||= [])
    const match = (r) => st.filters.every(([op, k, v]) => (
      op === 'eq' ? r[k] === v
        : op === 'gt' ? String(r[k] ?? '') > String(v)
          : op === 'in' ? v.includes(r[k])
            : op === 'is' ? (r[k] ?? null) === v : true))
    const exec = (single) => {
      if (errors[table]) return { data: null, error: errors[table] }
      let out
      if (st.op === 'insert') {
        const list = (Array.isArray(st.values) ? st.values : [st.values]).map(v => {
          n += 1
          return { id: `id${n}`, created_at: new Date(Date.UTC(2026, 9, 3, 8, 0, n)).toISOString(), ...v }
        })
        rows().push(...list)
        out = list
      } else if (st.op === 'update') {
        out = rows().filter(match)
        out.forEach(r => Object.assign(r, st.values))
      } else if (st.op === 'delete') {
        out = rows().filter(match)
        tables[table] = rows().filter(r => !match(r))
      } else {
        out = rows().filter(match)
        if (st.order) {
          const [k, asc] = st.order
          out = [...out].sort((a, b) => (String(a[k]) > String(b[k]) ? 1 : String(a[k]) < String(b[k]) ? -1 : 0) * (asc ? 1 : -1))
        }
        if (st.limit != null) out = out.slice(0, st.limit)
      }
      out = out.map(r => ({ ...r }))
      if (single === 'single') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: `${out.length} lignes` } }
      if (single === 'maybe') return { data: out[0] || null, error: null }
      return { data: out, error: null }
    }
    const b = {
      select() { return b },
      insert(v) { st.op = 'insert'; st.values = v; return b },
      upsert(v, { onConflict = 'id' } = {}) {
        const existing = rows().find(r => r[onConflict] === v[onConflict])
        if (existing) { st.op = 'update'; st.values = v; st.filters.push(['eq', onConflict, v[onConflict]]) } else { st.op = 'insert'; st.values = v }
        return b
      },
      update(v) { st.op = 'update'; st.values = v; return b },
      delete() { st.op = 'delete'; return b },
      eq(k, v) { st.filters.push(['eq', k, v]); return b },
      gt(k, v) { st.filters.push(['gt', k, v]); return b },
      in(k, v) { st.filters.push(['in', k, v]); return b },
      is(k, v) { st.filters.push(['is', k, v]); return b },
      order(k, o = {}) { st.order = [k, o.ascending !== false]; return b },
      limit(x) { st.limit = x; return b },
      single() { return Promise.resolve(exec('single')) },
      maybeSingle() { return Promise.resolve(exec('maybe')) },
      then(res, rej) { return Promise.resolve(exec()).then(res, rej) },
    }
    return b
  }

  const bucket = {
    createSignedUploadUrl: async (path) => ({ data: { path, token: 'jeton-depot', signedUrl: `https://storage/${path}` }, error: null }),
    download: async (path) => (files.has(path) ? { data: files.get(path), error: null } : { data: null, error: { message: 'Object not found' } }),
    remove: async (paths) => { paths.forEach(p => files.delete(p)); return { data: null, error: null } },
    createSignedUrl: async (path) => ({ data: { signedUrl: `https://files/${path}` }, error: null }),
  }

  return {
    client: { from: query, storage: { from: () => bucket } },
    tables,
    files,
    putFile: (path, content = '%PDF-1.4', type = 'application/pdf') => files.set(path, new Blob([content], { type })),
  }
}
