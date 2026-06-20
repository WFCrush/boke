(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function isHome() {
    var path = location.pathname.replace(/\/index\.html$/i, '/');
    if (path !== '/' && path.charAt(path.length - 1) !== '/') path += '/';
    return path === '/' || path === '/boke/';
  }

  function root() {
    return location.pathname.indexOf('/boke/') === 0 ? '/boke/' : '/';
  }

  function text(node, value) {
    if (node) node.textContent = value;
  }

  function decorateHome() {
    if (!isHome()) return;
    document.body.classList.add('aurora-ui');

    var shell = document.querySelector('.home-premium-shell');
    if (!shell) return;

    text(shell.querySelector('.home-premium-kicker'), 'Aurora Notebook');
    text(shell.querySelector('.home-premium-title'), '记录思考，分享生活，探索无限可能。');
    text(shell.querySelector('.home-premium-summary'), '一个偏技术与设计的独立写作空间，记录项目实践、学习复盘和日常观察。');

    var actions = shell.querySelectorAll('.home-premium-action');
    var labels = ['浏览文章', '分类', '标签', '搜索'];
    actions.forEach(function (action, index) {
      if (labels[index]) action.textContent = labels[index];
    });

    var overview = shell.querySelector('.home-premium-overview');
    var stats = shell.querySelector('.home-premium-stats');
    if (overview && stats && stats.parentElement === overview) {
      shell.insertBefore(stats, overview.nextSibling);
    }

    if (!shell.querySelector('.aurora-hero-visual')) {
      var visual = document.createElement('div');
      visual.className = 'aurora-hero-visual';
      visual.innerHTML = [
        '<div class="aurora-ring">',
        '<img src="' + root() + 'img/avatar.png" alt="Aurora avatar">',
        '<span class="aurora-dot dot-1">写作</span>',
        '<span class="aurora-dot dot-2">项目</span>',
        '<span class="aurora-dot dot-3">复盘</span>',
        '<span class="aurora-dot dot-4">灵感</span>',
        '</div>'
      ].join('');
      if (overview) overview.appendChild(visual);
    }

    var listTitle = document.querySelector('.home-premium-list-title');
    var listSub = document.querySelector('.home-premium-list-subtitle');
    text(listTitle, '最新文章');
    text(listSub, '按时间线整理最近的写作、项目复盘和技术记录。');

    document.querySelectorAll('.home-premium-card-no-cover .index-img').forEach(function (node) {
      node.remove();
    });
  }

  ready(function () {
    decorateHome();
    window.setTimeout(decorateHome, 120);
    window.setTimeout(decorateHome, 600);
  });
})();
