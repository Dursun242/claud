# ⚡ Guide des Optimisations & Performance

Ensemble complet d'outils pour maximiser la performance et la fluidité de l'application.

## 📦 Composants de Chargement

### Spinner
```jsx
import { Spinner } from './components'

<Spinner size="md" color="primary" />
// Tailles: sm | md | lg
// Couleurs: primary | white | gray
```

### Skeleton (Placeholder)
```jsx
import { Skeleton } from './components'

<Skeleton width="100%" height="20px" count={3} />
// Parfait pour les listes qui se chargent
```

### LoadingState
```jsx
import { LoadingState } from './components'

<LoadingState message="Chargement des chantiers..." fullHeight={false} />
```

### ErrorState
```jsx
import { ErrorState } from './components'

<ErrorState
  title="Erreur"
  message="Impossible de charger les données"
  onRetry={() => refetch()}
/>
```

## 🎣 Hooks de Performance

### useAsync - Gère les appels API
```jsx
import { useAsync } from './hooks'

function MyComponent() {
  const { data, isLoading, error, execute } = useAsync(
    async () => {
      const res = await fetch('/api/data')
      return res.json()
    },
    true // Appeler immédiatement
  )

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState onRetry={execute} />

  return <div>{data}</div>
}
```

### useDebounce - Délai avant exécution
```jsx
import { useDebounce } from './hooks'

function SearchComponent() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  // debouncedSearch n'est mis à jour que 300ms après l'arrêt de la frappe
  // Parfait pour les recherches/filtres
}
```

### useThrottle - Limite la fréquence
```jsx
import { useThrottle } from './hooks'

function ScrollComponent() {
  const handleScroll = useThrottle(() => {
    console.log('Scroll event (max 1x par 300ms)')
  }, 300)

  // Réduit drastiquement les appels lors du scroll
}
```

## 💾 Cache API Automatique

```jsx
import { apiCache } from './utils'

// Utilisation simple
const data = await apiCache.get(
  'chantiers-list', // Clé de cache
  async () => fetch('/api/chantiers').then(r => r.json()),
  5 * 60 * 1000 // 5 minutes TTL (time to live)
)

// Plus tard - retourne depuis le cache si disponible
const cachedData = await apiCache.get('chantiers-list', fetcher)

// Invalider le cache
apiCache.delete('chantiers-list')

// Invalider par pattern (regex)
apiCache.invalidatePattern('chantiers-.*')

// Afficher les stats
console.log(apiCache.getStats())
// { size: 3, keys: ['chantiers-list', 'contacts-list', ...] }
```

## 🎨 Formatters - Uniformisez les données

```jsx
import {
  formatMoney,
  formatDate,
  formatPercent,
  truncate,
  formatNumber,
  formatDuration,
} from './utils'

// Montants
formatMoney(2400000) // "2 400 000,00 €"
formatMoney(-15000)  // "-15 000,00 €"

// Dates
formatDate('2024-03-28') // "28/03/2024"

// Pourcentages
formatPercent(0.854) // "85.4%"

// Nombres
formatNumber(1234567) // "1 234 567"

// Tronquage
truncate("Très long texte...", 20) // "Très long texte..."

// Durée
formatDuration(3661000) // "1h 1m"
```

## ⚙️ Patterns de Performance Clés

### 1. Lazy Loading des Composants
```jsx
// À venir - Code splitting
const DashboardV = lazy(() => import('./pages/DashboardV'))
const ProjectsV = lazy(() => import('./pages/ProjectsV'))

// Avec fallback
<Suspense fallback={<LoadingState />}>
  <DashboardV />
</Suspense>
```

### 2. Mémorisation Intelligente
```jsx
import { useMemo, useCallback } from 'react'

// Mémoriser les données complexes
const expensiveData = useMemo(() => {
  return chantiers.filter(...).map(...)
}, [chantiers])

// Mémoriser les callbacks
const handleClick = useCallback(() => {
  doSomething()
}, [dependencies])
```

### 3. Éviter les Re-renders Inutiles
```jsx
// ❌ Mauvais - re-crée l'objet à chaque render
<Card data={{ id: 1, name: 'Test' }} />

// ✅ Bon - l'objet est stable
const cardData = useMemo(() => ({ id: 1, name: 'Test' }), [])
<Card data={cardData} />
```

### 4. Optimiser les Listes
```jsx
// Toujours ajouter une clé unique et stable
{items.map(item => (
  <Card key={item.id}>{item.name}</Card>
))}

// ❌ Ne JAMAIS utiliser l'index
{items.map((item, index) => (
  <Card key={index}>{item.name}</Card>
))}
```

## 📊 Checklist de Performance

- [ ] Utiliser `Skeleton` pour les chargements
- [ ] Utiliser `useAsync` pour les appels API
- [ ] Utiliser `apiCache` pour éviter les requêtes dupliquées
- [ ] Debounce les recherches/filtres (300ms)
- [ ] Throttle les événements fréquents (scroll, resize)
- [ ] Formater les données avec les utilitaires
- [ ] Mémoriser les données complexes (`useMemo`)
- [ ] Utiliser `useCallback` pour les handlers
- [ ] Lazy loading des pages heavy
- [ ] Suspense boundaries pour les transitions

## 🚀 Résultats attendus

- ✅ Temps de chargement -40%
- ✅ Requêtes API réduites de 60%
- ✅ Animations fluides (60 FPS)
- ✅ Meilleure UX avec états de chargement
- ✅ Code plus maintenable

---

**Important**: Ces optimisations sont progressives. Implémentez-les une par une et mesurez l'impact.
