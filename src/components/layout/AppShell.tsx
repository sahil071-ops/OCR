'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/lib/version';
import {
  ScanIcon,
  DatabaseIcon,
  InfoIcon,
  MenuIcon,
  XIcon,
  RefreshCwIcon,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Sessions', icon: ScanIcon },
  { href: '/masters', label: 'Masters', icon: DatabaseIcon },
  { href: '/about', label: 'About', icon: InfoIcon },
];

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Check for PWA updates by polling the health endpoint
  useEffect(() => {
    let currentVersion = APP_VERSION;

    const checkForUpdates = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.version && data.version !== currentVersion) {
            setUpdateAvailable(true);
            currentVersion = data.version; // Don't keep showing once noticed
          }
        }
      } catch {
        // Network error - silently ignore
      }
    };

    // Check immediately, then every 5 minutes
    checkForUpdates();
    const interval = setInterval(checkForUpdates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.update());
      });
    }
    window.location.reload();
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Update Banner */}
      {updateAvailable && (
        <div className="bg-blue-600 text-white text-sm text-center py-2 px-4 flex items-center justify-center gap-2">
          <RefreshCwIcon className="h-4 w-4" />
          <span>A new version is available.</span>
          <button
            onClick={handleRefresh}
            className="underline font-semibold hover:no-underline"
          >
            Refresh to update
          </button>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="bg-[#1E3A5F] text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <ScanIcon className="h-6 w-6 text-blue-300" />
              <span className="font-bold text-lg tracking-tight">Invoice Scanner</span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                      ? 'bg-blue-700 text-white'
                      : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Version badge - desktop */}
            <div className="hidden md:block text-xs text-blue-300 font-mono">
              {APP_VERSION}
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-md text-blue-200 hover:bg-blue-800"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden pb-3 border-t border-blue-700 mt-1">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors',
                    pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                      ? 'text-white bg-blue-700 rounded-md'
                      : 'text-blue-200 hover:text-white'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
              <div className="px-3 pt-2 text-xs text-blue-400 font-mono">{APP_VERSION}</div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-3 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-gray-400">
          <span>Invoice Scanner &copy; {new Date().getFullYear()}</span>
          <span className="font-mono">{APP_VERSION}</span>
        </div>
      </footer>

      {/* Bottom nav for mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-bottom">
        <div className="flex">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors',
                pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-blue-600'
              )}
            >
              <item.icon className="h-5 w-5 mb-0.5" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
