# 我的博客

这是一个基于 Hexo 和 Fluid 主题搭建的本地博客项目。

## 本地预览

```powershell
cd /d D:\BoKe
npm run server
```

默认访问地址：

```text
http://localhost:4000/
```

## 管理员后台

启动本地后台：

```powershell
cd /d D:\BoKe
npm run admin
```

打开：

```text
http://127.0.0.1:5050/
```

默认密码：

```text
admin123
```

后台可以新建/编辑文章，填写专栏分类，上传 PDF、DOCX、图片、压缩包等文件，并一键发布到 GitHub Pages。

后台只监听 `127.0.0.1`，也就是只允许本机访问。

文件上传建议：

- `安全上传`：适合 PDF、Word、PPT、Excel、ZIP。文件会加密，别人打开链接需要输入密码。
- `公开上传`：适合公开图片或公开资料。任何知道链接的人都可以访问。

注意：网页无法做到“可预览但绝对无法被保存”。对于敏感资料，请使用安全上传，并避免上传真正不能外传的原件。

别人访问你的公开博客地址：

```text
https://wfcrush.github.io/boke/
```

在后台点 `发布上线` 后，内容会推送到 GitHub，GitHub Pages 会自动部署。通常等待 30 到 90 秒，别人刷新这个地址就能看到新内容。

## 新建文章

```powershell
cd /d D:\BoKe
npm run new "文章标题"
```

文章会生成到：

```text
D:\BoKe\source\_posts
```

也可以直接在 `source\_posts` 里新建 Markdown 文件。

写文章速查：

```text
D:\BoKe\docs\写文章速查.md
```

## 发布文章

写完文章后，先本地预览：

```powershell
cd /d D:\BoKe
npm run server
```

确认没问题后，发布到 GitHub Pages：

```powershell
cd /d D:\BoKe
npm run publish
```

发布成功后，稍等一会儿访问：

```text
https://wfcrush.github.io/boke/
```

## 生成静态文件

```powershell
cd /d D:\BoKe
npm run build
```

生成结果在：

```text
D:\BoKe\public
```

## 部署到 GitHub Pages

项目已经包含 GitHub Actions 部署配置：

```text
.github\workflows\pages.yml
```

首次部署步骤：

1. 在 GitHub 新建一个仓库，例如 `blog`。
2. 修改 `_config.yml` 里的 `url`。
   - 用户主页仓库：`https://你的用户名.github.io`
   - 项目页仓库：`https://你的用户名.github.io/blog`
3. 如果仓库名不是 `你的用户名.github.io`，还要在 `_config.yml` 里设置 `root`。
   - 用户主页仓库：`root: /`
   - 项目页仓库：`root: /blog/`
4. 在本地提交并推送到 GitHub 的 `main` 分支。
5. 打开 GitHub 仓库的 `Settings -> Pages`。
6. 在 `Build and deployment` 里把 `Source` 设置为 `GitHub Actions`。
7. 等待 `Actions` 里的部署任务完成。

如果仓库名是 `你的用户名.github.io`，访问地址通常是：

```text
https://你的用户名.github.io/
```

如果仓库名是普通项目名，例如 `blog`，访问地址通常是：

```text
https://你的用户名.github.io/blog/
```

## 常用目录

- `source\_posts`：博客文章
- `source\about`：关于页
- `source\categories`：分类页
- `source\tags`：标签页
- `_config.yml`：Hexo 主配置
- `_config.fluid.yml`：Fluid 主题配置
- `public`：生成后的静态网站文件

## 清理缓存

如果页面更新不明显，可以先清理再重新生成：

```powershell
cd /d D:\BoKe
npm run clean
npm run build
```

## 版本说明

当前电脑的 Node.js 版本是 20.18.1。为了避免 Hexo 8 在该版本下的兼容问题，项目内 Hexo 固定为 7.x。
