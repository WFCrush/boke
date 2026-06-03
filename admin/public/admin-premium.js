(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var scheduled = false;
  var tooltipEl = null;
  var statusEls = null;

  function byId(id) {
    return doc.getElementById(id);
  }

  function all(selector, scope) {
    return Array.prototype.slice.call((scope || doc).querySelectorAll(selector));
  }

  function ready(fn) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      updateAll();
    });
  }

  function addClass(id, className) {
    var el = byId(id);
    if (el) el.classList.add(className);
    return el;
  }

  function setTooltip(el, text) {
    if (!el || !text) return;
    el.setAttribute('data-admin-premium-tooltip', text);
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', text.replace(/。.*$/, ''));
  }

  function enhanceStructure() {
    root.classList.add('admin-premium-enhanced');

    var toolbar = doc.querySelector('.md-toolbar');
    if (toolbar) toolbar.classList.add('admin-premium-toolbar');

    var editArea = doc.querySelector('.edit-area');
    if (editArea) editArea.classList.add('admin-premium-edit-area');

    addClass('content', 'admin-premium-content');
    addClass('preview', 'admin-premium-preview');
    addClass('dropOverlay', 'admin-premium-drop-overlay');

    var dropHint = doc.querySelector('.drop-hint');
    if (dropHint) {
      dropHint.classList.add('admin-premium-drop-hint');
      dropHint.setAttribute('data-admin-premium-hint', '支持 Markdown、ZIP、图片和常见文档；附件会插入到正文光标处。');
    }

    var autosave = byId('autosaveStatus');
    if (autosave) autosave.classList.add('admin-premium-autosave-state');

    var preview = byId('preview');
    if (preview) {
      preview.setAttribute('role', 'region');
      preview.setAttribute('aria-label', 'Markdown 预览');
      preview.setAttribute('data-admin-premium-empty', '预览区域会在这里呈现正文排版。先写几句内容，再切换预览即可查看效果。');
    }

    var content = byId('content');
    if (content) {
      content.setAttribute('aria-label', '文章正文 Markdown 编辑区');
      content.setAttribute('autocomplete', 'off');
    }

    enhanceTabs();
    enhanceToolbarButtons();
    enhanceActionBar();
    enhanceTooltips();
  }

  function enhanceTabs() {
    var topbarLeft = doc.querySelector('.topbar-left');
    if (topbarLeft) topbarLeft.setAttribute('role', 'tablist');
    all('.nav-tab').forEach(function (tab) {
      tab.setAttribute('role', 'tab');
      if (tab.dataset && tab.dataset.tab) {
        tab.setAttribute('aria-controls', 'admin-premium-panel-' + tab.dataset.tab);
      }
    });
    all('.tab-panel').forEach(function (panel) {
      if (panel.dataset && panel.dataset.panel) {
        panel.id = panel.id || 'admin-premium-panel-' + panel.dataset.panel;
        panel.setAttribute('role', 'tabpanel');
      }
    });
  }

  function enhanceToolbarButtons() {
    var labels = {
      bold: '加粗，Ctrl+B',
      italic: '斜体，Ctrl+I',
      heading: '插入二级标题',
      quote: '插入引用',
      link: '插入链接，Ctrl+K',
      code: '行内代码',
      codeblock: '代码块',
      ul: '无序列表',
      ol: '有序列表',
      hr: '分隔线',
      columns: '双栏内容块'
    };

    all('.md-toolbar [data-md]').forEach(function (btn) {
      var label = labels[btn.dataset.md] || 'Markdown 工具';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-pressed', 'false');
      setTooltip(btn, label);
    });

    var previewToggle = byId('previewToggle');
    if (previewToggle) {
      previewToggle.setAttribute('aria-controls', 'preview');
      setTooltip(previewToggle, '切换 Markdown 预览，快捷键 Ctrl+P。');
    }

    setTooltip(byId('uploadBtn'), '普通上传会把文件链接插入正文光标位置。');
    setTooltip(byId('zipUploadBtn'), '作为附件上传 ZIP，并插入下载链接。');
    setTooltip(byId('protectedUploadBtn'), '加密上传会提示设置打开密码，请自行保存密码。');
    setTooltip(byId('importMdBtn'), '导入 Markdown 文件或文章包；普通附件请用编辑器工具栏上传。');
  }

  function enhanceActionBar() {
    var left = doc.querySelector('.action-bar-left');
    if (!left || left.querySelector('.admin-premium-status-rail')) return;

    var rail = doc.createElement('div');
    rail.className = 'admin-premium-status-rail';
    rail.setAttribute('aria-live', 'polite');
    rail.innerHTML = [
      '<span class="admin-premium-status-pill" data-admin-premium-status>空白草稿</span>',
      '<span class="admin-premium-metric" data-admin-premium-reading>0 分钟阅读</span>',
      '<span class="admin-premium-metric" data-admin-premium-structure>0 标题</span>'
    ].join('');
    left.appendChild(rail);
    statusEls = {
      status: rail.querySelector('[data-admin-premium-status]'),
      reading: rail.querySelector('[data-admin-premium-reading]'),
      structure: rail.querySelector('[data-admin-premium-structure]')
    };

    addClass('saveBtn', 'admin-premium-primary-action');
    addClass('publishBtn', 'admin-premium-danger-action');
    addClass('deleteBtn', 'admin-premium-quiet-action');
    setTooltip(byId('saveBtn'), '保存当前文章，快捷键 Ctrl+S。');
    setTooltip(byId('publishBtn'), '发布前会先保存当前改动，再生成公开站点。');
    setTooltip(byId('deleteBtn'), '移入回收站，可在更多页恢复。');
  }

  function enhanceTooltips() {
    if (tooltipEl) return;
    tooltipEl = doc.createElement('div');
    tooltipEl.className = 'admin-premium-upload-tip';
    tooltipEl.setAttribute('role', 'tooltip');
    doc.body.appendChild(tooltipEl);

    doc.addEventListener('pointerover', function (event) {
      var target = event.target.closest && event.target.closest('[data-admin-premium-tooltip]');
      if (target) showTooltip(target);
    });
    doc.addEventListener('pointerout', function (event) {
      var target = event.target.closest && event.target.closest('[data-admin-premium-tooltip]');
      if (target && (!event.relatedTarget || !target.contains(event.relatedTarget))) hideTooltip();
    });
    doc.addEventListener('focusin', function (event) {
      if (event.target.matches && event.target.matches('[data-admin-premium-tooltip]')) showTooltip(event.target);
    });
    doc.addEventListener('focusout', function (event) {
      if (event.target.matches && event.target.matches('[data-admin-premium-tooltip]')) hideTooltip();
    });
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);
  }

  function showTooltip(target) {
    if (!tooltipEl || !target) return;
    var text = target.getAttribute('data-admin-premium-tooltip');
    if (!text) return;
    tooltipEl.textContent = text;
    tooltipEl.classList.add('admin-premium-is-visible');

    var rect = target.getBoundingClientRect();
    var tooltipRect = tooltipEl.getBoundingClientRect();
    var left = Math.min(Math.max(12, rect.left), window.innerWidth - tooltipRect.width - 12);
    var top = rect.bottom + 8;
    if (top + tooltipRect.height > window.innerHeight - 12) top = rect.top - tooltipRect.height - 8;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = Math.max(12, top) + 'px';
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('admin-premium-is-visible');
  }

  function updateAll() {
    updateTabs();
    updateDirtyState();
    updateMetrics();
    updateToolbarState();
    updatePreviewState();
    decorateEmptyStates();
  }

  function updateTabs() {
    all('.nav-tab').forEach(function (tab) {
      tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
      tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
    });
    all('.tab-panel').forEach(function (panel) {
      panel.setAttribute('aria-hidden', panel.classList.contains('active') ? 'false' : 'true');
    });
  }

  function updateDirtyState() {
    var autosave = byId('autosaveStatus');
    var dirty = !!(autosave && autosave.classList.contains('dirty'));
    root.classList.toggle('admin-premium-dirty', dirty);
    if (autosave) autosave.setAttribute('aria-live', 'polite');
  }

  function updateMetrics() {
    if (!statusEls) return;
    var content = byId('content');
    var title = byId('title');
    var currentFile = byId('currentFile');
    var text = content ? content.value || '' : '';
    var compactCount = text.replace(/\s/g, '').length;
    var headings = (text.match(/^#{1,6}\s+.+$/gm) || []).length;
    var images = (text.match(/!\[[^\]]*\]\([^\)]+\)/g) || []).length + (text.match(/<img\b/gi) || []).length;
    var minutes = compactCount ? Math.max(1, Math.ceil(compactCount / 450)) : 0;
    var titleText = title ? title.value.trim() : '';
    var fileText = currentFile ? currentFile.textContent.trim() : '';
    var dirty = root.classList.contains('admin-premium-dirty');
    var statusText = '空白草稿';

    if (dirty) statusText = '有未保存改动';
    else if (fileText && !/尚未保存|未保存|灏氭湭/.test(fileText)) statusText = '已关联文件';
    else if (titleText || compactCount) statusText = '新文章草稿';

    statusEls.status.textContent = statusText;
    statusEls.status.classList.toggle('admin-premium-status-attention', dirty);
    statusEls.status.classList.toggle('admin-premium-status-empty', !titleText && !compactCount);
    statusEls.reading.textContent = minutes ? minutes + ' 分钟阅读' : '0 分钟阅读';
    statusEls.structure.textContent = headings + ' 标题' + (images ? ' / ' + images + ' 图' : '');
  }

  function updateToolbarState() {
    var content = byId('content');
    if (!content) return;
    var start = content.selectionStart || 0;
    var end = content.selectionEnd || start;
    var text = content.value || '';
    var lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    var lineEndIndex = text.indexOf('\n', start);
    var lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
    var line = text.slice(lineStart, lineEnd);
    var selection = text.slice(start, end);
    var before = text.slice(Math.max(0, start - 4), start);
    var after = text.slice(end, Math.min(text.length, end + 4));
    var fencedBefore = (text.slice(0, start).match(/```/g) || []).length;

    all('.md-toolbar [data-md]').forEach(function (btn) {
      var action = btn.dataset.md;
      var active = false;
      if (action === 'bold') active = !!selection && before.endsWith('**') && after.startsWith('**');
      if (action === 'italic') active = !!selection && before.endsWith('*') && after.startsWith('*') && !before.endsWith('**');
      if (action === 'heading') active = /^#{1,6}\s+/.test(line);
      if (action === 'quote') active = /^\s*>\s?/.test(line);
      if (action === 'code') active = !!selection && before.endsWith('`') && after.startsWith('`');
      if (action === 'codeblock') active = fencedBefore % 2 === 1;
      if (action === 'ul') active = /^\s*[-*+]\s+/.test(line);
      if (action === 'ol') active = /^\s*\d+\.\s+/.test(line);
      btn.classList.toggle('admin-premium-is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    var previewToggle = byId('previewToggle');
    if (previewToggle) previewToggle.setAttribute('aria-pressed', previewToggle.classList.contains('active') ? 'true' : 'false');
  }

  function updatePreviewState() {
    var preview = byId('preview');
    var content = byId('content');
    if (!preview || !content) return;
    var empty = !content.value.trim();
    preview.classList.toggle('admin-premium-preview-empty', empty);
  }

  function decorateEmptyStates() {
    all('.empty, .empty-card').forEach(function (el) {
      el.classList.add('admin-premium-empty-state');
    });

    var postList = byId('postList');
    if (postList) {
      postList.classList.toggle('admin-premium-has-empty', !!postList.querySelector('.empty, .empty-card'));
    }
  }

  function observeMutations() {
    var autosave = byId('autosaveStatus');
    if (autosave) {
      new MutationObserver(scheduleUpdate).observe(autosave, { attributes: true, childList: true, characterData: true, subtree: true });
    }

    var previewToggle = byId('previewToggle');
    if (previewToggle) {
      new MutationObserver(scheduleUpdate).observe(previewToggle, { attributes: true, attributeFilter: ['class'] });
    }

    var preview = byId('preview');
    if (preview) {
      new MutationObserver(scheduleUpdate).observe(preview, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
    }

    ['postList', 'postTableBody', 'trashTableBody', 'toastContainer'].forEach(function (id) {
      var target = byId(id);
      if (!target) return;
      new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
            if (node.nodeType !== 1) return;
            if (id === 'toastContainer') node.classList.add('admin-premium-toast');
          });
        });
        scheduleUpdate();
      }).observe(target, { childList: true, subtree: true });
    });
  }

  function bindPassiveEvents() {
    var content = byId('content');
    if (content) {
      content.addEventListener('focus', function () { root.classList.add('admin-premium-content-focused'); });
      content.addEventListener('blur', function () { root.classList.remove('admin-premium-content-focused'); });
      ['input', 'keyup', 'click', 'select'].forEach(function (eventName) {
        content.addEventListener(eventName, scheduleUpdate);
      });
    }

    doc.addEventListener('selectionchange', function () {
      if (doc.activeElement === content) scheduleUpdate();
    });
    doc.addEventListener('input', scheduleUpdate, true);
    doc.addEventListener('change', scheduleUpdate, true);
    doc.addEventListener('click', function () {
      window.setTimeout(scheduleUpdate, 80);
      window.setTimeout(scheduleUpdate, 450);
    }, true);
  }

  function init() {
    enhanceStructure();
    bindPassiveEvents();
    observeMutations();
    scheduleUpdate();
    window.setTimeout(scheduleUpdate, 600);
  }

  ready(init);
}());
