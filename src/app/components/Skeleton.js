'use client'
import { colors, radius } from '../design-system'

export default function Skeleton({ width = '100%', height = '20px', count = 1, style = {} }) {
  const skeletonStyle = `
    @keyframes shimmer {
      0% {
        background-position: -1000px 0;
      }
      100% {
        background-position: 1000px 0;
      }
    }
  `

  const baseStyle = {
    background: `linear-gradient(90deg, ${colors.gray[800]} 25%, ${colors.gray[700]} 50%, ${colors.gray[800]} 75%)`,
    backgroundSize: '1000px 100%',
    animation: 'shimmer 2s infinite',
    borderRadius: radius.md,
    height,
    width,
    ...style,
  }

  return (
    <>
      <style>{skeletonStyle}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            ...baseStyle,
            marginBottom: i < count - 1 ? '12px' : 0,
          }}
        />
      ))}
    </>
  )
}
