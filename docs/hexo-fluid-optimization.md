# Hexo + Fluid 博客优化与维护说明

本文档对应站点：`https://wfcrush.github.io/boke/`，项目根目录：`D:\BoKe`。

## 1. 基础定位

博客定位已经写入：

- `D:\BoKe\_config.yml`
- `D:\BoKe\_config.fluid.yml`
- `D:\BoKe\source\about\index.md`

站点标题：`ASHUWEI 的技术笔记`

副标题：`记录编程学习与技术成长的点滴`

内容方向：计算机专业学生的技术学习笔记、编程实践和踩坑记录。

## 2. Fluid 全局配置位置

Fluid 主题是通过 npm 安装的，主题源码在 `node_modules/hexo-theme-fluid`，不要直接修改。

自定义配置统一放在：

```text
D:\BoKe\_config.fluid.yml
```

自定义 CSS 放在：

```text
D:\BoKe\source\css\blog-custom.css
```

自定义 JS 放在：

```text
D:\BoKe\source\js\site-enhance.js
```

这三个文件已经通过 Fluid 的 `custom_css` 和 `custom_js` 加载。

## 3. 已启用的 Fluid 内置功能

以下功能是 Fluid 原生支持，已经在 `_config.fluid.yml` 中开启：

- 暗色/浅色模式：`dark_mode.enable`
- 搜索：`search.enable`
- 返回顶部：`scroll_top_arrow.enable`
- 首页打字机副标题：`fun_features.typing.enable`
- 页面加载进度条：`fun_features.progressbar.enable`
- 代码复制按钮：`code.copy_btn`
- 代码语言和行号：`code.language.enable`、`code.highlight.line_number`
- 文章字数和阅读时长：`post.meta.wordcount`、`post.meta.min2read`
- 文章目录：`post.toc.enable`
- 图片点击放大：`post.image_zoom.enable`
- 上一篇/下一篇：`post.prev_next.enable`
- Giscus 评论：`post.comments.type: giscus`

## 4. Gitalk 配置步骤

当前线上评论保留 Giscus，因为它已经能工作。Gitalk 需要 GitHub OAuth App 的密钥，不能自动生成。

如需切换 Gitalk：

1. 打开 GitHub：`Settings` -> `Developer settings` -> `OAuth Apps` -> `New OAuth App`
2. `Application name` 填：`ASHUWEI Blog Gitalk`
3. `Homepage URL` 填：`https://wfcrush.github.io/boke/`
4. `Authorization callback URL` 填：`https://wfcrush.github.io/boke/`
5. 创建后复制 `Client ID`，再生成并复制 `Client Secret`
6. 修改 `D:\BoKe\_config.fluid.yml`

```yaml
post:
  comments:
    enable: true
    type: gitalk

gitalk:
  clientID: 你的 Client ID
  clientSecret: 你的 Client Secret
  repo: boke
  owner: WFCrush
  admin: ['WFCrush']
  language: zh-CN
  labels: ['Gitalk']
  perPage: 10
  pagerDirection: last
  distractionFreeMode: false
  createIssueManually: true
```

## 5. SEO 与性能配置

SEO 主配置在 `D:\BoKe\_config.yml`：

```yaml
title: ASHUWEI 的技术笔记
subtitle: 记录编程学习与技术成长的点滴
description: 'ASHUWEI 的技术笔记，面向计算机专业学生，记录技术学习笔记、编程实践、项目复盘和踩坑经验。'
keywords: 计算机专业,编程学习,技术笔记,Hexo,Fluid,前端开发,后端开发,GitHub Pages
url: https://wfcrush.github.io/boke
root: /boke/
permalink: :category/:title/
sitemap:
  path: sitemap.xml
```

已新增：

- `D:\BoKe\source\robots.txt`
- `D:\BoKe\scripts\seo-assets.js`

`seo-assets.js` 会自动补图片 `alt`、`loading="lazy"`、`decoding="async"` 和基础 Schema.org JSON-LD。

## 6. 需要安装的 npm 包

已经安装：

```bash
npm install hexo-wordcount hexo-generator-sitemap hexo-generator-search --save
```

本次已经安装并配置的优化包：

```bash
npm install hexo-image-opt hexo-autonofollow --save
```

说明：

- `hexo-image-opt`：生成 WebP 和响应式图片
- `hexo-autonofollow`：外链自动加 nofollow

注意：`hexo-all-minifier` 在 Windows 本机安装时会拉取 `pngquant-bin`，本机缺少对应原生构建环境会失败。为了保证发布链路稳定，当前没有启用它；如果后续要做 HTML/CSS/JS 极限压缩，建议只在 GitHub Actions 的 Ubuntu 环境中单独测试后再启用。

## 7. 文章模板

文章模板已经改为：

```text
D:\BoKe\scaffolds\post.md
```

新建文章：

```bash
npm run new "文章标题"
```

标准 Front-matter：

```yaml
---
title: 文章标题
date: 2026-05-26 12:00:00
updated: 2026-05-26 12:00:00
author: ASHUWEI
categories:
  - 技术笔记
tags:
  - 编程学习
description: 这里填写 80-150 字文章摘要，用于首页摘要和 SEO 描述。
excerpt: 这里填写首页展示摘要。
cover: /img/home-banner.png
index_img: /img/home-banner.png
banner_img: /img/home-banner.png
top: false
sticky: 0
---
```

## 8. 批量规范文章

脚本位置：

```text
D:\BoKe\tools\normalize-posts.py
```

预览将要执行的改动：

```bash
python tools/normalize-posts.py
```

确认后执行：

```bash
python tools/normalize-posts.py --write
```

## 9. 自动部署

当前已可用的 GitHub Pages 工作流：

```text
D:\BoKe\.github\workflows\pages.yml
```

它使用 GitHub 官方 Pages artifact 部署，不需要 `gh-pages` 分支。

另外提供了 gh-pages 分支版本：

```text
D:\BoKe\.github\workflows\deploy.yml
```

如果切换到 `deploy.yml`，需要到 GitHub 仓库 Settings -> Pages，把发布来源改成 `gh-pages` 分支。

## 10. 提交站点地图

站点地图地址：

```text
https://wfcrush.github.io/boke/sitemap.xml
```

Google Search Console：

1. 打开 `https://search.google.com/search-console`
2. 添加网址前缀：`https://wfcrush.github.io/boke/`
3. 进入 `Sitemaps`
4. 提交：`sitemap.xml`

百度站长平台：

1. 打开 `https://ziyuan.baidu.com/`
2. 添加站点：`https://wfcrush.github.io/boke/`
3. 完成验证
4. 在链接提交中提交：`https://wfcrush.github.io/boke/sitemap.xml`

GitHub Pages 在百度收录上可能较慢，这是平台特性。
