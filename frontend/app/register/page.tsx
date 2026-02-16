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
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="p-2 rounded-lg bg-[var(--primary)]">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold text-[var(--text-primary)]">SLCA</span>
        </div>

        {/* Form Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Create account</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Sign up to start using SLCA
          </p>
        </div>

        {/* Form Card */}
        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First name"
                type="text"
                placeholder="John"
                error={errors.first_name?.message}
                {...register('first_name')}
              />

              <Input
                label="Last name"
                type="text"
                placeholder="Doe"
                error={errors.last_name?.message}
                {...register('last_name')}
              />
            </div>

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
              placeholder="Create a password"
              error={errors.password?.message}
              {...register('password')}
            />

            <Input
              label="Confirm password"
              type="password"
              placeholder="Confirm your password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <p className="text-xs text-[var(--text-muted)]">
              By creating an account, you agree to our{' '}
              <Link href="/terms" className="text-[var(--primary)] hover:underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-[var(--primary)] hover:underline">
                Privacy Policy
              </Link>
            </p>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
              disabled={isLoading}
            >
              Create account
            </Button>
          </form>
        </div>

        {/* Sign in link */}
        <p className="text-center text-sm text-[var(--text-tertiary)] mt-5">
          Already have an account?{' '}
          <Link href="/login" className="text-[var(--primary)] font-medium hover:underline">
            Sign in
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
