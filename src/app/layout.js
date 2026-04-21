import { DM_Sans } from 'next/font/google'
import RootWrapper from '@/app/RootWrapper';

// next/font auto-héberge DM Sans (pas d'appel à fonts.googleapis.com au
// runtime) et inline les @font-face : plus de FOUT, plus de CLS, et une
// requête réseau en moins au premier paint.
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-dm-sans',
})

export const metadata = {
  title: 'ID Maîtrise - Dashboard',
  description: 'Tableau de bord de gestion de chantiers - ID Maîtrise, Le Havre',
  manifest: '/manifest.json',
}

// Viewport : on laisse les utilisateurs zoomer (accessibilité — WCAG 1.4.4)
// Certaines personnes avec une basse vision doivent pouvoir agrandir le texte.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#1E3A5F',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={dmSans.variable}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ID Maîtrise" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={dmSans.className} style={{ margin: 0, padding: 0 }}>
        {/* Filet de sécurité global :
            - html/body bloqués en largeur viewport pour éviter qu'un enfant
              trop large n'oblige la page à scroller horizontalement ;
            - text-size-adjust: 100% sur iOS/Android pour ne pas agrandir
              le texte en mode paysage ou après un auto-zoom.
            - input/select/textarea font-size 16px minimum pour désactiver
              l'auto-zoom d'iOS Safari au focus (reproductible à partir de
              14px — cf. shared.js). */}
        <style>{`
          html, body {
            overflow-x: hidden;
            max-width: 100vw;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }
          @media (max-width: 640px) {
            input, select, textarea { font-size: 16px; }
          }
        `}</style>
        <RootWrapper>{children}</RootWrapper>
      </body>
    </html>
  )
}
