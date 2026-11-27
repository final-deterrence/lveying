'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';

export default function GuestNavBar() {
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

  return (
    <nav aria-label="观众导航" className="fixed inset-x-0 top-0 z-50 border-b border-white/50 bg-[#fff2e8]/80 shadow-lg backdrop-blur-lg">
      <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)_minmax(0,5fr)_minmax(0,1fr)] items-center justify-items-center px-2 py-3 sm:px-4">
        {/* 返回按钮 */}
        <button
          onClick={() => router.back()}
          className="flex h-11 w-full max-w-12 items-center justify-center transition-transform hover:scale-110 sm:h-12"
          title="返回"
        >
          <Image src="/return.png" alt="返回" width={32} height={32} className="h-7 w-7 max-w-full object-contain drop-shadow-lg sm:h-8 sm:w-8" />
        </button>

        {/* 导航按钮 */}
        <div className="grid w-full grid-cols-5 justify-items-center sm:max-w-[19rem]">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-11 w-full max-w-12 items-center justify-center transition-transform sm:h-12 ${
                pathname === item.href
                  ? 'scale-125 drop-shadow-2xl'
                  : 'hover:scale-110 drop-shadow-lg'
              }`}
              title={item.label}
              aria-current={pathname === item.href ? 'page' : undefined}
            >
              <Image src={item.icon} alt={item.label} width={32} height={32} className="h-7 w-7 max-w-full object-contain sm:h-8 sm:w-8" />
            </Link>
          ))}
        </div>

        {/* 刷新按钮 */}
        <button
          onClick={handleRefresh}
          className="flex h-11 w-full max-w-12 items-center justify-center transition-transform hover:scale-110 sm:h-12"
          title="刷新"
        >
          <Image src="/refresh.png" alt="刷新" width={32} height={32} className="h-7 w-7 max-w-full object-contain drop-shadow-lg sm:h-8 sm:w-8" />
        </button>
      </div>
    </nav>
  );
}
