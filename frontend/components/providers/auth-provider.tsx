'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { initAuth, isAuthenticated, isLoading, isHydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  // Initialize auth on mount
  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Handle auth redirects after hydration
  useEffect(() => {
    // Wait for zustand to rehydrate from localStorage
    if (!isHydrated) return;

    // Don't redirect while still loading
    if (isLoading) return;

    // Public routes that don't require auth
    const publicRoutes = ['/', '/login', '/register'];

    // Redirect to login if not authenticated and not on a public route
    if (!isAuthenticated && !publicRoutes.includes(pathname)) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, isHydrated, pathname, router]);

  // Always render children immediately
  return <>{children}</>;
}
