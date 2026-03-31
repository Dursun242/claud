'use client'
import dynamic from 'next/dynamic'
import { Suspense, lazy } from 'react'

/**
 * PERFORMANCE OPTIMIZATION STRATEGY
 * Pour fix le problème du "premier lancement lent"
 */

// 1. LAZY LOAD heavy pages
export const ProjectsV = dynamic(() => import('./ProjectsV'), {
  loading: () => <LoadingSkeleton />,
  ssr: false, // Client-side only
})

export const OrdersServiceV3 = dynamic(() => import('./OrdersServiceV3'), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
})

export const CompteRendusV3 = dynamic(() => import('./CompteRendusV3'), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
})

export const TasksV = dynamic(() => import('./TasksV'), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
})

export const ContactsV = dynamic(() => import('./ContactsV'), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
})

// 2. SKELETON LOADER
function LoadingSkeleton() {
  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          height: 200,
          background: '#f0f0f0',
          borderRadius: 8,
          marginBottom: 16,
          animation: 'pulse 2s infinite',
        }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 120,
              background: '#f0f0f0',
              borderRadius: 8,
              animation: 'pulse 2s infinite',
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// 3. PARTIAL INITIAL LOAD (Only load essential data)
export async function useInitialDataOptimized() {
  // Load ONLY what's visible on first page
  // Defer heavy pages' data loading
  return {
    // Essential only
    user: null, // Loaded by auth context
    chantiers: [], // Load on demand in ProjectsV
    // Everything else = lazy load on tab change
  }
}

// 4. PREFETCH on hover
export function usePrefetchPage(pageKey) {
  return (
    <div
      onMouseEnter={() => {
        // Prefetch data when user hovers on a nav link
        // Example: prefetch('projects') loads data in background
      }}
    >
      Hover to prefetch data
    </div>
  )
}
