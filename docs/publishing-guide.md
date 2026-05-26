# 文章发布规范

## 标题格式

标题尽量具体，推荐格式：

```text
技术名 + 问题/目标 + 结果
```

示例：

- `Hexo Fluid 博客部署到 GitHub Pages 的完整记录`
- `Node.js 安装依赖失败的排查流程`
- `JavaScript 数组 reduce 方法学习笔记`

## 内容结构

推荐每篇文章包含：

```markdown
## 背景

## 核心笔记

## 踩坑记录

## 总结
```

长文章可以增加：

```markdown
## 环境信息

## 复现步骤

## 解决方案

## 参考资料
```

## 分类规则

分类要少而稳定：

- 博客搭建
- 前端开发
- 后端开发
- 数据结构与算法
- 环境配置
- 学习方法
- 技术笔记

## 标签规则

标签可以更细：

- Hexo
- Fluid
- GitHub Pages
- JavaScript
- Node.js
- Python
- CSS
- Git
- 算法
- 调试

每篇文章建议 2-5 个标签。

## 发布流程

本地预览：

```bash
npm run build
npm run server
```

发布：

```bash
npm run publish
```

也可以用管理员后台：

```bash
npm run admin
```

然后打开：

```text
http://127.0.0.1:5050/
```
