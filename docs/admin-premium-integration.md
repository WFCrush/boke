# 后台编辑器高级体验接入说明

本次增强只新增两个静态资源：

- `admin/public/admin-premium.css`
- `admin/public/admin-premium.js`

它们只做后台编辑器的视觉与非破坏性交互增强，不修改保存、发布、上传、导入等 API 调用。

## 接入位置

在 `admin/public/index.html` 中，保持原有资源不变，额外插入以下两行。

CSS 放在 `/style.css` 之后：

```html
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/admin-premium.css">
```

JS 放在 `/app.js` 之后：

```html
<script src="/marked.min.js"></script>
<script src="/app.js"></script>
<script src="/admin-premium.js"></script>
```

## 增强内容

- 编辑器工具栏增加选区/光标状态反馈、`aria-pressed` 和悬浮提示。
- 预览区域增加更稳的正文排版、代码块、表格、图片样式和空状态提示。
- 底部操作栏增加草稿状态、阅读时长、标题/图片数量提示。
- 自动保存状态、保存/发布/删除按钮增加更明确的视觉层级。
- 拖拽上传提示和空列表状态获得更清晰的视觉反馈。
- 移动端工具栏与底部按钮改为更稳的可滚动/栅格布局。

## 回滚方式

从 `admin/public/index.html` 中移除新增的 `link` 与 `script` 即可完全关闭增强层；原后台逻辑不依赖这两个文件。

## 验证建议

1. 启动后台：`npm run admin`。
2. 打开 `http://127.0.0.1:5050/`，登录后进入“写作”。
3. 输入标题和正文，确认未保存状态、底部统计和保存按钮状态会更新。
4. 切换预览，确认空状态、标题、表格、代码块和图片排版正常。
5. 悬浮上传、ZIP、加密上传按钮，只确认提示出现；不要在验证视觉增强时改变上传 API。
6. 缩窄浏览器窗口到移动端宽度，确认工具栏可横向滚动，底部按钮不重叠。
