import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Reuse this single client everywhere (dashboard page included) once wired in,
// instead of each file creating its own — keeps the auth session in sync.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Role = 'master' | 'admin' | 'area_manager' | 'store_manager';

export interface AuthState {
  loading: boolean;
  userId: string | null;
  email: string | null;
  role: Role | null;
  storeNames: string[]; // only populated for area_manager / store_manager
  isFullAccess: boolean; // master or admin
  canEditBudgets: boolean; // master or admin only (per current rules)
  canSeeNetProfit: boolean; // master or admin only (per current rules)
  canSeeRefitToggle: boolean; // master only (per current rules)
  canSeeOtherIncomeToggle: boolean; // master or admin only (per current rules)
  signOut: () => Promise<void>;
}

/**
 * Loads the signed-in user's session, profile role, and (if relevant)
 * their assigned stores. Redirects to /login if signed out, unless
 * redirectToLoginIfSignedOut is set to false.
 */
export function useAuth(redirectToLoginIfSignedOut = true): AuthState {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [storeNames, setStoreNames] = useState<string[]>([]);

  async function loadProfile(uid: string, userEmail: string | null) {
    setUserId(uid);
    setEmail(userEmail);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .single();

    if (profileError) {
      console.error('Failed to load profile', profileError);
    }

    const r = (profile?.role as Role) ?? null;
    setRole(r);

    if (r === 'area_manager' || r === 'store_manager') {
      const { data: access, error: accessError } = await supabase
        .from('user_store_access')
        .select('store_name')
        .eq('user_id', uid);

      if (accessError) {
        console.error('Failed to load store access', accessError);
      }
      setStoreNames((access ?? []).map((row: { store_name: string }) => row.store_name));
    } else {
      setStoreNames([]);
    }
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? null);
      } else if (redirectToLoginIfSignedOut) {
        router.push('/login');
      }
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? null);
      } else {
        setUserId(null);
        setEmail(null);
        setRole(null);
        setStoreNames([]);
        if (redirectToLoginIfSignedOut) router.push('/login');
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const isFullAccess = role === 'master' || role === 'admin';

  return {
    loading,
    userId,
    email,
    role,
    storeNames,
    isFullAccess,
    canEditBudgets: isFullAccess,
    canSeeNetProfit: isFullAccess,
    canSeeRefitToggle: role === 'master',
    canSeeOtherIncomeToggle: isFullAccess,
    signOut,
  };
}
