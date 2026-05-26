(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    document.querySelectorAll('img:not([loading])').forEach(function (img) {
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    });

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

    var articleTitle = document.querySelector('.post-content h1, .markdown-body h1, .post-title');
    if (articleTitle && location.pathname.indexOf('/posts/') !== -1) {
      var data = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: articleTitle.textContent.trim(),
        url: location.href,
        mainEntityOfPage: location.href,
        author: { '@type': 'Person', name: 'WFCrush' },
        publisher: { '@type': 'Person', name: 'WFCrush' }
      };
      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    }
  });
})();
