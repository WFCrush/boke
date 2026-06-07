# Skill 对话服务器部署说明

目标架构：Nginx 只暴露 `/boke/` 静态博客和 `/boke/api/public-skill-chat/` 公开 API；Node API 只监听 `127.0.0.1:5050`，由 systemd 托管。不要用 `hexo server` 或公开 Node 端口作为最终方案。

正式公开使用必须启用 HTTPS。若暂时只有服务器 IP，可以先完成服务器内网与 Nginx 配置验证，但不应把 HTTP 明文版本作为最终交付。

## 服务器目录

```bash
/opt/boke/repo
/opt/boke/skills/xie-xiao-shu
/var/www/boke-site/releases
/var/www/boke-site/current -> releases/<timestamp>
/var/lib/boke/public-skill-chat/sessions
/etc/boke/skill-chat.env
```

## 必填密钥

`/etc/boke/skill-chat.env` 必须由 `deploy/skill-chat.env.example` 复制后填写：

- `SKILL_CHAT_BASE_URL`
- `SKILL_CHAT_MODEL`
- `SKILL_CHAT_API_KEY`
- `SKILL_CHAT_SECRET_SALT`
- `SKILL_CHAT_SKILL_DIR`

`SKILL_CHAT_SECRET_SALT` 可在服务器生成：

```bash
openssl rand -hex 32
```

`SKILL_CHAT_SKILL_DIR` 中必须存在 `SKILL.md` 和 `知识库.txt`。缺少任一文件时 API 不进入可用状态。

## 部署命令

```bash
sudo apt update
sudo apt install -y nginx git rsync nodejs npm

sudo adduser --system --group --home /opt/boke boke
sudo mkdir -p /opt/boke/repo /opt/boke/skills/xie-xiao-shu /var/www/boke-site/releases /var/lib/boke/public-skill-chat/sessions /etc/boke
sudo chown -R boke:boke /opt/boke /var/www/boke-site /var/lib/boke
sudo chmod 750 /var/lib/boke/public-skill-chat /var/lib/boke/public-skill-chat/sessions
```

上传或拉取代码到 `/opt/boke/repo`，并把本地 `C:\Users\31756\.codex\skills\xie-xiao-shu\SKILL.md` 与 `知识库.txt` 上传到 `/opt/boke/skills/xie-xiao-shu/` 后：

```bash
cd /opt/boke/repo
sudo -u boke bash deploy/server-release.sh
```

安装服务与 Nginx 配置：

```bash
sudo cp deploy/boke-skill-chat.service /etc/systemd/system/boke-skill-chat.service
sudo cp deploy/nginx-boke.conf /etc/nginx/sites-available/boke.conf
sudo ln -sf /etc/nginx/sites-available/boke.conf /etc/nginx/sites-enabled/boke.conf
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now boke-skill-chat
sudo systemctl reload nginx
```

回滚到上一版静态站点：

```bash
sudo -u boke bash /opt/boke/repo/deploy/server-rollback.sh
sudo nginx -t
sudo systemctl reload nginx
```

## 验证

```bash
curl -fsS http://127.0.0.1:5050/boke/api/public-skill-chat/health
curl -fsS http://example.com/boke/api/public-skill-chat/health
curl -I http://example.com/boke/
curl -I http://example.com/boke/local-search.xml
```

通过标准：

- health 返回 `ok: true`
- `/boke/`、`/boke/about/`、文章页、搜索索引返回 200
- 浏览器中 Skill 对话页的 API 请求命中 `/boke/api/public-skill-chat/...`
- Nginx 和 systemd 日志无 5xx、权限错误、模型超时
