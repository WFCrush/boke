---
title: Hexo Fluid 博客部署到 GitHub Pages 的完整记录
date: 2026-05-25 20:00:00
updated: 2026-05-26 12:20:00
author: ASHUWEI
categories:
  - 博客搭建
tags:
  - Hexo
  - Fluid
  - GitHub Pages
description: 记录从本地 Hexo 项目生成静态文件，到使用 GitHub Actions 自动部署到 GitHub Pages 的关键步骤和常见问题。
excerpt: 本文整理 Hexo + Fluid 博客部署到 GitHub Pages 的完整流程，包含本地预览、自动部署和发布排查。
cover: /img/home-banner.png
banner_img: /img/home-banner.png
top: true
sticky: 10
---

## 背景

这个博客使用 Hexo 框架和 Fluid 主题，源码托管在 GitHub 仓库，最终通过 GitHub Pages 发布到公开地址：

```text
https://wfcrush.github.io/
```

我把这篇文章作为博客维护手册，之后遇到发布失败、样式没更新、文章没出现等问题时，可以按这里的顺序排查。

## 本地预览

安装依赖后，可以先在本地生成和预览：

```bash
npm install
npm run build
npm run server
```

默认预览地址通常是：

```text
http://localhost:4000/
```

如果页面能正常打开，说明 Markdown、主题配置和静态资源路径基本没有问题。

## 自动部署流程

当前项目使用 GitHub Actions 自动部署。每次把代码推送到 `main` 分支后，工作流会执行：

```bash
npm ci
npm run build
```

生成的 `public` 目录会被发布到 GitHub Pages。这个方案比手动上传更稳定，也能在 Actions 页面看到每一次部署日志。

## 常见问题

### 文章没有出现

优先检查文章是否放在：

```text
source/_posts/
```

同时确认文章顶部的 Front-matter 没有格式错误，尤其是 `title`、`date`、`categories`、`tags` 字段。

### 样式没有更新

如果本地正常但线上没变，通常是 GitHub Pages 还在部署，或者浏览器缓存没刷新。可以等待 1-3 分钟后强制刷新页面。

### 评论区没有显示

当前评论使用 Giscus。如果要切换成 Gitalk，需要先申请 GitHub OAuth App，并在 `_config.fluid.yml` 中填写 `clientID` 和 `clientSecret`。

## 总结

Hexo 的核心流程是“写 Markdown、生成静态文件、推送部署”。把发布流程交给 GitHub Actions 后，日常维护会简单很多，重点就可以放在内容本身和主题体验优化上。
