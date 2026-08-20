---
title: 让论文 AI 工具用上自己的 API：一次桌面软件逆向实战
date: '2026-08-21 05:30:00'
updated: '2026-08-20 23:01:16'
categories:
  - 工具折腾
tags:
  - 逆向工程
  - Cython
  - FastAPI
  - Electron
description: >-
  一款论文写作工具把模型供应商锁死在官方中转站，前端连个填 URL 的框都不给。这篇记录一次完整的「测绘 → 定位瓶颈 → 注入补丁 → 修掉衍生
  bug」，顺带七条给后来者的铁律。
---
> 最近在折腾一款叫XX的桌面写作工具。它本质是个"AI 流水线"，把选题、检索、写作、配图、LaTeX 编译串起来，省去了大量手工活。但它有个让我极度不爽的设计——**模型供应商被锁死在OPEN AI官方中转站**，想用自己其他的 API Key 和中转地址？没门。前端连个填 URL 的框都不给你。
>
> 这篇文章不是教你怎么破解付费墙，而是记录一次完整的「**逆向分析 → 定位瓶颈 → 注入补丁 → 修复衍生 bug**」的工程实践，给同样喜欢折腾桌面软件的朋友一点参考。

## 一、先搞清楚你在逆向什么

动手之前，最忌讳的就是一头扎进二进制里乱改。第一步永远是**测绘**。

我用 `ls` 把安装目录扫了一遍，很快厘清了它的技术栈：

- 这是个 **Electron 套壳**的桌面应用；
- 后端是 **FastAPI（Python 3.11）**，但核心逻辑被 **Cython 编译成 `.pyd`** 分发——这意味着你拿不到源码，只有字节码；
- 前端是 **React**，打包成一份被 minify 的 `index-<hash>.js`，变量名全是 `j1`、`z1` 这种；
- 配置存在 `AppData/Roaming/MHAgent/db/aris.db` 这个 SQLite 里。

一句话总结：**能改的是 `.py` 和压缩 JS，不能乱改的是 `.pyd`**。这个边界决定了后面所有打法。

## 二、逆向不是「破解」，是「阅读理解」

很多人对逆向有误解，以为要上什么黑科技。其实 90% 的工作是**阅读理解 + 实验验证**。

### 1. 后端：用 Python 自己读自己

`main.py` 是纯文本，直接读。`.pyd` 读不了源码，但我不需要 100% 还原它——我只需要知道**它导出了哪些函数、签名长什么样**。

做法很简单：写个最小脚本，把后端目录塞进 `sys.path`，直接 `import services.llm_client`，然后打印它的公开函数。再配合 `ast.parse(main.py)` 看 import 链，路由注册逻辑就清楚了。

> **心得**：不要试图把 `.pyd` 反编译成漂亮源码。你只需要「它能被怎么调用」这一层信息，Python 运行时本身就告诉你了。

### 2. 前端：别跟变量名较劲

压缩 JS 里 `j1`、`z1` 每次构建都会变，写死变量名等于埋雷。正确姿势是**用正则锚定「特征串」**——比如我想在「API Key」输入框前面插一个「API Base URL」框，就搜 ``label:`API Key` ``，在它前面注入。更新后只要这段 UI 文案没变，补丁就能自动续命。

### 3. 数据库：最直接的真相

前端显示什么、后端逻辑怎么绕，都不如直接看数据库。一句 `SELECT key, value FROM settings` 就能看到真实落库的 key/value，确认「用户填的 URL 到底有没有被存下来」。结果发现：URL 确实存进去了，但后端 `.pyd` 在 `save_settings` 时又把它覆盖回了官方地址。瓶颈一目了然。

## 三、补丁设计：覆盖，而不是修改

核心原则一句话：**对不可改的 `.pyd`，用「同名 `.py` 覆盖加载」代替「改字节」**。

为什么？因为 `.pyd` 里有个 `verify_endpoint_integrity()` 做字节自检，改了字节就会失败，进而导致技能解密密钥不装载——整个工具就废了。所以我的方案是：

1. 把原 `.pyd` 改名成 `.pyd.bak`；
2. 放一个同名的 `llm_client.py` 接管模块加载（Python 的 FileFinder 扩展模块后缀优先于 `.py`，所以必须改名才能让 `.py` 生效）；
3. 在 `.py` 里完整复现原 `.pyd` 导出的函数签名（`call_llm` / `test_connection` / `describe_image` / `get_env_for_subprocess` …），只是内部逻辑改成读用户配置的 `*_base_url` / `*_api_key` / `*_model_id`，并支持 OpenAI / Anthropic / 智谱 多协议。

> **心得**：补丁函数必须 `async`、参数名顺序和原模块完全一致。差一个字，调用方 `await` 就炸。签名兼容比逻辑正确更优先。

路由层同理：我写了 `routers/settings.py` 覆盖原 `.pyd`，在 `_rebuild()` 里逐条复制原路由，再用一个 `_OVERRIDES` 字典把 `PUT /` 和 `POST /test/{agent}` 替换成补丁实现。

## 四、那个让我加班的小 bug

补丁打完后，填入 `futureppo.top` 的 key 和 `glm-5.2` 模型，点「测试连接」——

```text
连接失败: Unexpected token 'I', "Internal S"... is not valid JSON
```

这个报错很典型：**前端拿到一个非 JSON 的响应，直接 `.json()` 就崩了**。`Internal S` 后面八成是 `Internal Server Error`，也就是后端返回了 500 的 HTML 错误页。

顺藤摸瓜：测试连接走的是 `POST /api/settings/test/{agent}`，而我的 `routers/settings.py` 只是把原实现的 `test_agent_connection` 原样复用，没换成补丁版 `services.llm_client.test_connection`。也就是说——**路由还指向旧实现，旧实现不认用户填的 URL，向上游发请求失败后返 500**。

修复就一行级的事：在 `_OVERRIDES` 里加一条 `("POST", "/test/{agent}"): test_agent_connection`，并把模块级 `test_connection` 也指向补丁版。

> **心得**：FastAPI 的路由 endpoint 在 `_rebuild()` 时就已经把函数引用「焊死」在 `route.endpoint` 上了。你只改模块级变量，路由根本不理你。**要看路由表，不要看变量**——`[ (r.path, r.endpoint.__name__) for r in router.routes ]` 一眼就能看出谁还指向旧函数。

顺便说一句，修好后第一次测通了，第二次变成 `HTTP 429`。别慌，那是上游限流（`channel_rpm_limit_exceeded`），是**正常的 JSON 错误**，不是 bug。限流和配置错误要分得清。

## 五、给后来者的几条铁律

1. **先测绘，后动手**。技术栈、文件边界、反篡改机制，先画清楚地图。
2. **覆盖式补丁 > 修改式补丁**。别碰 `.pyd` / 二进制字节，用同名单文件覆盖加载。
3. **签名兼容优先**。补丁函数 `async`、参数顺序，差一点全盘皆输。
4. **压缩代码用特征串锚定，别写死变量名**。否则一次更新全失效。
5. **命令行验证 > GUI 点击**。写个 `.py` 直接 `import` 调函数，比反复重启应用快十倍。
6. **看路由表，别看变量**。路由 endpoint 是引用绑定，模块级重赋值没用。
7. **留好回滚**。首次运行才备份原文件，提供 `--status` / `--revert`，更新后一键 `reapply`。

## 六、结语

折腾桌面软件最有成就感的地方，不在于「破解」本身，而在于**你用自己的工程直觉，把一个不开放的系统重新变得开放**。整个过程没有魔法，就是：读得懂结构、找得到边界、设计得稳妥、验证得快。

如果你也在折腾某款锁死供应商的 AI 工具，希望这篇能帮你少走两条弯路。happy patching。
