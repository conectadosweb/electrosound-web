#!/bin/bash
set -euo pipefail

# ================== Config ==================
APP_NAME="conectadosweb"
SSH_KEY="/root/.ssh/id_ed25519_new_final"
PROJECT_PATH="/var/www/electrosoundpack.com"
LOG_DIR="/root/.pm2/logs"

CHECK_RETRIES=15         # Número de reintentos
CHECK_DELAY=2            # Segundos entre reintentos
HISTORY_COUNT=15         # commits a listar

# Opcional: healthcheck HTTP (si lo dejás vacío, se omite)
HEALTHCHECK_URL=""       # ej: "http://127.0.0.1:4000/health"
HEALTHCHECK_RETRIES=5
HEALTHCHECK_DELAY=2
# ============================================

# Vars globales para imprimir versión desplegada SIEMPRE
DEPLOY_BRANCH_REMOTE=""
DEPLOY_COMMIT_LINE=""

start_ssh_agent() {
  eval "$(ssh-agent -s)" >/dev/null
  ssh-add "$SSH_KEY" >/dev/null
}

stop_app() {
  pm2 stop "$APP_NAME" >/dev/null 2>&1 || true
}

clean_logs() {
  echo "🧹 Borrando logs de PM2..."
  pm2 flush >/dev/null 2>&1 || true
  rm -f "$LOG_DIR"/* >/dev/null 2>&1 || true
}

detect_remote_head_branch() {
  git remote show origin | grep 'HEAD branch' | awk '{print $NF}'
}

sync_repo() {
  local branch="$1"
  echo "📌 Sincronizando con la rama remota: $branch"
  git fetch --all
  git reset --hard "origin/$branch"

  DEPLOY_BRANCH_REMOTE="$branch"
  DEPLOY_COMMIT_LINE="$(git --no-pager log -1 --pretty=format:'%h - %s (%ci) by %an')"
}

start_app() {
  pm2 start ecosystem.config.js >/dev/null
  pm2 save >/dev/null 2>&1 || true
  pm2 startup >/dev/null 2>&1 || true
}

wait_for_online() {
  local i
  echo -n "⏳ Esperando a que la app esté online..."
  for ((i=1; i<=CHECK_RETRIES; i++)); do
    if pm2 show "$APP_NAME" | grep -q "status: online"; then
      echo "✅ ¡Online!"
      return 0
    fi
    sleep "$CHECK_DELAY"
    echo -n "."
  done
  echo "❌ Falló."
  return 1
}

healthcheck_ok() {
  # Sin URL o sin curl => OK (no bloquea despliegue)
  if [[ -z "$HEALTHCHECK_URL" ]] || ! command -v curl >/dev/null 2>&1; then
    return 0
  fi
  local i
  for ((i=1; i<=HEALTHCHECK_RETRIES; i++)); do
    if curl -fsS "$HEALTHCHECK_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTHCHECK_DELAY"
  done
  return 1
}

show_last_logs() {
  echo "── Últimos logs ──"
  tail -n 80 "$LOG_DIR/${APP_NAME}-error.log" 2>/dev/null || true
  echo "──────────────────"
  tail -n 80 "$LOG_DIR/${APP_NAME}-out.log" 2>/dev/null || true
  echo "──────────────────"
}

show_deployed_version() {
  echo "📌 Versión desplegada desde remoto (${DEPLOY_BRANCH_REMOTE:-desconocido}):"
  echo "${DEPLOY_COMMIT_LINE:-(sin datos)}"
  echo
}

show_git_history() {
  echo "📜 Historial de últimos $HISTORY_COUNT commits:"
  git --no-pager log -$HISTORY_COUNT --pretty=format:"%C(yellow)%h%Creset - %s %Cgreen(%ci)%Creset by %Cblue%an%Creset"
  echo
}

maybe_rollback() {
  local prev_commit="$1"
  read -r -p "¿Querés hacer rollback al commit anterior ($prev_commit)? (y/n): " choice
  if [[ "$choice" =~ ^[Yy]$ ]]; then
    echo "🔄 Haciendo rollback al commit anterior..."
    git reset --hard "$prev_commit"
    pm2 restart ecosystem.config.js >/dev/null
    if wait_for_online && healthcheck_ok; then
      echo "✅ Rollback exitoso. La app está ONLINE."
    else
      echo "⚠ Rollback hecho pero la app no pasó el chequeo."
      pm2 status "$APP_NAME" || true
      show_last_logs
    fi
    # Actualizar versión tras rollback
    DEPLOY_COMMIT_LINE="$(git --no-pager log -1 --pretty=format:'%h - %s (%ci) by %an')"
  else
    echo "⏩ Rollback cancelado por el usuario."
  fi

  show_deployed_version
  show_git_history
}

main() {
  start_ssh_agent
  cd "$PROJECT_PATH"

  local prev_commit
  prev_commit=$(git rev-parse HEAD)

  stop_app
  clean_logs

  local branch
  branch=$(detect_remote_head_branch)
  sync_repo "$branch"

  start_app
  if wait_for_online && healthcheck_ok; then
    echo "✅ La app '$APP_NAME' está ONLINE."
    show_deployed_version
    show_git_history
  else
    echo "❌ La app '$APP_NAME' NO superó el chequeo."
    pm2 status "$APP_NAME" || true
    show_last_logs
    maybe_rollback "$prev_commit"
  fi
}

main "$@"