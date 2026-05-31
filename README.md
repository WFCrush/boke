# 我的博客

这是一个基于 Hexo 和 Fluid 主题搭建的个人静态博客项目。

## 小白优先入口

如果你只是想写文章、改内容、发布网站，优先看：

```text
D:\BoKe\小白操作指南.md
```

最高效的方式是只双击：

- `博客工作台.bat`

它里面已经整合了后台、预览、发布、打开文章目录、打开线上网站、安装依赖。

单独入口也保留：

- `开始写博客.bat`
- `预览网站.bat`
- `发布上线.bat`
- `安装或修复依赖.bat`

## 后台编辑

双击：

```text
开始写博客.bat
```

或者手动运行：

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

后台可以新建、编辑、保存文章，也可以上传图片和文件，并发布到 GitHub Pages。

## 本地预览

双击：

```text
预览网站.bat
```

或者手动运行：

```powershell
cd /d D:\BoKe
npm run server
```

预览地址：

```text
http://localhost:4000/boke/
```

## 发布上线

双击：

```text
发布上线.bat
```

或者手动运行：

```powershell
cd /d D:\BoKe
npm run publish
```

发布后通常等待 30 到 90 秒再访问：

```text
https://wfcrush.github.io/boke/
```

自定义域名：

```text
http://wf.5yu.org/
```

## 常用目录

- `source\_posts`：博客文章
- `source\uploads`：公开上传文件
- `source\secure`：安全上传文件
- `source\about`：关于页面
- `_config.yml`：Hexo 主配置
- `_config.fluid.yml`：Fluid 主题配置
- `public`：生成后的静态网站文件，不建议手动修改

## 常用命令

```powershell
npm run admin
npm run server
npm run build
npm run publish
```

## 技术说明

博客由 Hexo 生成静态文件，GitHub Pages 负责托管。你不需要自己购买服务器；但网站仍然是由 GitHub 的服务器和 CDN 对外提供访问。
