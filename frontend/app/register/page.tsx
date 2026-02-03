'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/lib/store';
import { registerSchema, type RegisterFormData } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GraduationCap, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser, error: authError, clearError } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setIsLoading(true);
      clearError();
      await registerUser({
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
      });
      toast.success('Account created successfully!');
      router.push('/dashboard');
    } catch (error) {
      console.error('Registration failed:', error);
      toast.error(authError || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4 py-12 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[var(--gradient-mesh)] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[var(--accent-purple)] rounded-full blur-[128px] opacity-20 pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/4 w-96 h-96 bg-[var(--accent-green)] rounded-full blur-[128px] opacity-20 pointer-events-none" />

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
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">Create Account</h2>
            <p className="text-[var(--text-secondary)] mt-1">Start your learning journey today</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                type="text"
                placeholder="John"
                error={errors.first_name?.message}
                {...register('first_name')}
              />

              <Input
                label="Last Name"
                type="text"
                placeholder="Doe"
                error={errors.last_name?.message}
                {...register('last_name')}
              />
            </div>

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
              placeholder="Create a strong password"
              error={errors.password?.message}
              {...register('password')}
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="Confirm your password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <p className="text-xs text-[var(--text-tertiary)]">
              By creating an account, you agree to our{' '}
              <Link href="/terms" className="text-[var(--accent-blue)] hover:opacity-80 transition-opacity">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-[var(--accent-blue)] hover:opacity-80 transition-opacity">
                Privacy Policy
              </Link>
              .
            </p>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
              disabled={isLoading}
            >
              Create Account
            </Button>

            <p className="text-center text-sm text-[var(--text-secondary)]">
              Already have an account?{' '}
              <Link href="/login" className="text-[var(--accent-blue)] font-medium hover:opacity-80 transition-opacity">
                Sign in
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
