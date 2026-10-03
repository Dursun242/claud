#!/bin/bash
# Démarrage des sessions Claude Code cloud : dépendances du projet + plugin ECC.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Dépendances du projet (tests, lint, build)
npm install --no-audit --no-fund

# Plugin ECC (déclaré dans .claude/settings.json) : le conteneur cloud ne
# l'installe pas tout seul.
if ! claude plugin list 2>/dev/null | grep -q 'ecc@ecc'; then
  claude plugin marketplace add affaan-m/ECC
  claude plugin install ecc@ecc
fi

# Dépendances des hooks ECC, non installées par `claude plugin install`
for dir in "$HOME"/.claude/plugins/cache/ecc/ecc/*/; do
  if [ -f "$dir/package.json" ] && [ ! -d "$dir/node_modules" ]; then
    (cd "$dir" && npm install --omit=dev --ignore-scripts --no-audit --no-fund)
  fi
done
