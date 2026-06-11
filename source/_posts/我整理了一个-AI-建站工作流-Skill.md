---
title: 我整理了一个 AI 建站工作流 Skill
date: '2026-06-12 04:00:00'
updated: '2026-06-11 19:46:58'
categories:
  - 工具折腾
tags:
  - AI建站
  - ClaudeCode
  - 开源项目
  - 网站设计
---
最近折腾 AI 做网站的时候，我发现一个挺常见的问题：

> AI 写代码很快，但做出来的网站经常“不够好看”。

不是说完全不能用，而是经常会有一些小毛病：配色有点廉价、模块像模板站、字体层级不清楚、按钮不够突出，手机端看起来也不太舒服。

后来我想明白了，问题不一定是 AI 不会写前端，而是我们经常一上来就让它直接写代码。

比如很多人会直接说：

```text
帮我做一个好看的网站。
```

这句话其实太模糊了。AI 不知道你的目标用户是谁，不知道你想要什么风格，也不知道页面要重点转化什么，所以最后很容易生成一个“能看，但不高级”的页面。

## 我整理了一个建站 Skill

所以我把自己常用的一套 AI 建站流程整理成了一个开源项目：

```text
ai-website-skill
```

GitHub 地址：

```text
https://github.com/WFCrush/ai-website-skill
```

它不是那种“一句话自动生成完整网站”的工具，而是一套更稳的工作流模板。

简单说，就是让 AI 不要一上来就写代码，而是先按专业流程把事情想清楚。

## 它主要做什么

这个 Skill 把建站过程拆成了几个阶段：

1. **需求分析**：先弄清楚网站给谁看、解决什么问题、希望用户做什么。
2. **视觉风格定位**：比如极简高级风、科技 SaaS 风、年轻活泼风等。
3. **UI 设计规范**：提前定好颜色、字体、间距、按钮、卡片、图标这些规则。
4. **首页结构与文案**：不是简单堆模块，而是按用户转化逻辑设计首页。
5. **前端实现**：推荐使用 Next.js、TypeScript、Tailwind CSS、shadcn/ui、lucide-react。
6. **截图审查优化**：像设计总监一样挑问题，再针对性修改。
7. **部署上线**：指导部署到 Vercel、Netlify、Cloudflare Pages 等平台。

我觉得这里最关键的一点是：

**先给 AI 标准，再让 AI 执行。**

如果没有标准，AI 就只能凭感觉发挥；但如果提前把风格、颜色、间距、组件规范定清楚，最后生成的页面会稳定很多。

## 适合哪些人

这个项目比较适合这些情况：

- 想用 AI 做网站，但不知道怎么描述需求；
- 经常觉得 AI 生成的网站“不够高级”；
- 想做企业官网、SaaS 官网、个人作品集、Landing Page；
- 想用 Claude Code / OpenClaw 管理网站项目；
- 想有一套固定的建站提示词和审查流程。

如果你已经会前端，也可以把它当成一个“项目启动模板”。

如果你是小白，也可以直接跟着里面的 Markdown 文档一步一步来，不用一开始就理解太多复杂概念。

## 项目里有什么

目前项目结构比较简单，主要是 Markdown 文档：

```text
.claude-plugin/marketplace.json
CLAUDE.md
skills/website/SKILL.md
skills/website/references/templates/website-workflow.md
skills/website/references/templates/prompt-templates.md
skills/website/references/templates/ui-quality-checklist.md
skills/website/references/templates/deployment-checklist.md
```

其中：

- `SKILL.md` 是主工作流规则；
- `website-workflow.md` 是完整建站流程；
- `prompt-templates.md` 是可复制的提示词模板；
- `ui-quality-checklist.md` 是 UI 审查清单；
- `deployment-checklist.md` 是部署上线检查清单。

## 我想解决的问题

这个项目最想解决的不是“自动生成网站”，而是另一个更实际的问题：

> 怎么让 AI 按照产品经理、设计师、前端工程师的流程来做网站，而不是一上来就乱写代码。

我自己现在更推荐这种问法：

```text
请先帮我完成需求分析、风格定位、UI 规范、首页结构，等我确认后再写代码。
网站风格要现代、简洁、高级、有留白，不要廉价渐变和模板感。
```

比起单纯说“帮我做个好看的网站”，这种方式会靠谱很多。

## 开源地址

GitHub：

```text
https://github.com/WFCrush/ai-website-skill
```

如果你也经常用 AI 做网站，或者正在折腾 Claude Code / OpenClaw，可以试试看。

欢迎 Star，也欢迎提建议。后面我可能会继续补一些真实案例和不同行业的网站模板。
