/**
 * Aurora · Recent posts JSON generator
 * ---------------------------------------------------------------
 * 输出：public/api/recent.json
 * 内容：最新 6 篇文章的轻量摘要，给首页 .au-latest 使用
 * 不读全文，不阻塞 build 性能
 */

'use strict';

hexo.extend.generator.register('aurora_recent_json', function (locals) {
  const posts = locals.posts.sort('-date').limit(6).toArray();

  const list = posts.map(function (p) {
    let category = '笔记';
    try {
      const cats = p.categories && p.categories.toArray();
      if (cats && cats.length && cats[0].name) category = cats[0].name;
    } catch (e) {}

    let cover = p.cover || p.banner_img || p.thumbnail || '/img/home-banner.png';
    // 容错：如果 cover 是相对路径不带前导斜杠，补一个
    if (cover && cover.charAt(0) !== '/' && !/^https?:/i.test(cover)) {
      cover = '/' + cover;
    }

    let excerpt = p.excerpt || p.description || '';
    excerpt = String(excerpt).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (excerpt.length > 80) excerpt = excerpt.slice(0, 80) + '…';

    let url = p.path || '';
    if (url && url.charAt(0) !== '/') url = '/' + url;

    let date = '';
    try { date = p.date.format('YYYY-M-D'); } catch (e) { date = ''; }

    return {
      title: p.title || '(untitled)',
      url: url,
      date: date,
      excerpt: excerpt,
      cover: cover,
      category: category,
      author: (p.author || hexo.config.author || 'Aurora')
    };
  });

  return {
    path: 'api/recent.json',
    data: JSON.stringify(list)
  };
});
