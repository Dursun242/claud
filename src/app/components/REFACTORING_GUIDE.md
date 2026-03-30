# Phase 4: Refactoring Guide - Using Phase 3 Hooks

## Overview
This guide shows how to refactor pages (ProjectsV, TasksV, etc.) to use Phase 3 hooks and Phase 2 components, reducing code duplication and improving maintainability.

## Pattern: Attachments

### Before (Old Pattern - ProjectsV line 1392-1397)
```javascript
const [attachments, setAttachments] = useState([]);

useEffect(() => {
  if (!selected) {
    setAttachments([]);
    return;
  }
  (async () => {
    try {
      const att = await SB.getAttachments('chantier', selected);
      setAttachments(att);
    } catch (e) { console.error(e); }
  })();
}, [selected]);

// Usage in JSX
<AttachmentsSection
  attachments={attachments}
  onUpload={async(file)=>{
    await SB.uploadAttachment(file,'chantier',ch.id);
    const att=await SB.getAttachments('chantier',ch.id);
    setAttachments(att);
  }}
  onDelete={async(id,path)=>{
    await SB.deleteAttachment(id,path);
    const att=await SB.getAttachments('chantier',ch.id);
    setAttachments(att);
  }}
/>
```

### After (New Pattern - Using useAttachments Hook)
```javascript
import { useAttachments } from '../hooks/useAttachments'

const { attachments, uploadAttachment, deleteAttachment } = useAttachments('chantier', selected);

// Usage in JSX - Much simpler!
<AttachmentsSection
  attachments={attachments}
  onUpload={uploadAttachment}
  onDelete={deleteAttachment}
/>
```

**Benefits:**
- Hook handles loading, error handling, and state automatically
- No manual useEffect needed
- Single line of hook usage instead of 15 lines
- Toasts are automatically shown on success/error

---

## Pattern: Comments

### Before (Old Pattern - ProjectsV line 1505-1523)
```javascript
const [comments, setComments] = useState([]);
const [newComment, setNewComment] = useState("");

useEffect(() => {
  if (!selected) {
    setComments([]);
    return;
  }
  (async () => {
    try {
      const com = await SB.getComments('chantier', selected);
      setComments(com);
    } catch (e) { console.error(e); }
  })();
}, [selected]);

// Manual add comment
<button onClick={async()=>{
  await SB.addComment('chantier',ch.id,user?.email||'Anonyme',newComment);
  setNewComment("");
  const com=await SB.getComments('chantier',ch.id);
  setComments(com);
}}>
  Ajouter
</button>
```

### After (New Pattern - Using useComments Hook)
```javascript
import { useComments } from '../hooks/useComments'
import { CommentsSection } from '../components'

const { comments, addComment, deleteComment } = useComments('chantier', selected, user?.email);

// Usage in JSX - Complete component
<CommentsSection
  comments={comments}
  onAddComment={addComment}
  onDeleteComment={deleteComment}
  currentUser={user}
  userRole={profile?.role}
/>
```

**Benefits:**
- Hook manages state and loading automatically
- Supports permission-based deletion
- CommentsSection component handles all UI rendering
- No manual form state needed

---

## Pattern: Sharing

### Before (Old Pattern - ProjectsV line 1525-1544)
```javascript
const [shares, setShares] = useState([]);
const [shareEmail, setShareEmail] = useState("");
const [sharePerm, setSharePerm] = useState("view");

useEffect(() => {
  if (!selected) {
    setShares([]);
    return;
  }
  (async () => {
    try {
      const shr = await SB.getShares(selected);
      setShares(shr);
    } catch (e) { console.error(e); }
  })();
}, [selected]);

// Manual sharing
<input value={shareEmail} onChange={e=>setShareEmail(e.target.value)} />
<select value={sharePerm} onChange={e=>setSharePerm(e.target.value)}>
  <option value="view">Lecture</option>
  <option value="edit">Édition</option>
  <option value="admin">Admin</option>
</select>
<button onClick={async()=>{
  await SB.shareChantier(ch.id,shareEmail,sharePerm);
  setShareEmail("");
  const shr=await SB.getShares(ch.id);
  setShares(shr);
}}>
  Partager
</button>
```

### After (New Pattern - Using useSharing Hook)
```javascript
import { useSharing } from '../hooks/useSharing'
import { SharingPanel } from '../components'

const { shares, addShare, deleteShare } = useSharing(selected);

// Usage in JSX - Complete component
<SharingPanel
  shares={shares}
  onAddShare={addShare}
  onDeleteShare={deleteShare}
/>
```

**Benefits:**
- Hook handles email validation and permission management
- SharingPanel component provides complete UI
- Email normalization (lowercase, trim) automatic
- Confirmation dialog handled by component

---

## Pattern: Detail View State

### Before (Multiple useState calls)
```javascript
const [selected,setSelected]=useState(null);
const [detailModal,setDetailModal]=useState(null);
const [detailForm,setDetailForm]=useState({});
```

### After (Using useDetailView Hook)
```javascript
import { useDetailView } from '../hooks/useDetailView'

const {
  selectedId,
  detailModal,
  detailForm,
  openDetail,
  closeDetail,
  openDetailModal,
  closeDetailModal,
  updateDetailForm,
  resetDetailForm,
} = useDetailView();
```

**Benefits:**
- All detail view state in one hook
- Consistent methods (openDetail, closeDetail, etc.)
- Easy to pass around or share between components

---

## Full Example: Refactored ProjectsV Detail View

```javascript
import { useAttachments } from '../hooks/useAttachments'
import { useComments } from '../hooks/useComments'
import { useSharing } from '../hooks/useSharing'
import {
  AttachmentsSection,
  CommentsSection,
  SharingPanel,
  Section,
} from '../components'

function ProjectsDetailView({ chantier, allData, onBack, user, ... }) {
  // All hooks in one place
  const { attachments, uploadAttachment, deleteAttachment } = useAttachments('chantier', chantier?.id);
  const { comments, addComment, deleteComment } = useComments('chantier', chantier?.id, user?.email);
  const { shares, addShare, deleteShare } = useSharing(chantier?.id);

  return (
    <div>
      {/* Header */}
      <button onClick={onBack}>← Retour</button>

      {/* Attachments - ONE line of JSX! */}
      <AttachmentsSection
        attachments={attachments}
        onUpload={uploadAttachment}
        onDelete={deleteAttachment}
      />

      {/* Comments - ONE component! */}
      <CommentsSection
        comments={comments}
        onAddComment={addComment}
        onDeleteComment={deleteComment}
        currentUser={user}
      />

      {/* Sharing - ONE component! */}
      <SharingPanel
        shares={shares}
        onAddShare={addShare}
        onDeleteShare={deleteShare}
      />
    </div>
  );
}
```

**Code Reduction:**
- Before: ~300 lines for this section (state + useEffect + manual rendering)
- After: ~50 lines (hooks + components)
- **75% code reduction!**

---

## Migration Checklist for Each Page

- [ ] Add hook imports (useAttachments, useComments, useSharing, useDetailView)
- [ ] Import component imports (AttachmentsSection, CommentsSection, SharingPanel)
- [ ] Replace useState calls with hooks
- [ ] Remove manual useEffect for loading data
- [ ] Remove manual form state variables
- [ ] Replace inline JSX with component usage
- [ ] Test and verify functionality
- [ ] Commit with clear message

---

## Pages to Refactor (In Order)

1. **ProjectsV** (lines 1286-1685) - 400 lines → ~150 lines
2. **OrdersServiceV3** (if large)
3. **CompteRendusV3** (if large)
4. **TasksV** (if exists)
5. **ContactsV** (if exists)

Each page can save 50-75% code through this refactoring!

---

## Next Steps

1. Pick a page (start with ProjectsV)
2. Follow the patterns above
3. Test thoroughly
4. Commit incrementally
5. Move to next page

The hooks handle all the complexity - pages become much simpler! 🎉
