import { getDatabase, transaction } from './database';

export type ArticleLink = { title: string; url: string };
export type HomepageLinks = { videoUrl: string; articles: ArticleLink[]; revision: number };

export const MAX_ARTICLES = 20;
export const MAX_ARTICLE_TITLE = 80;
export const MAX_LINK_LENGTH = 2048;

const defaults: HomepageLinks = {
  videoUrl: '',
  articles: [{ title: '无间道 · 学生节总推送', url: 'https://mp.weixin.qq.com/s/XWFjhVA0owJOyT6FdT_W_Q' }],
  revision: 0,
};

export class HomepageLinksError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function parseHttpsLink(value: string): URL | null {
  if (!value || value.length > MAX_LINK_LENGTH) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port) return url;
  } catch { /* 由调用方提示所需链接格式。 */ }
  return null;
}

export function getBilibiliVideo(value: string): { url: string; playerUrl?: string } | null {
  const url = parseHttpsLink(value);
  if (!url) return null;
  if (url.hostname === 'b23.tv' && /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) {
    return { url: `${url.origin}${url.pathname}` };
  }

  let bvid: string | undefined;
  let aid: string | undefined;
  const page = url.searchParams.get('p') ?? url.searchParams.get('page') ?? '';
  if (['www.bilibili.com', 'm.bilibili.com', 'bilibili.com'].includes(url.hostname)) {
    const match = /^\/video\/(?:(BV[0-9a-zA-Z]{10})|av([1-9]\d{0,19}))\/?$/.exec(url.pathname);
    bvid = match?.[1];
    aid = match?.[2];
  } else if (url.hostname === 'player.bilibili.com' && url.pathname === '/player.html') {
    const bv = url.searchParams.get('bvid') ?? '';
    const av = url.searchParams.get('aid') ?? '';
    if (/^BV[0-9a-zA-Z]{10}$/.test(bv)) bvid = bv;
    else if (/^[1-9]\d{0,19}$/.test(av)) aid = av;
  }
  if (!bvid && !aid) return null;

  const canonical = new URL(`https://www.bilibili.com/video/${bvid ?? `av${aid}`}/`);
  const player = new URL('https://player.bilibili.com/player.html');
  player.searchParams.set(bvid ? 'bvid' : 'aid', (bvid ?? aid)!);
  player.searchParams.set('autoplay', '0');
  if (/^[1-9]\d{0,4}$/.test(page)) {
    canonical.searchParams.set('p', page);
    player.searchParams.set('page', page);
  }
  return { url: canonical.href, playerUrl: player.href };
}

export function getHomepageLinks(): HomepageLinks {
  const row = getDatabase().prepare("SELECT value FROM settings WHERE key = 'homepage_links'").get();
  return row ? JSON.parse(String(row.value)) : defaults;
}

export function saveHomepageLinks(input: unknown): HomepageLinks {
  const body = input as Partial<HomepageLinks> | null;
  if (typeof body?.revision !== 'number' || !Number.isSafeInteger(body.revision) || body.revision < 0
    || typeof body.videoUrl !== 'string' || !Array.isArray(body.articles) || body.articles.length > MAX_ARTICLES) {
    throw new HomepageLinksError(`首页内容格式错误，最多可添加 ${MAX_ARTICLES} 条公众号文章`);
  }
  const videoUrl = body.videoUrl.trim();
  const video = videoUrl ? getBilibiliVideo(videoUrl) : null;
  if (videoUrl && !video) throw new HomepageLinksError('请输入有效的 B 站视频链接或 b23.tv 分享链接');

  const articles = body.articles.map((article, index) => {
    const title = typeof article?.title === 'string' ? article.title.trim() : '';
    const url = typeof article?.url === 'string' ? parseHttpsLink(article.url.trim()) : null;
    const isArticle = url?.hostname === 'mp.weixin.qq.com' && (/^\/s\/[\w-]+\/?$/.test(url.pathname)
      || (url.pathname === '/s' && url.searchParams.has('__biz') && url.searchParams.has('mid')));
    if (!title || title.length > MAX_ARTICLE_TITLE || !url || !isArticle) {
      throw new HomepageLinksError(`请为第 ${index + 1} 条公众号文章填写有效标题和微信文章链接`);
    }
    return { title, url: url.href };
  });

  const db = getDatabase();
  return transaction(db, () => {
    const current = getHomepageLinks();
    if (current.revision !== body.revision) {
      throw new HomepageLinksError('首页内容已在另一窗口更新，请重新载入后再保存', 409);
    }
    const settings = { videoUrl: video?.url ?? '', articles, revision: current.revision + 1 };
    db.prepare(`INSERT INTO settings (key, value) VALUES ('homepage_links', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(settings));
    return settings;
  });
}
