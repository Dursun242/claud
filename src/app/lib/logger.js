// ═══════════════════════════════════════════════════════════════
// logger.js — wrapper centralisé autour de console.error/warn
// ═══════════════════════════════════════════════════════════════
//
// Pourquoi : aujourd'hui les logs sont dispersés dans tout le code, sans
// format commun. Ce wrapper ajoute :
//   - un tag source ([pappers], [qonto], [auth]…) pour grep facile
//   - un timestamp ISO
//   - un hook unique pour brancher Sentry / Datadog plus tard sans refactor
//
// Le no-console ESLint autorise déjà warn/error, donc pas de violation.
// Les logs `debug` et `info` sont des no-op en production (bruit inutile).

const isDev = process.env.NODE_ENV !== 'production';

function format(level, source, message, extra) {
  const ts = new Date().toISOString();
  const tag = source ? `[${source}]` : '';
  return [`${ts} ${level.toUpperCase()} ${tag}`.trim(), message, extra].filter(Boolean);
}

/**
 * @param {string} source — ex: 'pappers', 'qonto', 'auth'
 */
export function createLogger(source) {
  return {
    debug: (message, extra) => {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.debug(...format('debug', source, message, extra));
      }
    },
    info: (message, extra) => {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.info(...format('info', source, message, extra));
      }
    },
    warn: (message, extra) => {
      console.warn(...format('warn', source, message, extra));
    },
    error: (message, extra) => {
      console.error(...format('error', source, message, extra));
      // TODO: brancher Sentry/Datadog ici quand l'app sera plus critique
    },
  };
}

export const logger = createLogger('app');
