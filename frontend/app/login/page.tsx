'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/lib/store';
import { loginSchema, type LoginFormData } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const { login, error: authError, clearError } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setIsLoading(true);
      clearError();
      await login(data);
      toast.success('Login successful!');
      router.push('/dashboard');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : authError || 'Login failed. Please check your credentials.';
      console.error('Login error:', errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4 py-8 relative">
      {/* Theme toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src="/logo.png" alt="SLCA" className="h-10 w-10 object-contain" />
          <span className="text-lg font-semibold text-[var(--text-primary)]">SLCA</span>
        </div>

        {/* Form Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Sign in</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Enter your credentials to access your account
          </p>
        </div>

        {/* Form Card */}
        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              error={errors.password?.message}
              {...register('password')}
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-[var(--card-border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <span className="text-xs text-[var(--text-tertiary)]">Remember me</span>
              </label>
              <Link
                href="/reset-password"
                className="text-xs text-[var(--primary)] hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
              disabled={isLoading}
            >
              Sign in
            </Button>
          </form>
        </div>

        {/* Sign up link */}
        <p className="text-center text-sm text-[var(--text-tertiary)] mt-5">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="text-[var(--primary)] font-medium hover:underline"
          >
            Create account
          </Link>
        </p>

        {/* Back to home */}
        <Link
          href="/"
          className="flex items-center justify-center gap-1.5 mt-5 text-xs text-[var(--text-muted)] hover:text-[var(--text-tertiary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
