(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function normalizedPath() {
    var path = window.location.pathname || '/';
    path = path.replace(/\/index\.html$/i, '/');
    if (path !== '/' && path.charAt(path.length - 1) !== '/') path += '/';
    return path;
  }

  function isHomePage() {
    var path = normalizedPath();
    return path === '/';
  }

  function siteRoot() {
    return '/';
  }

  function text(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function metaContent(selector) {
    var node = document.querySelector(selector);
    return node ? (node.getAttribute('content') || '').trim() : '';
  }

  function defaultHomeProfile() {
    var subtitle = document.getElementById('subtitle');
    var typedSubtitle = subtitle ? (text(subtitle) || subtitle.getAttribute('data-typed-text') || '') : '';
    return {
      kicker: 'NOTEBOOK',
      title: '近期笔记与个人实践',
      intro: metaContent('meta[name="description"]') ||
        metaContent('meta[property="og:description"]') ||
        typedSubtitle ||
        '记录学习、项目和日常复盘。'
    };
  }

  function normalizeHomeProfile(profile) {
    var fallback = defaultHomeProfile();
    profile = profile || {};
    return {
      kicker: String(profile.kicker || fallback.kicker).trim(),
      title: String(profile.title || fallback.title).trim(),
      intro: String(profile.intro || profile.summary || fallback.intro).trim()
    };
  }

  function applyHomeProfile(profile) {
    var normalized = normalizeHomeProfile(profile);
    var shell = document.querySelector('.home-premium-shell');
    if (!shell) return;
    var kicker = shell.querySelector('.home-premium-kicker');
    var title = shell.querySelector('.home-premium-title');
    var summary = shell.querySelector('.home-premium-summary');
    if (kicker && normalized.kicker) kicker.textContent = normalized.kicker;
    if (title && normalized.title) title.textContent = normalized.title;
    if (summary && normalized.intro) summary.textContent = normalized.intro;
  }

  var homeProfilePromise = null;
  function loadHomeProfile() {
    if (!homeProfilePromise) {
      homeProfilePromise = fetch(siteRoot() + 'home-profile.json', { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('home profile not found');
          return res.json();
        })
        .catch(function () {
          return defaultHomeProfile();
        });
    }
    return homeProfilePromise;
  }

  function make(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function makeLink(className, href, value) {
    var link = make('a', className, value);
    link.setAttribute('href', href || '#');
    return link;
  }

  function shortDate(value) {
    if (!value) return '未标注日期';
    return value.replace(/\s.+$/, '').replace(/-/g, '.');
  }

  function readTime(excerpt) {
    var count = (excerpt || '').replace(/\s+/g, '').length;
    return Math.max(2, Math.ceil(count / 260));
  }

  function getMetaLinks(card, type) {
    var selector = type === 'tag' ? 'a[href*="/tags/"]' : 'a[href*="/categories/"]';
    return Array.prototype.slice.call(card.querySelectorAll(selector)).map(function (link) {
      return {
        name: text(link).replace(/^#/, ''),
        href: link.getAttribute('href') || link.href || '#'
      };
    }).filter(function (item) {
      return item.name;
    });
  }

  function getPost(card, index) {
    var titleLink = card.querySelector('.index-header a');
    var time = card.querySelector('time');
    var excerpt = text(card.querySelector('.index-excerpt'));
    var categories = getMetaLinks(card, 'category');
    var tags = getMetaLinks(card, 'tag');
    var dateValue = time ? (time.getAttribute('datetime') || text(time)) : '';
    return {
      card: card,
      index: index,
      title: text(titleLink),
      href: titleLink ? (titleLink.getAttribute('href') || titleLink.href || '#') : '#',
      excerpt: excerpt,
      date: shortDate(dateValue),
      dateStamp: Date.parse(dateValue.replace(' ', 'T')) || 0,
      categories: categories,
      tags: tags,
      minutes: readTime(excerpt)
    };
  }

  function addToMap(map, items) {
    items.forEach(function (item) {
      if (!map[item.name]) {
        map[item.name] = { name: item.name, href: item.href, count: 0 };
      }
      map[item.name].count += 1;
    });
  }

  function ranked(map) {
    return Object.keys(map).map(function (key) {
      return map[key];
    }).sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
  }

  function collectStats(posts) {
    var categoryMap = {};
    var tagMap = {};
    posts.forEach(function (post) {
      addToMap(categoryMap, post.categories);
      addToMap(tagMap, post.tags);
    });
    return {
      categories: ranked(categoryMap),
      tags: ranked(tagMap),
      latest: posts.slice().sort(function (a, b) {
        return b.dateStamp - a.dateStamp;
      })
    };
  }

  function findAnchor() {
    return document.querySelector('.home-premium-list-head') || document.querySelector('.boke-home-layout') || document.querySelector('.index-card');
  }

  function insertBeforeAnchor(node) {
    var anchor = findAnchor();
    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(node, anchor);
      return;
    }
    var board = document.getElementById('board');
    if (board) board.insertBefore(node, board.firstChild);
  }

  function addStat(parent, value, label) {
    var stat = make('div', 'home-premium-stat');
    stat.appendChild(make('span', 'home-premium-stat-value', value));
    stat.appendChild(make('span', 'home-premium-stat-label', label));
    parent.appendChild(stat);
  }

  function appendLatest(list, posts) {
    posts.slice(0, 3).forEach(function (post, index) {
      var item = make('li', 'home-premium-latest-item');
      item.appendChild(make('span', 'home-premium-latest-index', String(index + 1).padStart(2, '0')));
      var body = make('div', 'home-premium-latest-body');
      body.appendChild(makeLink('home-premium-latest-link', post.href, post.title || '未命名笔记'));
      var meta = make('div', 'home-premium-latest-meta');
      meta.appendChild(make('span', '', post.date));
      if (post.categories[0]) meta.appendChild(make('span', '', post.categories[0].name));
      meta.appendChild(make('span', '', post.minutes + ' 分钟读完'));
      body.appendChild(meta);
      item.appendChild(body);
      list.appendChild(item);
    });
  }

  function appendTopics(list, categories) {
    categories.slice(0, 4).forEach(function (category) {
      var item = make('li', 'home-premium-topic-card');
      item.appendChild(makeLink('home-premium-topic-link', category.href, category.name));
      var meta = make('div', 'home-premium-topic-meta');
      meta.appendChild(make('span', '', '专题沉淀'));
      item.appendChild(meta);
      item.appendChild(make('span', 'home-premium-topic-count', category.count + ' 篇文章'));
      list.appendChild(item);
    });
    if (!categories.length) {
      list.appendChild(make('li', 'home-premium-empty', '发布文章并设置分类后，这里会自动形成专题入口。'));
    }
  }

  function appendChips(list, tags) {
    tags.slice(0, 10).forEach(function (tag) {
      var item = make('li', 'home-premium-chip-item');
      var link = makeLink('home-premium-chip', tag.href, '#' + tag.name);
      link.appendChild(make('span', 'home-premium-chip-count', tag.count));
      item.appendChild(link);
      list.appendChild(item);
    });
    if (!tags.length) {
      list.appendChild(make('li', 'home-premium-empty', '设置标签后，这里会自动聚合技术关键词。'));
    }
  }

  function triggerSearch() {
    var search = document.querySelector('#search-btn a, #mobile-search-btn a, .icon-search');
    if (search) search.click();
  }

  function buildOverview(posts, stats) {
    if (document.querySelector('.home-premium-shell')) return;

    var shell = make('section', 'home-premium-shell');
    shell.setAttribute('aria-label', '首页知识库概览');

    var overview = make('div', 'home-premium-overview');
    var intro = make('div', 'home-premium-intro');
    var profile = defaultHomeProfile();
    intro.appendChild(make('p', 'home-premium-kicker', profile.kicker));
    intro.appendChild(make('h2', 'home-premium-title', profile.title));
    intro.appendChild(make('p', 'home-premium-summary', profile.intro));

    var actions = make('div', 'home-premium-actions');
    var root = siteRoot();
    actions.appendChild(makeLink('home-premium-action home-premium-action-primary', root + 'archives/', '浏览归档'));
    actions.appendChild(makeLink('home-premium-action', root + 'categories/', '专题分类'));
    actions.appendChild(makeLink('home-premium-action', root + 'tags/', '关键词'));
    var searchButton = make('button', 'home-premium-action', '搜索笔记');
    searchButton.setAttribute('type', 'button');
    searchButton.addEventListener('click', triggerSearch);
    actions.appendChild(searchButton);
    intro.appendChild(actions);

    var statGrid = make('div', 'home-premium-stats');
    addStat(statGrid, String(posts.length), '首页文章');
    addStat(statGrid, String(stats.categories.length), '专题分类');
    addStat(statGrid, String(stats.tags.length), '关键词标签');
    addStat(statGrid, stats.latest[0] ? stats.latest[0].date : '暂无', '最近更新');
    overview.appendChild(intro);
    overview.appendChild(statGrid);
    shell.appendChild(overview);

    var panels = make('div', 'home-premium-panels');
    var latestPanel = make('section', 'home-premium-panel');
    latestPanel.appendChild(make('h3', 'home-premium-panel-label', '最新文章'));
    var latestList = make('ol', 'home-premium-latest-list');
    appendLatest(latestList, stats.latest);
    latestPanel.appendChild(latestList);

    var topicPanel = make('section', 'home-premium-panel');
    topicPanel.appendChild(make('h3', 'home-premium-panel-label', '专题入口'));
    var topicList = make('ul', 'home-premium-topic-list');
    appendTopics(topicList, stats.categories);
    topicPanel.appendChild(topicList);

    var tagPanel = make('section', 'home-premium-panel');
    tagPanel.appendChild(make('h3', 'home-premium-panel-label', '高频关键词'));
    var chipList = make('ul', 'home-premium-chip-list');
    appendChips(chipList, stats.tags);
    tagPanel.appendChild(chipList);

    panels.appendChild(latestPanel);
    panels.appendChild(topicPanel);
    panels.appendChild(tagPanel);
    shell.appendChild(panels);
    insertBeforeAnchor(shell);
  }

  function buildListHead(posts, stats) {
    if (document.querySelector('.home-premium-list-head')) return;
    var head = make('div', 'home-premium-list-head');
    var copy = make('div', 'home-premium-list-copy');
    copy.appendChild(make('h2', 'home-premium-list-title', '最新知识流'));
    copy.appendChild(make('p', 'home-premium-list-subtitle', '按时间和主题扫描文章，快速判断下一篇要深入的内容。'));
    var density = make('div', 'home-premium-list-density');
    density.appendChild(make('span', 'home-premium-density-pill', posts.length + ' 篇可读'));
    density.appendChild(make('span', 'home-premium-density-pill', stats.categories.length + ' 个专题'));
    density.appendChild(make('span', 'home-premium-density-pill', stats.tags.length + ' 个标签'));
    head.appendChild(copy);
    head.appendChild(density);
    insertBeforeAnchor(head);
  }

  function enhanceCards(posts) {
    posts.forEach(function (post, index) {
      var card = post.card;
      if (card.dataset.homePremiumReady === 'true') return;
      card.dataset.homePremiumReady = 'true';
      card.classList.add('home-premium-post-card');
      if (index === 0) card.classList.add('home-premium-post-card-featured');
      if (!card.querySelector('.index-img img')) card.classList.add('home-premium-card-no-cover');

      var info = card.querySelector('.index-info');
      var header = card.querySelector('.index-header');
      var excerpt = card.querySelector('.index-excerpt');
      var bottom = card.querySelector('.index-btm');
      if (!info || !header) return;

      var kickerText = post.categories[0] ? post.categories[0].name : '精选笔记';
      var kicker = make('span', 'home-premium-card-kicker', kickerText);
      info.insertBefore(kicker, header);

      var insights = make('div', 'home-premium-card-insights');
      insights.appendChild(make('span', 'home-premium-card-insight', post.minutes + ' 分钟读完'));
      insights.appendChild(make('span', 'home-premium-card-insight', post.date));
      if (post.tags.length) insights.appendChild(make('span', 'home-premium-card-insight', post.tags.length + ' 个标签'));
      else if (post.categories.length) insights.appendChild(make('span', 'home-premium-card-insight', post.categories.length + ' 个专题'));

      if (bottom) info.insertBefore(insights, bottom);
      else if (excerpt && excerpt.parentElement) info.insertBefore(insights, excerpt.nextSibling);
      else info.appendChild(insights);
    });
  }

  function buildSidebar(stats) {
    var sidebar = document.querySelector('.boke-home-sidebar');
    if (!sidebar || document.querySelector('.home-premium-sidebar-panel')) return;

    var panel = make('section', 'home-premium-sidebar-panel');
    panel.setAttribute('aria-label', '知识库地图');
    panel.appendChild(make('h2', 'home-premium-sidebar-title', '知识库地图'));
    var list = make('ul', 'home-premium-sidebar-list');
    stats.categories.slice(0, 5).forEach(function (category) {
      var item = make('li', 'home-premium-sidebar-item');
      item.appendChild(makeLink('home-premium-sidebar-link', category.href, category.name));
      item.appendChild(make('span', 'home-premium-sidebar-count', category.count));
      list.appendChild(item);
    });
    if (!stats.categories.length) {
      list.appendChild(make('li', 'home-premium-empty', '分类会在这里形成导航地图。'));
    }
    panel.appendChild(list);
    sidebar.appendChild(panel);
  }

  function run() {
    if (!isHomePage()) return false;
    var cards = Array.prototype.slice.call(document.querySelectorAll('.index-card'));
    if (!cards.length) return false;

    document.body.classList.add('home-premium-page');
    var posts = cards.map(getPost).filter(function (post) {
      return post.title;
    });
    if (!posts.length) return false;

    var stats = collectStats(posts);
    buildOverview(posts, stats);
    loadHomeProfile().then(applyHomeProfile);
    buildListHead(posts, stats);
    enhanceCards(posts);
    buildSidebar(stats);
    return true;
  }

  ready(function () {
    if (!isHomePage()) return;
    if (run()) {
      window.setTimeout(run, 80);
      return;
    }

    var observer = new MutationObserver(function () {
      if (run()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(function () {
      observer.disconnect();
      run();
    }, 1200);
  });
})();
