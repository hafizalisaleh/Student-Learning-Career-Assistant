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
import { GraduationCap, ArrowLeft } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[var(--gradient-mesh)] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--accent-blue)] rounded-full blur-[128px] opacity-20 pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--accent-purple)] rounded-full blur-[128px] opacity-20 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-2 rounded-xl bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)]">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">SLCA</h1>
        </div>

        {/* Card */}
        <div className="p-8 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)]">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">Welcome Back</h2>
            <p className="text-[var(--text-secondary)] mt-1">Sign in to your account to continue learning</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="Email"
              type="email"
              placeholder="your@email.com"
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

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-[var(--card-border)] bg-[var(--bg-elevated)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)] focus:ring-offset-0"
                />
                <span className="text-[var(--text-secondary)]">Remember me</span>
              </label>
              <Link href="/reset-password" className="text-[var(--accent-blue)] hover:opacity-80 transition-opacity">
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
              Sign In
            </Button>

            <p className="text-center text-sm text-[var(--text-secondary)]">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-[var(--accent-blue)] font-medium hover:opacity-80 transition-opacity">
                Sign up
              </Link>
            </p>
          </form>
        </div>

        <Link
          href="/"
          className="flex items-center justify-center gap-2 mt-6 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
