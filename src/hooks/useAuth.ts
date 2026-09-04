import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export interface AuthState {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<'signed_in' | 'confirmation_required'>;
  signIn: (email: string, password: string) => Promise<void>;
  verifyPassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setUser(null);
      else setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!isSupabaseConfigured) {
      throw new Error('Chưa cấu hình Supabase. Vui lòng thiết lập VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY.');
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), role: 'parent' } },
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Không tạo được tài khoản.');
    return data.session ? 'signed_in' as const : 'confirmation_required' as const;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      throw new Error('Chưa cấu hình Supabase. Vui lòng thiết lập VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY.');
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
  }, []);

  const verifyPassword = useCallback(async (password: string) => {
    const email = user?.email;
    if (!isSupabaseConfigured || !email || !user) {
      throw new Error('Không thể xác minh tài khoản hiện tại.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || data.user?.id !== user.id) {
      throw new Error('Không xác minh được tài khoản phụ huynh.');
    }
  }, [user]);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setUser(null);
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }, []);

  return { user, loading, isConfigured: isSupabaseConfigured, signUp, signIn, verifyPassword, signOut };
}
