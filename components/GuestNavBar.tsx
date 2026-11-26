'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';

export default function GuestNavBar({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  const handleRefresh = () => {
    window.location.reload();
  };

  const navItems = [
    { icon: '/home.png', label: '主页', href: '/' },
    { icon: '/programs.png', label: '节目', href: '/programs' },
    { icon: '/lottery.png', label: '抽奖', href: '/lottery' },
    { icon: '/chat.png', label: '弹幕', href: '/danmaku' },
    { icon: '/badge.png', label: '演职人员', href: '/credits' },
  ];
  const chrome = dark ? 'border-[#52615f] bg-[#1a262b]/95' : 'border-white/30 bg-white/20';
  const barSpacing = dark ? 'gap-2 px-2 sm:gap-3 sm:px-4' : 'gap-3 px-4';
  const linksSpacing = dark ? 'gap-1 sm:gap-3' : 'gap-3';
  const target = dark ? 'w-9 h-11 shrink-0 sm:w-12 sm:h-12' : 'w-12 h-12';
  const icon = dark ? 'object-contain w-6 h-auto sm:w-8 invert opacity-90' : 'object-contain';

  return (
    <div className={`fixed top-0 left-0 right-0 backdrop-blur-lg border-b shadow-lg z-50 ${chrome}`}>
      <div className={`flex items-center justify-between py-3 ${barSpacing}`}>
        {/* 返回按钮 */}
        <button
          onClick={() => router.back()}
          className={`hover:scale-110 transition-transform flex items-center justify-center relative z-10 ${target}`}
          title="返回"
        >
          <Image src="/return.png" alt="返回" width={32} height={32} className={`${icon} drop-shadow-lg`} />
        </button>

        {/* 导航按钮 */}
        <nav aria-label="网站导航" className={`flex flex-1 justify-center ${linksSpacing}`}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`transition-all flex items-center justify-center relative z-10 ${target} ${
                pathname === item.href
                  ? (dark ? 'rounded-md bg-[#38494c]' : 'scale-125 drop-shadow-2xl')
                  : 'hover:scale-110 drop-shadow-lg'
              }`}
              aria-current={pathname === item.href ? 'page' : undefined}
              title={item.label}
            >
              <Image src={item.icon} alt={item.label} width={32} height={32} className={icon} />
            </Link>
          ))}
        </nav>

        {/* 刷新按钮 */}
        <button
          onClick={handleRefresh}
          className={`hover:scale-110 transition-transform flex items-center justify-center relative z-10 ${target}`}
          title="刷新"
        >
          <Image src="/refresh.png" alt="刷新" width={32} height={32} className={`${icon} drop-shadow-lg`} />
        </button>
      </div>
    </div>
  );
}
