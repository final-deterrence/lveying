import Image from 'next/image';
import Link from 'next/link';
import GuestNavBar from '@/components/GuestNavBar';
import FestivalEasterEgg from '@/components/FestivalEasterEgg';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { dataStore } from '@/lib/dataStore';
import { getBilibiliVideo, getHomepageLinks } from '@/lib/homepageLinks';

export const dynamic = 'force-dynamic';

export default function Home() {
  const { videoUrl, articles } = getHomepageLinks();
  const video = getBilibiliVideo(videoUrl);
  const programs = dataStore.getHierarchicalPrograms(true);

  return (
    <div className="festival-backdrop min-h-screen text-gray-800">
      <GuestNavBar />
      <main className="mx-auto max-w-2xl px-4 pb-8 pt-20 sm:pt-24">
        <article className="space-y-5 rounded-2xl border border-white/50 bg-white/35 p-4 shadow-2xl backdrop-blur-lg sm:space-y-6 sm:p-6">
          <Image src="/theme/poster.webp" alt="无间道学生节主海报" width={1440} height={2160}
            priority unoptimized className="mx-auto h-auto w-full max-w-sm rounded-xl shadow-lg" />

          <header className="text-center">
            <h1>
              <Image src="/theme/wordmark.webp" alt="无间道" width={1024} height={238}
                unoptimized className="mx-auto h-auto w-full max-w-[16rem] rounded-lg" />
            </h1>
            <p className="mt-3 text-lg text-gray-700">清华大学电子系学生节</p>
          </header>

          <p className="border-t border-black/20 pt-4 leading-7 text-gray-700">
            一起欣赏同学们的原创节目，参与现场弹幕互动，揭晓今晚的幸运号码。
          </p>

          <section className="border-t border-black/20 pt-4" aria-labelledby="festival-programs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="festival-programs" className="text-lg font-bold">节目单</h2>
              {programs.length > 0 && (
                <Link href="/programs" className="text-[#743a43] underline">查看节目详情</Link>
              )}
            </div>
            {programs.length > 0 ? (
              <ol className="mt-2 divide-y divide-black/10">
                {programs.map(program => (
                  <li key={program.id} className={`py-1.5 ${program.parentId ? 'pl-5' : 'font-medium'}`}>
                    <MarkdownRenderer content={program.title} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-gray-700">敬请期待</p>
            )}
          </section>

          {video && (
            <section className="border-t border-black/20 pt-4" aria-labelledby="festival-trailer">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="festival-trailer" className="text-lg font-bold">学生节宣传片</h2>
                <a href={video.url} target="_blank" rel="noopener noreferrer" className="text-[#743a43] underline">前往 B 站观看 ↗</a>
              </div>
              {video.playerUrl && (
                <iframe title="学生节宣传片" src={video.playerUrl} loading="lazy" allowFullScreen
                  className="mt-3 aspect-video w-full rounded-xl border-0 bg-black shadow-md" />
              )}
            </section>
          )}

          {articles.length > 0 && (
            <section className="border-t border-black/20 pt-4" aria-labelledby="festival-news">
              <h2 id="festival-news" className="text-lg font-bold">学生节推送</h2>
              <ul className="mt-1 divide-y divide-black/10">
                {articles.map(({ title, url }, index) => (
                  <li key={index}>
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 py-2.5 font-medium text-[#743a43] hover:underline">
                      <span className="min-w-0 break-words">{title}</span><span aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>

        <footer className="mt-4 text-center text-sm text-gray-800 drop-shadow-md">
          © 2025 <a href="https://www.weitao-jiang.cn" target="_blank" rel="noopener noreferrer" className="hover:underline">江玮陶</a>
          {' | '}
          <a href="https://github.com/CBDT-JWT/lveying" target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub</a>
        </footer>
      </main>
      <FestivalEasterEgg />
    </div>
  );
}
