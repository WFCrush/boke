# Codex Project Skill: Hexo Fluid Blog Parallel Workflow

## 项目定位

这是一个 Hexo 7 + Fluid 主题博客，目标是维护一个现代、克制、有技术感的个人技术博客。

关键文件：

- `_config.yml`：Hexo 主配置，包含站点 URL、root、搜索、sitemap、nofollow、图片优化等全局配置。
- `_config.fluid.yml`：Fluid 主题覆盖配置。
- `source/css/blog-custom.css`：博客高级视觉样式。
- `source/js/site-enhance.js`：前端增强脚本。
- `source/js/contact-widget.js`：联系浮层脚本。
- `source/img/avatar.png`：头像。
- `source/img/home-banner.png`：首页横幅。
- `admin/public/index.html`：博客后台页面。

## 绝对规则

1. 不要直接修改 `node_modules`。
2. 不要破坏 GitHub Pages 子路径：`root: /boke/`。
3. 不要把资源路径写成 Windows 绝对路径。
4. 不要随意引入新依赖；确实需要时先说明原因。
5. 不要把多人分工任务混在一起做。
6. 不要修改与当前任务无关的文件。
7. 不要删除用户文章、图片、上传文件或后台数据。
8. 如果必须修改共享文件，先说明理由并保持改动最小。

## 单对话模拟多角色分工

Codex 不能真正自动并行多个对话时，请在一个对话中按阶段模拟分工：

1. **侦察阶段**：只读项目结构和关键配置，不写代码。
2. **任务拆分阶段**：把工作拆成互不冲突的小任务，明确每个任务可改文件。
3. **执行阶段**：一次只执行一个任务，不跨任务顺手改。
4. **集成阶段**：检查配置、CSS、JS、资源路径是否一致。
5. **验证阶段**：运行构建并本地预览。
6. **总结阶段**：列出改动文件、验证结果和剩余风险。

## 推荐任务边界

### 任务 A：主题配置

只允许修改：

- `_config.fluid.yml`
- 必要时最小修改 `_config.yml`

目标：Fluid 配置、首页 banner、avatar、dark mode、代码块、TOC、搜索、导航。

禁止：修改 CSS/JS 大段样式、修改文章内容、修改 `node_modules`。

### 任务 B：视觉样式

只允许修改：

- `source/css/blog-custom.css`

目标：首页、卡片、文章页、代码块、表格、引用、移动端、深色模式视觉优化。

禁止：修改主题配置、文章内容、`package.json`、`node_modules`。

### 任务 C：前端增强

只允许修改：

- `source/js/site-enhance.js`
- `source/js/contact-widget.js`

目标：搜索快捷键、阅读进度、图片懒加载、联系浮层、无障碍细节。

禁止：引入大型第三方库、硬编码错误路径、破坏无 JS 可用性。

### 任务 D：后台页面

只允许修改：

- `admin/public/index.html`
- 后台已有配套文件

目标：后台 UI 与博客整体风格一致，保持原有功能可用。

禁止：改博客主题文件、改文章内容、删除后台功能。

### 任务 E：集成验证

原则：只做最小修复。

检查：

- `_config.yml` 与 `_config.fluid.yml` 是否冲突。
- `custom_css` / `custom_js` 引用的文件是否存在。
- `/boke/` 子路径是否正常。
- 首页、文章页、搜索入口、移动端是否可用。
- 构建是否成功。

## 验证命令

每次完成后至少运行：

```bash
npm run clean
npm run build
```

需要本地预览时运行：

```bash
npm run server
```

然后访问：

- `http://localhost:4000/boke/`
- `http://localhost:4000/boke/about/`
- 任意文章页
- 搜索入口

## 输出格式

每次完成后按这个格式回复：

```md
## 完成内容

- 修改了：`文件路径`
- 原因：一句话说明

## 验证结果

- `npm run clean`：通过/失败
- `npm run build`：通过/失败
- 本地预览：首页/文章页/搜索/移动端观察结果

## 注意事项

- 是否存在未处理风险
- 是否需要用户手动确认
```

## 博客审美方向

- 现代、克制、高级、有技术感。
- 浅色模式使用柔和灰白或淡蓝灰，避免刺眼纯白。
- 深色模式使用深蓝黑或暖黑，避免纯黑。
- 主色建议低饱和蓝、靛蓝、青蓝或蓝紫。
- 卡片圆角、轻阴影、微交互动效。
- 不要堆砌动画，不要营销感文案。
- 中文阅读体验优先。