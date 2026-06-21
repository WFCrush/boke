/**
 * Aurora · Site stats JSON generator
 * ---------------------------------------------------------------
 * 输出：public/api/stats.json
 * 内容：首页 4 列统计条所需的数字
 * 静态站没有真实访问统计，weekViews 走配置或回退默认
 */

'use strict';

hexo.extend.generator.register('aurora_site_stats', function (locals) {
  const cfg = (hexo.config.aurora || {});

  const posts = locals.posts.length;
  const cats = locals.categories.length;
  const since = parseInt(cfg.since_year, 10) || 2021;
  const weekViews = parseInt(cfg.week_views, 10) || 12;

  const data = {
    posts: posts,
    weekViews: weekViews,
    cats: cats,
    since: since,
    generatedAt: new Date().toISOString()
  };

  return {
    path: 'api/stats.json',
    data: JSON.stringify(data)
  };
});
