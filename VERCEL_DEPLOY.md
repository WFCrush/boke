# 命理 API 部署到 Vercel

## 原因
Cloudflare Workers 在国内被墙，无法访问。改用 Vercel Functions。

## 部署步骤

### 1. 安装 Vercel CLI
```bash
npm i -g vercel
```

### 2. 登录 Vercel
```bash
vercel login
```
使用 GitHub 账号登录。

### 3. 部署
```bash
cd /d/BoKe
vercel --prod
```

按提示操作：
- Set up and deploy? **Y**
- Which scope? 选择你的账号
- Link to existing project? **N**
- Project name? **boke-api** (或其他名字)
- In which directory is your code located? **./** (默认)

### 4. 部署成功后
会得到一个 URL，类似：
```
https://boke-api.vercel.app
```

API 地址就是：
```
https://boke-api.vercel.app/api/mingli
```

### 5. 更新前端代码
修改 `source/mingli/index.md` 第 78 行：
```javascript
const WORKER_URL = 'https://你的项目名.vercel.app/api/mingli';
```

### 6. 重新部署博客
```bash
hexo clean && hexo generate && hexo deploy
```

## 测试
```bash
curl -X POST https://你的项目名.vercel.app/api/mingli \
  -H "Content-Type: application/json" \
  -d '{"year":1995,"month":5,"day":20,"hour":"子时(23-1点)","gender":"男"}'
```

## 注意事项
- API Key 已配置在 vercel.json 中
- 不要把 vercel.json 提交到公开仓库（已在 .gitignore 中）
