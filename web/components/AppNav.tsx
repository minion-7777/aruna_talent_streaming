'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Show, SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs';

const links = [
  { href: '/', label: 'Browse' },
  { href: '/studio', label: 'Go Live' },
  { href: '/ops', label: 'Scale' },
];

export function AppNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const username =
    user?.username ??
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ??
    'user';

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-violet-600 dark:text-violet-400">
            Aruna
          </Link>
          <nav className="hidden sm:flex gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Show when="signed-in">
            <span className="hidden md:inline text-sm text-zinc-500">@{username}</span>
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton />
            <SignUpButton>
              <button className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500">
                Sign up
              </button>
            </SignUpButton>
          </Show>
        </div>
      </div>
    </header>
  );
}
