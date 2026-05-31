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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function siteRoot() {
  return String(hexo.config.root || '/').replace(/\/?$/, '/');
}

function fixOptimizedImagePaths(html) {
  const root = siteRoot();
  return html.replace(/(^|["'\s(,])opt-images\//g, '$1' + root + 'opt-images/');
}

function protectMathMarkdown(content) {
  const codeBlocks = [];
  let text = String(content || '').replace(/^```\s*math\s*\r?\n([\s\S]*?)\r?\n```\s*$/gm, function (_, body) {
    return '\n$$\n' + body.trim() + '\n$$\n';
  });

  text = text.replace(/^```[\s\S]*?^```/gm, function (block) {
    const token = '\u0000CODE_BLOCK_' + codeBlocks.length + '\u0000';
    codeBlocks.push(block);
    return token;
  });

  text = text.replace(/(^|\n)[ \t]*\$\$[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\$\$[ \t]*(?=\r?\n|$)/g, function (_, prefix, body) {
    return prefix + '<div class="math-display">$$\n' + escapeHtml(body.trim()) + '\n$$</div>';
  });

  text = text.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, function (_, prefix, body) {
    return prefix + '<span class="math-inline">$' + escapeHtml(body) + '$</span>';
  });

  codeBlocks.forEach(function (block, index) {
    text = text.replace('\u0000CODE_BLOCK_' + index + '\u0000', block);
  });

  return text;
}

hexo.extend.filter.register('before_post_render', function (data) {
  data.content = protectMathMarkdown(data.content);
  return data;
});

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
        html = fixOptimizedImagePaths(html);

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
