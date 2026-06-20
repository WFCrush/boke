(function () {
  var site = {
    author: 'ASHUWEI',
    avatar: '/img/avatar.png',
    github: 'https://github.com/WFCrush',
    zhihu: 'https://www.zhihu.com',
    juejin: 'https://juejin.cn',
    subscribeAction: ''
  };

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function text(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function isPostPage() {
    return !!document.querySelector('.post-content .markdown-body');
  }

  function isHomePage() {
    var path = location.pathname.replace(/\/+$/, '/');
    return path === '/' || path === '/index.html';
  }

  function enhanceImages() {
    document.querySelectorAll('img').forEach(function (img) {
      if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
      if (!img.getAttribute('alt')) {
        var title = document.querySelector('#seo-header, .index-header, title');
        img.setAttribute('alt', text(title) || 'ASHUWEI 的技术笔记配图');
      }
    });
  }

  function enhanceSearch() {
    var search = document.querySelector('.icon-search') || document.querySelector('[data-toggle="modal"][data-target*="search"]');
    if (search && !search.dataset.shortcutReady) {
      search.dataset.shortcutReady = 'true';
      search.setAttribute('title', '搜索 Ctrl+K');
      search.setAttribute('aria-label', '搜索 Ctrl+K');
    }

    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        var searchButton = document.querySelector('.icon-search') || document.querySelector('[data-toggle="modal"][data-target*="search"]');
        if (searchButton) {
          event.preventDefault();
          searchButton.click();
        }
      }
    });
  }

  function enhanceNavbar() {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;
    function update() {
      navbar.classList.toggle('boke-navbar-scrolled', window.scrollY > 24);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function readingProgress() {
    if (!isPostPage() || document.querySelector('.boke-reading-progress')) return;
    var bar = document.createElement('div');
    bar.className = 'boke-reading-progress';
    document.body.appendChild(bar);

    function update() {
      var article = document.querySelector('.post-content');
      if (!article) return;
      var rect = article.getBoundingClientRect();
      var total = Math.max(article.offsetHeight - window.innerHeight, 1);
      var done = Math.min(Math.max(-rect.top, 0), total);
      bar.style.width = (done / total * 100).toFixed(2) + '%';
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  function addSchema() {
    var articleTitle = document.querySelector('#seo-header, .post-content h1, .markdown-body h1, .post-title');
    if (!articleTitle || !isPostPage() || document.querySelector('script[data-boke-schema]')) return;
    var image = document.querySelector('#banner');
    var bg = image && image.style.backgroundImage.match(/url\(["']?(.+?)["']?\)/);
    var data = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: text(articleTitle),
      description: document.querySelector('meta[name="description"]') ? document.querySelector('meta[name="description"]').content : '',
      image: bg ? bg[1] : site.avatar,
      url: location.href,
      mainEntityOfPage: location.href,
      author: { '@type': 'Person', name: site.author, url: site.github },
      publisher: {
        '@type': 'Person',
        name: site.author,
        image: site.avatar
      }
    };
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.bokeSchema = 'true';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function buildHomeSidebar() {
    if (!isHomePage()) return;
    document.body.classList.add('boke-home');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.index-card'));
    if (!cards.length || document.querySelector('.boke-home-layout')) return;

    var parent = cards[0].parentElement;
    var layout = document.createElement('div');
    layout.className = 'boke-home-layout';
    var posts = document.createElement('div');
    posts.className = 'boke-home-posts';
    var sidebar = document.createElement('aside');
    sidebar.className = 'boke-home-sidebar';
    sidebar.setAttribute('aria-label', '博客侧边栏');

    parent.insertBefore(layout, cards[0]);
    cards.forEach(function (card) {
      posts.appendChild(card);
    });
    layout.appendChild(posts);
    layout.appendChild(sidebar);

    var categoryMap = {};
    var tagMap = {};
    cards.forEach(function (card) {
      card.querySelectorAll('.post-meta a').forEach(function (link) {
        var value = text(link).replace(/^#/, '');
        var href = link.getAttribute('href') || '#';
        if (!value) return;
        if (href.indexOf('/tags/') !== -1 || text(link).indexOf('#') === 0) tagMap[value] = href;
        else categoryMap[value] = href;
      });
    });

    var hot = cards.slice(0, 5).map(function (card) {
      var link = card.querySelector('.index-header a');
      return link ? '<li><a href="' + link.href + '">' + text(link) + '</a></li>' : '';
    }).join('');

    function chips(map) {
      var keys = Object.keys(map);
      if (!keys.length) return '<p>发布文章后自动显示。</p>';
      return '<ul class="boke-chip-list">' + keys.map(function (key) {
        return '<li><a href="' + map[key] + '">' + key + '</a></li>';
      }).join('') + '</ul>';
    }

    sidebar.innerHTML = [
      '<section class="boke-sidebar-card"><div class="boke-profile"><img src="' + site.avatar + '" alt="ASHUWEI 头像"><div><h2>ASHUWEI</h2><p>记录编程实践、学习路径和技术成长。</p></div></div></section>',
      '<section class="boke-sidebar-card"><h2>文章分类</h2>' + chips(categoryMap) + '</section>',
      '<section class="boke-sidebar-card"><h2>标签</h2>' + chips(tagMap) + '</section>',
      '<section class="boke-sidebar-card"><h2>最新文章</h2><ol class="boke-hot-list">' + hot + '</ol></section>',
      '<section class="boke-sidebar-card"><h2>社交链接</h2><div class="boke-social-icons"><a href="' + site.github + '" target="_blank" rel="noopener" aria-label="GitHub">GitHub</a><a href="' + site.zhihu + '" target="_blank" rel="noopener" aria-label="知乎">知乎</a><a href="' + site.juejin + '" target="_blank" rel="noopener" aria-label="掘金">掘金</a></div></section>'
    ].join('');
  }

  function selectionShare() {
    if (!isPostPage() || document.querySelector('.boke-share-pop')) return;
    var pop = document.createElement('div');
    pop.className = 'boke-share-pop';
    pop.innerHTML = '<button type="button" data-share="twitter">Twitter</button><button type="button" data-share="weibo">微博</button>';
    document.body.appendChild(pop);

    document.addEventListener('mouseup', function () {
      var sel = window.getSelection();
      var selected = sel ? sel.toString().trim() : '';
      if (!selected || selected.length < 6) {
        pop.classList.remove('is-visible');
        return;
      }
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      pop.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 180) + 'px';
      pop.style.top = (rect.top + window.scrollY - 52) + 'px';
      pop.dataset.text = selected.slice(0, 180);
      pop.classList.add('is-visible');
    });

    pop.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-share]');
      if (!button) return;
      var selected = pop.dataset.text || document.title;
      var url = encodeURIComponent(location.href);
      var shareText = encodeURIComponent(selected + ' - ' + document.title);
      var target = button.dataset.share === 'weibo'
        ? 'https://service.weibo.com/share/share.php?url=' + url + '&title=' + shareText
        : 'https://twitter.com/intent/tweet?url=' + url + '&text=' + shareText;
      window.open(target, '_blank', 'noopener,width=720,height=520');
      pop.classList.remove('is-visible');
    });
  }

  function likeCard() {
    if (!isPostPage() || document.querySelector('.boke-like-card')) return;
    var comments = document.getElementById('comments');
    var host = comments || document.querySelector('.post-content');
    if (!host) return;
    var key = 'boke-like:' + location.pathname;
    var count = Number(localStorage.getItem(key) || 0);
    var card = document.createElement('section');
    card.className = 'boke-like-card';
    card.innerHTML = '<div><h2>这篇笔记有帮助吗？</h2><p>无需登录，点击后会保存在当前浏览器。</p></div><button class="boke-like-button" type="button">点赞 <span>' + count + '</span></button>';
    host.parentElement.insertBefore(card, host);
    card.querySelector('button').addEventListener('click', function () {
      count += 1;
      localStorage.setItem(key, count);
      card.querySelector('span').textContent = count;
    });
  }

  function relatedPosts() {
    if (!isPostPage()) return;
    var prevNext = document.querySelector('.post-prevnext');
    if (!prevNext || document.querySelector('.boke-related-card')) return;
    var links = Array.prototype.slice.call(document.querySelectorAll('.post-prevnext a')).slice(0, 3);
    if (!links.length) return;
    var section = document.createElement('section');
    section.className = 'boke-sidebar-card boke-related-card';
    section.innerHTML = '<h2>相关文章</h2><ol class="boke-hot-list">' + links.map(function (link) {
      return '<li><a href="' + link.href + '">' + text(link) + '</a></li>';
    }).join('') + '</ol>';
    prevNext.parentElement.insertBefore(section, prevNext);
  }

  function backToTop() {
    if (document.querySelector('.boke-back-to-top')) return;
    var btn = document.createElement('a');
    btn.className = 'boke-back-to-top';
    btn.href = '#';
    btn.setAttribute('aria-label', '回到顶部');
    btn.innerHTML = '&#8593;';
    document.body.appendChild(btn);

    function update() {
      btn.classList.toggle('is-visible', window.scrollY > 400);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });

    btn.addEventListener('click', function (event) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function subscribeAction() {
    document.querySelectorAll('.boke-subscribe-form').forEach(function (form) {
      if (site.subscribeAction) {
        form.setAttribute('action', site.subscribeAction);
      }
      form.addEventListener('submit', function (event) {
        if (!site.subscribeAction) {
          event.preventDefault();
          alert('请先在 source/js/site-enhance.js 中填写 Mailchimp 表单 action 地址。');
        }
      });
    });
  }

  ready(function () {
    enhanceImages();
    enhanceSearch();
    enhanceNavbar();
    readingProgress();
    addSchema();
    buildHomeSidebar();
    backToTop();
    selectionShare();
    likeCard();
    relatedPosts();
    subscribeAction();
  });
})();
