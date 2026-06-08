#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_USER="${BOKE_DEPLOY_USER:-git}"
REPO_DIR="${BOKE_REPO_DIR:-/home/git/blog.git}"
WORK_TREE="${BOKE_WORK_TREE:-/home/blog}"
BRANCH="${BOKE_BRANCH:-main}"
SERVER_NAME="${BOKE_SERVER_NAME:-_}"
PUBLIC_KEY="${BOKE_PUBLIC_KEY:-}"

if [[ "$(id -u)" != "0" ]]; then
  echo "Please run as root." >&2
  exit 1
fi

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y git nginx
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y git nginx
  elif command -v yum >/dev/null 2>&1; then
    yum install -y git nginx
  else
    echo "No supported package manager found. Install git and nginx manually." >&2
    exit 1
  fi
}

install_packages

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi

mkdir -p "$(dirname "$REPO_DIR")" "$WORK_TREE"

if [[ ! -d "$REPO_DIR/objects" ]]; then
  git init --bare "$REPO_DIR"
fi

git --git-dir="$REPO_DIR" symbolic-ref HEAD "refs/heads/$BRANCH"

chown -R "$DEPLOY_USER:$DEPLOY_USER" "$(dirname "$REPO_DIR")" "$WORK_TREE"
chmod 755 "$(dirname "$REPO_DIR")" "$WORK_TREE"

home_dir="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
if [[ -n "$PUBLIC_KEY" ]]; then
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home_dir/.ssh"
  touch "$home_dir/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$home_dir/.ssh/authorized_keys"
  chmod 600 "$home_dir/.ssh/authorized_keys"
  if ! grep -qxF "$PUBLIC_KEY" "$home_dir/.ssh/authorized_keys"; then
    printf '%s\n' "$PUBLIC_KEY" >> "$home_dir/.ssh/authorized_keys"
  fi
fi

cat > "$REPO_DIR/hooks/post-receive" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail

git --work-tree='$WORK_TREE' --git-dir='$REPO_DIR' checkout -f '$BRANCH'
find '$WORK_TREE' -type d -exec chmod 755 {} +
find '$WORK_TREE' -type f -exec chmod 644 {} +
EOF

chmod +x "$REPO_DIR/hooks/post-receive"
chown "$DEPLOY_USER:$DEPLOY_USER" "$REPO_DIR/hooks/post-receive"

if [[ -d /etc/nginx/sites-available ]]; then
  nginx_conf="/etc/nginx/sites-available/boke.conf"
  nginx_enabled="/etc/nginx/sites-enabled/boke.conf"
  rm -f /etc/nginx/sites-enabled/default
else
  nginx_conf="/etc/nginx/conf.d/boke.conf"
  nginx_enabled=""
  rm -f /etc/nginx/conf.d/default.conf
fi

cat > "$nginx_conf" <<EOF
server {
    listen 80;
    server_name $SERVER_NAME;

    root $WORK_TREE;
    index index.html;
    charset utf-8;

    location = / {
        return 302 /boke/;
    }

    location ^~ /boke/ {
        try_files \$uri \$uri/ /boke/404.html;
    }

    location ~ /\\. {
        deny all;
    }
}
EOF

if [[ -n "$nginx_enabled" ]]; then
  ln -sf "$nginx_conf" "$nginx_enabled"
fi

nginx -t

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now nginx
  systemctl reload nginx
else
  service nginx start || true
  service nginx reload || true
fi

echo "Bootstrap complete."
echo "Deploy user: $DEPLOY_USER"
echo "Repo: $REPO_DIR"
echo "Work tree: $WORK_TREE"
echo "URL: http://${SERVER_NAME}/boke/"
