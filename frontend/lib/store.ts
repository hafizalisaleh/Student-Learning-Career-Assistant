import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from './api';
import { User, LoginData, RegisterData } from './types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  initAuth: () => void;
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  clearError: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      isHydrated: false,
      error: null,

      setHydrated: () => set({ isHydrated: true }),

      setAuth: (user, token) =>
        set({ user, token, isAuthenticated: true, isLoading: false, error: null }),

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false, isLoading: false, error: null });
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      },

      initAuth: () => {
        // Initialize auth state from localStorage
        const state = get();
        if (state.token && state.user) {
          set({ isAuthenticated: true, isLoading: false });
        } else {
          set({ isLoading: false });
        }
      },

      login: async (data: LoginData) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post('/api/users/login', data);
          const { access_token, user } = response.data;
          set({
            user,
            token: access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });
        } catch (error: any) {
          const errorMessage = error.response?.data?.detail || 'Login failed';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post('/api/users/register', data);
          const { access_token, user } = response.data;
          set({
            user,
            token: access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });
        } catch (error: any) {
          const errorMessage = error.response?.data?.detail || 'Registration failed';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state, error) => {
        if (!error) {
          // Use the store's setState directly instead of state.setHydrated()
          useAuthStore.setState({ isHydrated: true });
        }
      },
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
