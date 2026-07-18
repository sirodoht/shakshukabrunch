#!/usr/bin/env bash
set -Eeuo pipefail

server="${DEPLOY_SERVER:-root@01z.io}"
remote_dir="/var/www/shakshukabrunch"
service_name="shakshukabrunch.service"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/.." && pwd)"

command -v ssh >/dev/null || { echo "ssh is required" >&2; exit 1; }
command -v rsync >/dev/null || { echo "rsync is required" >&2; exit 1; }

echo "Deploying application code to $server:$remote_dir"

ssh "$server" "install -d -o deploy -g deploy /var/www/shakshukabrunch"

rsync \
  --archive \
  --compress \
  --human-readable \
  --exclude='.git/' \
  --exclude='.DS_Store' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='data/' \
  --exclude='deploy/' \
  --exclude='node_modules/' \
  "$project_dir/" "$server:$remote_dir/"

ssh "$server" bash -s -- "$remote_dir" "$service_name" <<'REMOTE'
set -Eeuo pipefail

app_dir="$1"
service_name="$2"

if [[ "$app_dir" != "/var/www/shakshukabrunch" ]]; then
  echo "Refusing to deploy to unexpected directory: $app_dir" >&2
  exit 1
fi

getent passwd deploy >/dev/null || {
  echo "The deploy user does not exist on this server." >&2
  exit 1
}

getent group deploy >/dev/null || {
  echo "The deploy group does not exist on this server." >&2
  exit 1
}

chown -R deploy:deploy "$app_dir"

systemctl cat "$service_name" >/dev/null || {
  echo "The existing $service_name unit was not found." >&2
  exit 1
}

systemctl restart "$service_name"

for attempt in {1..10}; do
  if curl --fail --silent --show-error http://127.0.0.1:6002/api/state >/dev/null; then
      echo "Deployment complete: the app is responding on port 6002."
    exit 0
  fi
  sleep 1
done

echo "The app did not respond after deployment." >&2
systemctl --no-pager --full status "$service_name" >&2 || true
exit 1
REMOTE
