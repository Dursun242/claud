# 🎨 Design System - ID Maîtrise

Guide complet pour utiliser le design system unifié.

## 📦 Importations

```javascript
import { colors, spacing, typography, radius, shadows } from './design-system'
import { Card, Button, Badge, Input } from './components'
```

## 🎯 Utilisation des composants

### Card
```jsx
<Card>
  <h3>Mon Titre</h3>
  <p>Contenu de la card</p>
</Card>

<Card hoverable onClick={() => console.log('clicked')}>
  Cliquable
</Card>
```

### Button
```jsx
// Variantes: primary | secondary | danger | ghost
// Tailles: sm | md | lg

<Button>Primaire</Button>
<Button variant="secondary">Secondaire</Button>
<Button variant="danger">Danger</Button>
<Button size="lg">Large</Button>
<Button disabled>Disabled</Button>
```

### Badge
```jsx
// Variantes: default | success | warning | danger | info | primary
// Tailles: sm | md

<Badge variant="success">En cours</Badge>
<Badge variant="danger" size="md">Urgent</Badge>
<Badge variant="warning">À faire</Badge>
```

### Input
```jsx
<Input
  label="Email"
  type="email"
  placeholder="user@example.com"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>

<Input
  label="Message"
  error="Ce champ est requis"
  size="lg"
/>
```

## 🎨 Couleurs

```javascript
// Utiliser les couleurs du design system
style={{ color: colors.gray[200] }}
style={{ background: colors.primary[600] }}
style={{ borderColor: colors.danger }}

// Avec opacité
style={{ background: `${colors.primary[600]}40` }}
```

## 📏 Espacements

```javascript
// sm: 8px, md: 12px, lg: 16px, xl: 20px, etc.
style={{ padding: spacing.lg }}
style={{ margin: spacing.md }}
style={{ gap: spacing.sm }}
```

## 🔤 Typographies

```javascript
style={{ ...typography.h1 }}
style={{ ...typography.body.base }}
style={{ ...typography.label }}
```

## 📐 Exemples complets

### Dashboard Card
```jsx
<Card>
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: spacing.lg
  }}>
    <h3 style={typography.h3}>Résumé</h3>
    <Badge variant="primary">Actif</Badge>
  </div>

  <p style={{ color: colors.gray[400], marginBottom: spacing.md }}>
    Total: €2.4M
  </p>

  <div style={{ display: 'flex', gap: spacing.md }}>
    <Button>Éditer</Button>
    <Button variant="secondary">Détails</Button>
  </div>
</Card>
```

### Form
```jsx
<Card style={{ maxWidth: '400px' }}>
  <h2 style={typography.h2}>Nouveau Chantier</h2>

  <div style={{ marginBottom: spacing.lg }}>
    <Input label="Nom" />
  </div>

  <div style={{ marginBottom: spacing.lg }}>
    <Input label="Budget" type="number" />
  </div>

  <Button style={{ width: '100%' }}>Créer</Button>
</Card>
```

## 🌐 Palettes de couleurs prédéfinies

- **Primary Blue**: `colors.primary[600]`
- **Success Green**: `colors.success`
- **Warning Orange**: `colors.warning`
- **Danger Red**: `colors.danger`
- **Gray Scale**: `colors.gray[50-950]`

## ⏱️ Transitions

```javascript
style={{ transition: `all ${transitions.base}` }}
// fast: 150ms | base: 200ms | slow: 300ms
```

## 📱 Responsive

```javascript
const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

// Ou utiliser media queries
style={{
  padding: isMobile ? spacing.md : spacing.lg
}}
```

## ✨ Ombres

```javascript
style={{ boxShadow: shadows.sm }}
// xs | sm | md | lg | xl | inner
```

---

**Note**: Remplacer progressivement tous les inline styles par ces composants et tokens pour une cohérence maximale.
