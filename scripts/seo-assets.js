'use strict';

function attr(tag, name) {
  const match = tag.match(new RegExp(name + '=["\\\']([^"\\\']*)["\\\']', 'i'));
  return match ? match[1] : '';
}

function setAttr(tag, name, value) {
  if (new RegExp(name + '=["\\\'][^"\\\']*["\\\']', 'i').test(tag)) {
    return tag.replace(new RegExp(name + '=["\\\'][^"\\\']*["\\\']', 'i'), name + '="' + value + '"');
  }
  return tag.replace(/>$/, ' ' + name + '="' + value + '">');
}

hexo.extend.filter.register('after_post_render', function (data) {
  const title = data.title || hexo.config.title || 'ASHUWEI 的技术笔记';
  data.content = data.content.replace(/<img\b([^>]*)>/gi, function (tag) {
    if (attr(tag, 'alt')) return tag;
    return setAttr(tag, 'alt', title + '配图');
  });
  return data;
});

hexo.extend.filter.register('after_generate', function () {
  const routeList = hexo.route.list();
  const htmlRoutes = routeList.filter(function (route) {
    return route.endsWith('.html');
  });

  return Promise.all(htmlRoutes.map(function (route) {
    return new Promise(function (resolve) {
      const stream = hexo.route.get(route);
      let html = '';
      stream.on('data', function (chunk) {
        html += chunk.toString();
      });
      stream.on('end', function () {
        if (!html || html.indexOf('<html') === -1) {
          resolve();
          return;
        }

        const pageTitleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const pageTitle = pageTitleMatch ? pageTitleMatch[1] : hexo.config.title;
        const pageUrl = new URL(route.replace(/index\.html$/, ''), hexo.config.url + '/').toString();

        if (html.indexOf('application/ld+json') === -1) {
          const schema = {
            '@context': 'https://schema.org',
            '@type': route.indexOf('/20') !== -1 ? 'BlogPosting' : 'WebPage',
            headline: pageTitle,
            name: pageTitle,
            url: pageUrl,
            author: {
              '@type': 'Person',
              name: hexo.config.author || 'ASHUWEI'
            }
          };
          html = html.replace('</head>', '<script type="application/ld+json">' + JSON.stringify(schema) + '</script></head>');
        }

        html = html.replace(/<img\b([^>]*)>/gi, function (tag) {
          let next = tag;
          if (!attr(next, 'loading')) next = setAttr(next, 'loading', 'lazy');
          if (!attr(next, 'decoding')) next = setAttr(next, 'decoding', 'async');
          if (!attr(next, 'alt')) next = setAttr(next, 'alt', pageTitle + '配图');
          return next;
        });

        hexo.route.set(route, html);
        resolve();
      });
      stream.on('error', resolve);
    });
  }));
}, 20);

hexo.extend.generator.register('cache-control', function () {
  return {
    path: '_headers',
    data: [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '  X-Frame-Options: SAMEORIGIN',
      '',
      '/css/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '',
      '/js/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '',
      '/img/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      ''
    ].join('\n')
  };
});

hexo.extend.generator.register('robots', function () {
  return {
    path: 'robots.txt',
    data: [
      'User-agent: *',
      'Allow: /',
      '',
      'Sitemap: https://wfcrush.github.io/boke/sitemap.xml',
      ''
    ].join('\n')
  };
});
