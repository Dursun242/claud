export const metadata = {
  title: 'ID Maîtrise - Dashboard',
  description: 'Tableau de bord de gestion de chantiers - ID Maîtrise, Le Havre',
  manifest: '/manifest.json',
  themeColor: '#1E3A5F',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ID Maîtrise" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
