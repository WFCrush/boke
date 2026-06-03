(function () {
  var ARTICLE_SELECTOR = '.post-content .markdown-body';
  var HEADING_SELECTOR = 'h2,h3,h4,h5,h6';
  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function make(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof value === 'string') node.textContent = value;
    return node;
  }

  function text(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isReducedMotion() {
    return !!(reducedMotion && reducedMotion.matches);
  }

  function absoluteTop(node) {
    return node.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
  }

  function headingLevel(node) {
    return Number((node.tagName || '').replace('H', '')) || 2;
  }

  function normalizeId(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  function collectHeadings(article) {
    var used = {};
    return Array.prototype.slice.call(article.querySelectorAll(HEADING_SELECTOR)).filter(function (heading, index) {
      var value = text(heading);
      if (!value) return false;
      if (!heading.id) {
        var base = normalizeId(value) || 'section';
        var id = 'post-plus-' + base;
        var suffix = 2;
        while (document.getElementById(id) || used[id]) {
          id = 'post-plus-' + base + '-' + suffix;
          suffix += 1;
        }
        heading.id = id;
      }
      used[heading.id] = true;
      heading.dataset.postPlusIndex = String(index + 1);
      return true;
    });
  }

  function buildStats(article, headings) {
    var codeBlocks = Array.prototype.slice.call(article.querySelectorAll('pre')).filter(function (pre) {
      return !pre.closest('.gutter') && !pre.querySelector('code.mermaid');
    });
    var images = article.querySelectorAll('img');
    return {
      headingCount: headings.length,
      codeCount: codeBlocks.length,
      imageCount: images.length,
      textSize: text(article).length
    };
  }

  function createStat(label, value) {
    var item = make('div', 'post-plus-stat');
    item.appendChild(make('span', 'post-plus-stat-label', label));
    item.appendChild(make('strong', '', String(value)));
    return item;
  }

  function createOverview(article, headings, stats) {
    var panel = make('aside', 'post-plus-overview');
    panel.setAttribute('aria-label', '\u6587\u7ae0\u9605\u8bfb\u8f85\u52a9');

    var head = make('div', 'post-plus-overview-head');
    head.appendChild(make('span', 'post-plus-overview-title', '\u9605\u8bfb\u8f85\u52a9'));
    head.appendChild(make('span', 'post-plus-longform-badge', stats.textSize > 6000 || headings.length >= 8 ? '\u957f\u6587\u6a21\u5f0f' : '\u7cbe\u8bfb\u6a21\u5f0f'));

    var grid = make('div', 'post-plus-stat-grid');
    grid.appendChild(createStat('\u7ae0\u8282', stats.headingCount || '\u65e0\u76ee\u5f55'));
    grid.appendChild(createStat('\u4ee3\u7801\u5757', stats.codeCount));
    grid.appendChild(createStat('\u914d\u56fe', stats.imageCount));

    var current = make('div', 'post-plus-current-section');
    var top = make('div', 'post-plus-current-top');
    var left = make('span', 'post-plus-current-label', '\u5f53\u524d\u7ae0\u8282');
    var link = make('a', 'post-plus-current-link', headings[0] ? text(headings[0]) : '\u6b63\u6587');
    link.href = headings[0] ? '#' + headings[0].id : '#seo-header';
    var index = make('span', 'post-plus-current-index', headings.length ? '1/' + headings.length : '\u6b63\u6587');
    top.appendChild(left);
    top.appendChild(link);
    top.appendChild(index);

    var meter = make('div', 'post-plus-meter');
    var fill = make('div', 'post-plus-meter-fill');
    meter.setAttribute('aria-hidden', 'true');
    meter.appendChild(fill);
    current.appendChild(top);
    current.appendChild(meter);

    panel.appendChild(head);
    panel.appendChild(grid);
    panel.appendChild(current);
    article.insertBefore(panel, article.firstChild);

    return {
      panel: panel,
      currentLink: link,
      currentIndex: index,
      fill: fill
    };
  }

  function createMobileToc(article, headings, afterNode) {
    if (headings.length < 4) return null;

    var details = make('details', 'post-plus-mobile-toc');
    var summary = make('summary', 'post-plus-mobile-toc-summary');
    summary.appendChild(make('span', '', '\u6587\u7ae0\u76ee\u5f55'));
    summary.appendChild(make('span', 'post-plus-toc-count', headings.length + ' \u8282'));
    details.appendChild(summary);

    var list = make('ol', 'post-plus-mobile-toc-list');
    headings.forEach(function (heading, index) {
      var item = make('li', 'post-plus-mobile-toc-item post-plus-depth-' + headingLevel(heading));
      var link = make('a', 'post-plus-mobile-toc-link', text(heading));
      link.href = '#' + heading.id;
      link.dataset.postPlusTarget = heading.id;
      item.dataset.postPlusTarget = heading.id;
      item.dataset.postPlusIndex = String(index + 1);
      item.appendChild(link);
      list.appendChild(item);
    });
    details.appendChild(list);

    if (afterNode && afterNode.parentNode === article) {
      article.insertBefore(details, afterNode.nextSibling);
    } else {
      article.insertBefore(details, article.firstChild);
    }
    return details;
  }

  function createTocPanel(toc, headings) {
    if (!toc || toc.querySelector('.post-plus-toc-panel')) return null;

    toc.classList.add('post-plus-toc-enhanced');

    var panel = make('div', 'post-plus-toc-panel');
    var status = make('div', 'post-plus-toc-status');
    status.appendChild(make('span', 'post-plus-toc-label', '\u7ae0\u8282\u5b9a\u4f4d'));
    status.appendChild(make('span', 'post-plus-toc-count', '0/' + headings.length));

    var current = make('div', 'post-plus-toc-current', headings[0] ? text(headings[0]) : '\u6b63\u6587');
    var actions = make('div', 'post-plus-toc-actions');
    var focus = make('button', 'post-plus-toc-action', '\u5b9a\u4f4d');
    var expand = make('button', 'post-plus-toc-action', '\u5c55\u5f00');
    var compact = make('button', 'post-plus-toc-action', '\u7cbe\u7b80');
    focus.type = 'button';
    expand.type = 'button';
    compact.type = 'button';
    compact.setAttribute('aria-pressed', 'false');
    actions.appendChild(focus);
    actions.appendChild(expand);
    actions.appendChild(compact);

    panel.appendChild(status);
    panel.appendChild(current);
    panel.appendChild(actions);

    var body = toc.querySelector('#toc-body, .toc-body');
    toc.insertBefore(panel, body || toc.firstChild);

    expand.addEventListener('click', function () {
      toc.querySelectorAll('.tocbot-is-collapsed').forEach(function (node) {
        node.classList.remove('tocbot-is-collapsed');
      });
    });

    compact.addEventListener('click', function () {
      var active = toc.classList.toggle('post-plus-toc-compact');
      compact.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    focus.addEventListener('click', function () {
      var link = toc.querySelector('.post-plus-toc-current-item > a, .tocbot-active-link');
      if (link) {
        link.scrollIntoView({ block: 'center', behavior: isReducedMotion() ? 'auto' : 'smooth' });
      }
    });

    return {
      root: toc,
      body: body,
      current: current,
      count: status.querySelector('.post-plus-toc-count')
    };
  }

  function prepareTocLinks(toc) {
    if (!toc) return;
    toc.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.classList.add('post-plus-toc-link');
      if (!link.getAttribute('title')) link.setAttribute('title', text(link));
    });
  }

  function observeToc(toc) {
    if (!toc || toc.dataset.postPlusObserved) return;
    toc.dataset.postPlusObserved = 'true';
    prepareTocLinks(toc);
    var body = toc.querySelector('#toc-body, .toc-body') || toc;
    var observer = new MutationObserver(function () {
      prepareTocLinks(toc);
    });
    observer.observe(body, { childList: true, subtree: true });
  }

  function enhanceCodeBlocks(article) {
    var blocks = [];
    article.querySelectorAll('pre').forEach(function (pre) {
      if (pre.closest('.gutter') || pre.querySelector('code.mermaid')) return;
      var block = pre.closest('figure.highlight') || pre.closest('.code-wrapper');
      var wrapped = false;
      if (!block) {
        block = make('div');
        pre.parentNode.insertBefore(block, pre);
        block.appendChild(pre);
        wrapped = true;
      }
      if (!wrapped && block.classList.contains('post-plus-code-block')) return;
      block.classList.add('post-plus-code-block');

      var meta = make('div', 'post-plus-code-meta');
      var info = make('div', 'post-plus-code-info');
      info.appendChild(make('span', 'post-plus-code-language', detectLanguage(block, pre)));
      info.appendChild(make('span', 'post-plus-code-lines', countLines(block, pre) + ' \u884c'));
      meta.appendChild(info);
      meta.appendChild(make('span', 'post-plus-code-hint', '\u6a2a\u5411\u6eda\u52a8'));

      if (block.tagName && block.tagName.toLowerCase() === 'figure') {
        block.insertBefore(meta, block.firstChild);
      } else {
        block.insertBefore(meta, pre);
      }

      block.querySelectorAll('.copy-btn').forEach(function (copy) {
        copy.classList.add('post-plus-copy-ready');
        copy.setAttribute('role', 'button');
        copy.setAttribute('tabindex', '0');
        copy.setAttribute('title', '\u590d\u5236\u4ee3\u7801');
        copy.setAttribute('aria-label', '\u590d\u5236\u4ee3\u7801');
        copy.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            copy.click();
          }
        });
      });
      blocks.push({ block: block, pre: pre });
    });

    function updateScrollable() {
      blocks.forEach(function (item) {
        item.block.classList.toggle('post-plus-code-scrollable', item.pre.scrollWidth > item.pre.clientWidth + 2);
      });
    }
    updateScrollable();
    window.addEventListener('resize', updateScrollable);
    setTimeout(updateScrollable, 300);
  }

  function detectLanguage(block, pre) {
    var value = pre.getAttribute('data-language') || block.getAttribute('data-language') || '';
    var code = pre.querySelector('code');
    var classes = [];
    if (code) classes = classes.concat(Array.prototype.slice.call(code.classList));
    classes = classes.concat(Array.prototype.slice.call(pre.classList));
    classes = classes.concat(Array.prototype.slice.call(block.classList));
    classes.some(function (cls) {
      if (/^(language|lang)-/.test(cls)) {
        value = cls.replace(/^(language|lang)-/, '');
        return true;
      }
      if (!/^(highlight|hljs|code-wrapper|post-plus-code-block|post-plus-code-scrollable)$/.test(cls)) {
        value = cls;
        return true;
      }
      return false;
    });
    var widget = pre.querySelector('.code-widget');
    if (!value && widget) value = text(widget).replace(/[^a-z0-9+#-]/ig, '');
    return (value || 'TEXT').toUpperCase();
  }

  function countLines(block, pre) {
    var holder = block.querySelector('td.code pre') || pre;
    var clone = holder.cloneNode(true);
    clone.querySelectorAll('.code-widget, .copy-btn').forEach(function (node) {
      node.remove();
    });
    var value = clone.textContent.replace(/\n$/, '');
    if (!value) return 1;
    return value.split(/\n/).length;
  }

  function usefulCaption(value) {
    value = String(value || '').trim();
    if (!value || value.length < 2) return false;
    if (/^(image|img|photo|screenshot|avatar)$/i.test(value)) return false;
    if (/^ASHUWEI\s/.test(value)) return false;
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(value)) return false;
    return true;
  }

  function enhanceImages(article) {
    var index = 0;
    article.querySelectorAll('img').forEach(function (img) {
      var target = img.closest('a.fancybox') || img;
      var caption = nextCaption(target) || nextCaption(img);
      if (!caption && usefulCaption(img.getAttribute('alt') || img.getAttribute('title'))) {
        caption = make('figcaption', 'post-plus-image-caption', img.getAttribute('alt') || img.getAttribute('title'));
        target.parentNode.insertBefore(caption, target.nextSibling);
      }
      if (!caption) return;

      index += 1;
      caption.classList.add('post-plus-image-caption');
      caption.removeAttribute('aria-hidden');
      if (!caption.querySelector('.post-plus-image-index')) {
        var marker = make('span', 'post-plus-image-index', '\u56fe ' + index);
        caption.insertBefore(marker, caption.firstChild);
      }
      target.classList.add('post-plus-image-target');
      if (target.parentElement && /^(p|figure)$/i.test(target.parentElement.tagName)) {
        target.parentElement.classList.add('post-plus-image-frame');
      }
    });
  }

  function nextCaption(node) {
    var next = node ? node.nextElementSibling : null;
    return next && next.tagName && next.tagName.toLowerCase() === 'figcaption' ? next : null;
  }

  function createFinishCard(article, stats, headings) {
    var card = make('section', 'post-plus-finish-card');
    card.setAttribute('aria-live', 'polite');
    var title = make('h2', 'post-plus-finish-title', '\u9605\u8bfb\u6536\u675f');
    var mark = make('span', 'post-plus-complete-mark', '\u8fdb\u884c\u4e2d');
    title.appendChild(mark);
    var copy = make('p', 'post-plus-finish-copy', '\u672c\u7bc7\u5171 ' + (headings.length || 1) + ' \u4e2a\u7ae0\u8282\u3001' + stats.codeCount + ' \u4e2a\u4ee3\u7801\u5757\u3001' + stats.imageCount + ' \u5f20\u914d\u56fe\u3002');
    var actions = make('div', 'post-plus-finish-actions');
    var top = make('button', 'post-plus-finish-button', headings.length ? '\u56de\u5230\u76ee\u5f55' : '\u56de\u5230\u5f00\u5934');
    top.type = 'button';
    top.addEventListener('click', function () {
      var target = document.querySelector('.post-plus-mobile-toc') || document.getElementById('toc') || document.getElementById('seo-header') || article;
      target.scrollIntoView({ block: 'start', behavior: isReducedMotion() ? 'auto' : 'smooth' });
    });
    actions.appendChild(top);
    card.appendChild(title);
    card.appendChild(copy);
    card.appendChild(actions);
    article.appendChild(card);
    return { card: card, mark: mark };
  }

  function createScrollController(article, headings, overview, mobileToc, tocPanel, finish) {
    var ticking = false;
    var completed = false;

    function update() {
      ticking = false;
      var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      var readingLine = scrollY + Math.min(window.innerHeight * 0.32, 180);
      var articleTop = absoluteTop(article);
      var articleBottom = articleTop + article.offsetHeight;
      var activeIndex = -1;
      var readCount = 0;

      headings.forEach(function (heading, index) {
        var top = absoluteTop(heading);
        var next = headings[index + 1] ? absoluteTop(headings[index + 1]) : articleBottom;
        if (top - 100 <= readingLine) activeIndex = index;
        if (readingLine >= next - 80) readCount += 1;
      });

      var activeHeading = headings[activeIndex] || headings[0];
      var start = activeHeading ? absoluteTop(activeHeading) : articleTop;
      var end = headings[activeIndex + 1] ? absoluteTop(headings[activeIndex + 1]) : articleBottom;
      var progress = clamp((readingLine - start) / Math.max(end - start, 1), 0, 1);
      var title = activeHeading ? text(activeHeading) : '\u6b63\u6587';
      var activeId = activeHeading ? activeHeading.id : '';

      updateOverview(overview, activeHeading, activeIndex, headings.length, progress);
      updateMobileToc(mobileToc, activeId, readCount, headings.length);
      updateDesktopToc(tocPanel, activeId, title, readCount, headings.length);

      if (!completed && articleBottom <= scrollY + window.innerHeight * 1.08) {
        completed = true;
        finish.card.classList.add('post-plus-finish-done');
        finish.mark.textContent = '\u5df2\u5b8c\u6210';
        try {
          sessionStorage.setItem('post-plus-complete:' + location.pathname, '1');
        } catch (e) {}
      }
    }

    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    setTimeout(requestUpdate, 500);
  }

  function updateOverview(overview, activeHeading, activeIndex, total, progress) {
    if (!overview) return;
    overview.currentLink.textContent = activeHeading ? text(activeHeading) : '\u6b63\u6587';
    overview.currentLink.href = activeHeading ? '#' + activeHeading.id : '#seo-header';
    overview.currentIndex.textContent = total ? Math.max(activeIndex + 1, 1) + '/' + total + ' - \u672c\u8282 ' + Math.round(progress * 100) + '%' : '\u6b63\u6587';
    overview.fill.style.width = Math.round(progress * 100) + '%';
  }

  function updateMobileToc(mobileToc, activeId, readCount, total) {
    if (!mobileToc) return;
    var count = mobileToc.querySelector('.post-plus-toc-count');
    if (count) count.textContent = readCount + '/' + total;
    mobileToc.querySelectorAll('.post-plus-mobile-toc-item').forEach(function (item) {
      item.classList.toggle('post-plus-mobile-toc-current', item.dataset.postPlusTarget === activeId);
    });
  }

  function updateDesktopToc(tocPanel, activeId, title, readCount, total) {
    if (!tocPanel || !tocPanel.root) return;
    prepareTocLinks(tocPanel.root);
    if (tocPanel.current) tocPanel.current.textContent = title || '\u6b63\u6587';
    if (tocPanel.count) tocPanel.count.textContent = readCount + '/' + total;
    tocPanel.root.querySelectorAll('.post-plus-toc-current-item').forEach(function (item) {
      item.classList.remove('post-plus-toc-current-item');
    });
    tocPanel.root.querySelectorAll('.post-plus-toc-link').forEach(function (link) {
      var href = decodeHash(link.getAttribute('href') || '');
      var isCurrent = href === activeId;
      link.classList.toggle('post-plus-toc-read', isHeadingRead(href, readCount));
      if (isCurrent && link.parentElement) link.parentElement.classList.add('post-plus-toc-current-item');
    });
  }

  function decodeHash(value) {
    value = String(value || '').replace(/^#/, '');
    try {
      return decodeURIComponent(value);
    } catch (e) {
      return value;
    }
  }

  function isHeadingRead(id, readCount) {
    var heading = id ? document.getElementById(id) : null;
    var index = heading ? Number(heading.dataset.postPlusIndex || 0) : 0;
    return index > 0 && index <= readCount;
  }

  ready(function () {
    var article = document.querySelector(ARTICLE_SELECTOR);
    if (!article || article.dataset.postPlusReady) return;
    article.dataset.postPlusReady = 'true';
    document.body.classList.add('post-plus-ready');

    var headings = collectHeadings(article);
    var stats = buildStats(article, headings);
    var overview = createOverview(article, headings, stats);
    var mobileToc = createMobileToc(article, headings, overview.panel);
    var toc = document.getElementById('toc');
    var tocPanel = createTocPanel(toc, headings);

    observeToc(toc);
    enhanceCodeBlocks(article);
    enhanceImages(article);

    var finish = createFinishCard(article, stats, headings);
    createScrollController(article, headings, overview, mobileToc, tocPanel, finish);
  });
})();
