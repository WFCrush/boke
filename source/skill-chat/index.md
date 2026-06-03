---
title: 对话分析
date: 2026-06-04 03:10:00
description: 使用会话密钥保存并续接对话，一键结束后生成关系与梦境分析梳理。
banner_img: /img/home-banner.png
index_img: /img/home-banner.png
comment: false
---

<div class="public-skill-chat" data-skill-chat data-api-base="">
  <section class="psc-hero" aria-labelledby="psc-title">
    <div>
      <p class="psc-kicker">Skill Dialogue</p>
      <h1 id="psc-title">对话分析板块</h1>
      <p class="psc-lead">输入一个只有你知道的会话密钥，系统会保存本次对话；下次使用同一个密钥，可以继续接上。结束时会对整段对话做一次梳理。</p>
    </div>
    <div class="psc-status-panel">
      <span class="psc-status-dot" data-psc-dot></span>
      <div>
        <strong data-psc-status-title>等待连接</strong>
        <span data-psc-status-text>先输入会话密钥。</span>
      </div>
    </div>
  </section>

  <section class="psc-console" aria-label="对话控制台">
    <aside class="psc-control">
      <details class="psc-advanced">
        <summary>高级设置</summary>
        <label class="psc-field">
          <span>服务地址</span>
          <input id="pscApiBase" type="url" placeholder="https://your-api.example.com">
        </label>
      </details>
      <label class="psc-field">
        <span>会话密钥</span>
        <input id="pscSecret" type="password" autocomplete="off" placeholder="至少 6 个字符">
      </label>
      <div class="psc-actions">
        <button id="pscResume" type="button">载入/继续</button>
        <button id="pscNewSecret" type="button" class="psc-quiet">生成密钥</button>
      </div>
      <div class="psc-session-card">
        <span>会话状态</span>
        <strong id="pscSessionState">未载入</strong>
        <code id="pscSessionId">-</code>
      </div>
      <button id="pscEnd" type="button" class="psc-danger">结束对话并分析</button>
      <p class="psc-note">会话密钥不是账号密码，只用于定位你的对话记录。请自行保存；丢失后无法恢复同一段对话。</p>
    </aside>

    <main class="psc-chat" aria-label="Skill 对话窗口">
      <div id="pscMessages" class="psc-messages" aria-live="polite"></div>
      <div id="pscSummary" class="psc-summary" hidden></div>
      <div class="psc-composer">
        <textarea id="pscInput" rows="4" placeholder="写下你想分析的关系、梦境、困惑或一句卡住你的话..." disabled></textarea>
        <button id="pscSend" type="button" disabled>发送</button>
      </div>
    </main>
  </section>
</div>
