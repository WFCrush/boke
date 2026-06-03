'use strict';

const fs = require('fs');
const path = require('path');

let imageDimensions;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function attr(tag, name) {
  const match = String(tag || '').match(new RegExp('(^|\\s)' + escapeRegExp(name) + '\\s*=\\s*(["\\\'])(.*?)\\2', 'i'));
  return match ? match[3] : '';
}

function setAttr(tag, name, value) {
  const safeValue = escapeAttr(value);
  const pattern = new RegExp('(^|\\s)(' + escapeRegExp(name) + ')(\\s*=\\s*)(["\\\'])(.*?)\\4', 'i');
  if (pattern.test(tag)) {
    return tag.replace(pattern, function (_, prefix, attrName, separator, quote) {
      return prefix + attrName + separator + quote + safeValue + quote;
    });
  }
  return tag.replace(/\s*\/?>$/, function (ending) {
    return ' ' + name + '="' + safeValue + '"' + (ending.indexOf('/') !== -1 ? ' />' : '>');
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, function (_, code) {
      const point = code.charAt(0).toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : _;
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function compactText(value, maxLength) {
  const text = decodeHtml(value).replace(/\s+/g, ' ').trim();
  const limit = maxLength || 160;
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit + 1);
  const wordBreak = slice.lastIndexOf(' ');
  const end = wordBreak > 80 ? wordBreak : limit;
  return slice.slice(0, end).replace(/[，。！？、；：,.!?;:\s]+$/, '') + '...';
}

function siteRoot() {
  return String(hexo.config.root || '/').replace(/\/?$/, '/');
}

function siteBaseUrl() {
  const configured = String(hexo.config.url || '').trim();
  return (configured || 'https://example.com').replace(/\/+$/, '') + '/';
}

function sitePath(value) {
  return siteRoot() + String(value || '').replace(/^\/+/, '');
}

function normalizeSiteUrl(value) {
  if (!value) return '';
  try {
    const base = new URL(siteBaseUrl());
    const url = new URL(String(value), base);
    const root = siteRoot().replace(/^\/+|\/+$/g, '');

    if (root && url.origin === base.origin) {
      const duplicated = '/' + root + '/' + root + '/';
      while (url.pathname.indexOf(duplicated) === 0) {
        url.pathname = '/' + root + '/' + url.pathname.slice(duplicated.length);
      }
    }

    return url.toString();
  } catch (error) {
    return String(value);
  }
}

function absoluteUrl(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text || /^(data|mailto|tel):/i.test(text)) return '';

  try {
    const base = new URL(siteBaseUrl());
    if (/^\/\//.test(text)) {
      return normalizeSiteUrl(base.protocol + text);
    }
    if (/^https?:\/\//i.test(text)) {
      return normalizeSiteUrl(text);
    }

    let pathValue = text;
    const root = siteRoot();
    if (pathValue.charAt(0) === '/' && root !== '/' && pathValue.indexOf(root) !== 0) {
      pathValue = root + pathValue.replace(/^\/+/, '');
    }

    return normalizeSiteUrl(new URL(pathValue, base).toString());
  } catch (error) {
    return '';
  }
}

function pageUrlForRoute(route) {
  return new URL(String(route || '').replace(/index\.html$/i, ''), siteBaseUrl()).toString();
}

function fixOptimizedImagePaths(html) {
  const root = siteRoot();
  return html.replace(/(^|["'\s(,])opt-images\//g, '$1' + root + 'opt-images/');
}

function resolveProjectPath(value) {
  if (!value) return '';
  return path.isAbsolute(value) ? value : path.join(hexo.base_dir || process.cwd(), value);
}

function loadImageDimensions() {
  if (imageDimensions !== undefined) return imageDimensions;

  const sourceDir = resolveProjectPath(hexo.source_dir || 'source');
  const candidates = [
    path.join(sourceDir, 'opt-images', 'dimensions.json'),
    path.join(resolveProjectPath(hexo.public_dir || 'public'), 'opt-images', 'dimensions.json')
  ];

  imageDimensions = {};
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        imageDimensions = JSON.parse(fs.readFileSync(file, 'utf8'));
        break;
      }
    } catch (error) {
      hexo.log.warn('[seo-assets] Failed to read image dimensions: ' + file);
    }
  }

  return imageDimensions;
}

function imageKeyFromUrl(src) {
  if (!src) return '';
  const clean = String(src).split(/[?#]/)[0].replace(/\\/g, '/');
  const basename = decodeURIComponent(clean.slice(clean.lastIndexOf('/') + 1));
  return basename
    .replace(/\.(?:avif|webp|png|jpe?g|gif|svg)$/i, '')
    .replace(/-(?:optimized|\d+w)$/i, '');
}

function dimensionsForImage(src) {
  const key = imageKeyFromUrl(src);
  const dimensions = loadImageDimensions()[key];
  if (!dimensions || !dimensions.width || !dimensions.height) return null;
  return {
    width: String(dimensions.width),
    height: String(dimensions.height)
  };
}

function imageSourceFromTag(tag) {
  const candidates = [attr(tag, 'data-src'), attr(tag, 'data-original'), attr(tag, 'src')];
  return candidates.find(function (src) {
    return src && !/loading\.gif(?:[?#].*)?$/i.test(src);
  }) || candidates.find(Boolean) || '';
}

function extractImages(html) {
  const images = [];
  String(html || '').replace(/<img\b[^>]*>/gi, function (tag) {
    const src = imageSourceFromTag(tag);
    const url = absoluteUrl(src);
    if (!url || /loading\.gif(?:[?#].*)?$/i.test(url)) return tag;

    const dimensions = dimensionsForImage(src);
    images.push({
      src: src,
      url: url,
      alt: compactText(attr(tag, 'alt'), 120),
      width: dimensions && dimensions.width,
      height: dimensions && dimensions.height
    });
    return tag;
  });
  return images;
}

function enhanceImages(html, pageTitle) {
  const fallbackAlt = (pageTitle || hexo.config.title || 'ASHUWEI 的技术笔记') + '配图';
  return html.replace(/<img\b[^>]*>/gi, function (tag) {
    let next = tag;
    const src = imageSourceFromTag(next);
    const dimensions = dimensionsForImage(src);

    if (!attr(next, 'loading')) next = setAttr(next, 'loading', 'lazy');
    if (!attr(next, 'decoding')) next = setAttr(next, 'decoding', 'async');
    if (!attr(next, 'alt')) next = setAttr(next, 'alt', fallbackAlt);
    if (dimensions) {
      if (!attr(next, 'width')) next = setAttr(next, 'width', dimensions.width);
      if (!attr(next, 'height')) next = setAttr(next, 'height', dimensions.height);
    }

    return next;
  });
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

function insertHead(html, markup) {
  if (!markup || html.indexOf('</head>') === -1) return html;
  return html.replace(/<\/head>/i, markup + '\n</head>');
}

function tagWithAttr(html, tagName, attrName, attrValue) {
  const pattern = new RegExp('<' + tagName + '\\b(?=[^>]*\\s' + escapeRegExp(attrName) + '\\s*=\\s*(["\\\'])' + escapeRegExp(attrValue) + '\\1)[^>]*>', 'i');
  const match = String(html || '').match(pattern);
  return match ? match[0] : '';
}

function getMetaContent(html, attrName, attrValue) {
  const tag = tagWithAttr(html, 'meta', attrName, attrValue);
  return tag ? decodeHtml(attr(tag, 'content')) : '';
}

function upsertMeta(html, attrName, attrValue, content) {
  if (!content) return html;
  const pattern = new RegExp('<meta\\b(?=[^>]*\\s' + escapeRegExp(attrName) + '\\s*=\\s*(["\\\'])' + escapeRegExp(attrValue) + '\\1)[^>]*>', 'i');
  if (pattern.test(html)) {
    return html.replace(pattern, function (tag) {
      return setAttr(tag, 'content', content);
    });
  }
  return insertHead(html, '<meta ' + attrName + '="' + escapeAttr(attrValue) + '" content="' + escapeAttr(content) + '">');
}

function ensureMeta(html, attrName, attrValue, content) {
  if (!content || tagWithAttr(html, 'meta', attrName, attrValue)) return html;
  return insertHead(html, '<meta ' + attrName + '="' + escapeAttr(attrValue) + '" content="' + escapeAttr(content) + '">');
}

function getCanonicalUrl(html) {
  const tag = tagWithAttr(html, 'link', 'rel', 'canonical');
  return tag ? normalizeSiteUrl(attr(tag, 'href')) : '';
}

function upsertCanonical(html, url) {
  if (!url) return html;
  const href = normalizeSiteUrl(url);
  const pattern = /<link\b(?=[^>]*\srel\s*=\s*(["'])canonical\1)[^>]*>/i;
  if (pattern.test(html)) {
    return html.replace(pattern, function (tag) {
      return setAttr(tag, 'href', href);
    });
  }
  return insertHead(html, '<link rel="canonical" href="' + escapeAttr(href) + '">');
}

function normalizeShareImageMeta(html) {
  return html.replace(/<meta\b(?=[^>]*(?:property|name)\s*=\s*(["\'])(?:og:image|twitter:image)\1)[^>]*>/gi, function (tag) {
    const content = attr(tag, 'content');
    return content ? setAttr(tag, 'content', absoluteUrl(content)) : tag;
  });
}

function titleFromHtml(html) {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return compactText(match ? match[1].replace(/<[^>]+>/g, ' ') : hexo.config.title || 'ASHUWEI 的技术笔记', 120);
}

function articleTitle(pageTitle) {
  const siteTitle = hexo.config.title || '';
  if (!siteTitle) return pageTitle;
  return compactText(String(pageTitle || '').replace(new RegExp('\\s+-\\s+' + escapeRegExp(siteTitle) + '$'), ''), 120) || pageTitle;
}

function bodyTextFromHtml(html) {
  const article = String(html || '').match(/<article\b[\s\S]*?<\/article>/i);
  const main = article ? article[0] : (String(html || '').match(/<main\b[\s\S]*?<\/main>/i) || [html])[0];
  return decodeHtml(main
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function descriptionForPage(html, pageTitle) {
  const existing = getMetaContent(html, 'name', 'description');
  if (existing) return compactText(existing, 160);

  const title = articleTitle(pageTitle);
  const bodyText = bodyTextFromHtml(html).replace(title, '').trim();
  return compactText(bodyText || hexo.config.description || pageTitle, 160);
}

function collectionNames(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) {
    return collection.map(function (item) {
      return String(item && (item.name || item.slug || item));
    }).filter(Boolean);
  }
  if (typeof collection.toArray === 'function') return collectionNames(collection.toArray());
  if (Array.isArray(collection.data)) return collectionNames(collection.data);
  if (typeof collection.map === 'function') {
    try {
      const mapped = collection.map(function (item) {
        return item && (item.name || item.slug || item);
      });
      return collectionNames(mapped);
    } catch (error) {
      return [];
    }
  }
  return [];
}

function isoDate(value) {
  if (!value) return '';
  try {
    if (typeof value.toISOString === 'function') return value.toISOString();
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  } catch (error) {
    return '';
  }
}

function routeKey(value) {
  return decodeURIComponent(String(value || ''))
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/index\.html$/i, '')
    .replace(/\/+$/, '');
}

function buildPostRouteMap() {
  const map = new Map();
  const posts = hexo.locals.get('posts');
  if (!posts || typeof posts.forEach !== 'function') return map;

  posts.forEach(function (post) {
    [post.path, post.permalink].filter(Boolean).forEach(function (value) {
      let key = String(value);
      if (/^https?:\/\//i.test(key)) {
        try {
          key = new URL(key).pathname.replace(new URL(siteBaseUrl()).pathname, '');
        } catch (error) {
          key = value;
        }
      }
      map.set(routeKey(key), post);
    });
  });

  return map;
}

function pageSchemaType(route, post) {
  if (post) return 'BlogPosting';
  if (route === 'index.html') return 'WebPage';
  if (/^(archives|categories|tags)\//i.test(route)) return 'CollectionPage';
  return 'WebPage';
}

function imageInfoFromUrl(url, fallbackAlt) {
  const normalized = absoluteUrl(url);
  if (!normalized) return null;
  const dimensions = dimensionsForImage(url);
  return {
    url: normalized,
    alt: compactText(fallbackAlt || hexo.config.title || 'ASHUWEI 的技术笔记', 120),
    width: dimensions && dimensions.width,
    height: dimensions && dimensions.height
  };
}

function pickPrimaryImage(html, pageTitle) {
  const existing = getMetaContent(html, 'property', 'og:image') || getMetaContent(html, 'name', 'twitter:image');
  if (existing) return imageInfoFromUrl(existing, pageTitle);

  const firstImage = extractImages(html)[0];
  if (firstImage) return firstImage;

  return imageInfoFromUrl(sitePath('img/home-banner.png'), pageTitle);
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildJsonLd(route, pageTitle, description, canonicalUrl, primaryImage, post) {
  const siteUrl = siteBaseUrl();
  const siteTitle = hexo.config.title || 'ASHUWEI 的技术笔记';
  const authorName = hexo.config.author || 'ASHUWEI';
  const language = hexo.config.language || 'zh-CN';
  const publisherId = siteUrl + '#person';
  const websiteId = siteUrl + '#website';
  const pageId = canonicalUrl + '#webpage';
  const type = pageSchemaType(route, post);
  const graph = [
    {
      '@type': 'Person',
      '@id': publisherId,
      name: authorName,
      url: siteUrl
    },
    {
      '@type': 'WebSite',
      '@id': websiteId,
      url: siteUrl,
      name: siteTitle,
      description: hexo.config.description || description,
      inLanguage: language,
      publisher: { '@id': publisherId }
    }
  ];

  const webPage = {
    '@type': type === 'BlogPosting' ? 'WebPage' : type,
    '@id': pageId,
    url: canonicalUrl,
    name: pageTitle,
    description: description,
    isPartOf: { '@id': websiteId },
    inLanguage: language
  };
  if (primaryImage) webPage.primaryImageOfPage = { '@type': 'ImageObject', url: primaryImage.url };
  graph.push(webPage);

  if (post) {
    const keywords = collectionNames(post.tags);
    const sections = collectionNames(post.categories);
    const article = {
      '@type': 'BlogPosting',
      '@id': canonicalUrl + '#article',
      mainEntityOfPage: { '@id': pageId },
      isPartOf: { '@id': websiteId },
      headline: articleTitle(pageTitle),
      name: articleTitle(pageTitle),
      description: description,
      url: canonicalUrl,
      inLanguage: language,
      author: { '@id': publisherId },
      publisher: { '@id': publisherId }
    };

    const published = isoDate(post.date);
    const modified = isoDate(post.updated || post.modified || post.date);
    if (published) article.datePublished = published;
    if (modified) article.dateModified = modified;
    if (primaryImage) article.image = [primaryImage.url];
    if (keywords.length) article.keywords = keywords.join(', ');
    if (sections.length) article.articleSection = sections;
    graph.push(article);
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  };
}

function enhanceHead(html, route, post) {
  const pageTitle = titleFromHtml(html);
  const pageUrl = pageUrlForRoute(route);

  html = upsertCanonical(html, pageUrl);
  const canonicalUrl = getCanonicalUrl(html) || pageUrl;
  const description = descriptionForPage(html, pageTitle);

  html = ensureMeta(html, 'name', 'description', description);
  html = upsertMeta(html, 'property', 'og:url', canonicalUrl);
  html = ensureMeta(html, 'property', 'og:title', pageTitle);
  html = ensureMeta(html, 'property', 'og:site_name', hexo.config.title || pageTitle);
  html = ensureMeta(html, 'property', 'og:description', description);
  html = ensureMeta(html, 'property', 'og:type', post ? 'article' : (route === 'index.html' ? 'website' : 'website'));
  html = ensureMeta(html, 'name', 'twitter:card', 'summary_large_image');
  html = ensureMeta(html, 'name', 'twitter:title', pageTitle);
  html = ensureMeta(html, 'name', 'twitter:description', description);
  html = ensureMeta(html, 'name', 'robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');

  html = normalizeShareImageMeta(html);
  const primaryImage = pickPrimaryImage(html, pageTitle);
  if (primaryImage) {
    html = ensureMeta(html, 'property', 'og:image', primaryImage.url);
    html = ensureMeta(html, 'property', 'og:image:secure_url', primaryImage.url);
    html = ensureMeta(html, 'property', 'og:image:alt', primaryImage.alt || articleTitle(pageTitle));
    if (primaryImage.width) html = ensureMeta(html, 'property', 'og:image:width', primaryImage.width);
    if (primaryImage.height) html = ensureMeta(html, 'property', 'og:image:height', primaryImage.height);
    html = ensureMeta(html, 'name', 'twitter:image', primaryImage.url);
    html = ensureMeta(html, 'name', 'twitter:image:alt', primaryImage.alt || articleTitle(pageTitle));
  }

  if (html.indexOf('application/ld+json') === -1) {
    const schema = buildJsonLd(route, pageTitle, description, canonicalUrl, primaryImage, post);
    html = insertHead(html, '<script type="application/ld+json">' + safeJson(schema) + '</script>');
  }

  return html;
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
  const postRouteMap = buildPostRouteMap();
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

        const pageTitle = titleFromHtml(html);
        const post = postRouteMap.get(routeKey(route));
        html = enhanceImages(html, pageTitle);
        html = fixOptimizedImagePaths(html);
        html = enhanceHead(html, route, post);

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
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()',
      '',
      '/css/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '',
      '/js/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '',
      '/img/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '',
      '/opt-images/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '',
      '/uploads/*',
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
      'Sitemap: ' + new URL('sitemap.xml', siteBaseUrl()).toString(),
      ''
    ].join('\n')
  };
});
