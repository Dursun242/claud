'use client'
import { colors, spacing, typography } from '../design-system'

const Icon = ({ d, size = 16, color = colors.gray[500] }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" dangerouslySetInnerHTML={{ __html: d }} style={{ color }} />
)

export default function TabNavigation({ tabs, activeTab, onChange, user, onLogout, isMobile, onMenuClick }) {
  return (
    <>
      {/* Sidebar */}
      <nav style={{
        width: isMobile ? 260 : 240,
        position: isMobile ? 'fixed' : 'relative',
        left: isMobile ? 0 : 'auto',
        top: 0,
        bottom: 0,
        background: `linear-gradient(195deg, ${colors.gray[900]}, ${colors.gray[800]})`,
        color: colors.gray[100],
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 999,
        transition: 'transform .3s ease',
        boxShadow: isMobile ? '4px 0 20px rgba(0,0,0,0.3)' : 'none',
      }}>
        {/* Logo/Header */}
        <div style={{
          padding: `${spacing.lg} ${spacing.md}`,
          borderBottom: `1px solid ${colors.gray[700]}`,
        }}>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            color: colors.gray[100],
          }}>
            ID MAÎTRISE
          </div>
          <div style={{
            fontSize: 10,
            color: colors.gray[400],
            marginTop: spacing.xs,
            letterSpacing: '0.05em',
          }}>
            MAÎTRISE D'ŒUVRE • LE HAVRE
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          flex: 1,
          padding: `${spacing.sm} ${spacing.xs}`,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xs,
          overflow: 'auto',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.md,
                padding: `${spacing.sm} ${spacing.sm}`,
                border: 'none',
                borderRadius: 7,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key
                  ? (tab.isGcal ? '#FCA5A5' : tab.isQonto ? '#C4B5FD' : colors.gray[100])
                  : (tab.isGcal ? '#F87171' : tab.isQonto ? '#A78BFA' : colors.gray[400]),
                background: activeTab === tab.key
                  ? (tab.isGcal ? 'rgba(234,67,53,0.15)' : tab.isQonto ? 'rgba(124,58,237,0.15)' : `rgba(255,255,255,0.12)`)
                  : 'transparent',
                transition: 'all .2s',
                textAlign: 'left',
                width: '100%',
                borderLeft: activeTab === tab.key
                  ? (tab.isGcal ? '3px solid #EA4335' : tab.isQonto ? '3px solid #7C3AED' : '3px solid transparent')
                  : '3px solid transparent',
              }}
            >
              {tab.icon && <Icon d={tab.icon} size={16} color={activeTab === tab.key ? colors.primary[400] : colors.gray[500]} />}
              <span style={{ flex: 1 }}>{tab.label}</span>
              {tab.badge && <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 7px',
                borderRadius: 5,
                background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                color: '#fff',
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: '0.1em',
              }}>
                {tab.badge}
              </span>}
            </button>
          ))}
        </div>

        {/* User Info */}
        <div style={{
          padding: `${spacing.md} ${spacing.md}`,
          borderTop: `1px solid ${colors.gray[700]}`,
        }}>
          {user && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.md,
              marginBottom: spacing.md,
            }}>
              {user.user_metadata?.avatar_url && (
                <img
                  src={user.user_metadata.avatar_url}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: `2px solid ${colors.gray[600]}`,
                  }}
                  alt=""
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.gray[100],
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {user.user_metadata?.full_name || user.email}
                </div>
                <div style={{
                  fontSize: 9,
                  color: colors.gray[400],
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {user.email}
                </div>
              </div>
            </div>
          )}
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              padding: `${spacing.xs} ${spacing.sm}`,
              borderRadius: 6,
              border: `1px solid ${colors.gray[600]}`,
              background: colors.gray[800],
              color: colors.gray[400],
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              transition: 'all .2s',
            }}
          >
            Déconnexion
          </button>
          <div style={{
            fontSize: 9,
            color: colors.gray[500],
            marginTop: spacing.md,
            lineHeight: 1.4,
          }}>
            SARL ID MAITRISE<br />
            9 Rue Henry Genestal, 76600 Le Havre
          </div>
        </div>
      </nav>

      {/* Mobile Header */}
      {isMobile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 52,
          background: colors.gray[100],
          borderBottom: `1px solid ${colors.gray[200]}`,
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${spacing.md}`,
          zIndex: 997,
          gap: spacing.md,
        }}>
          <button
            onClick={onMenuClick}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: spacing.xs,
              color: colors.gray[900],
            }}
          >
            ☰
          </button>
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            color: colors.gray[900],
          }}>
            ID Maîtrise
          </span>
        </div>
      )}
    </>
  )
}
