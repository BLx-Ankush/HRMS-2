import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { User, UserRole } from "@/types/db";

// Re-export so existing imports like `import { useAuth, UserRole } from "@/contexts/AuthContext"` keep working.
export type { User, UserRole };

export interface SignupData {
  email: string;
  password: string;
  name: string;
  employeeId: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (data: SignupData) => Promise<{ ok: boolean; needsConfirmation: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    employeeId: row.employee_id,
    department: row.department,
    position: row.position,
    phone: row.phone ?? "",
    address: row.address ?? "",
    joinDate: row.join_date,
    about: row.about ?? "",
    skills: row.skills ?? [],
    avatar: row.avatar ?? undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string): Promise<User | null> {
    const { data, error } = await supabase
      .from("profiles").select("*").eq("user_id", userId).maybeSingle();
    if (error || !data) return null;
    return rowToUser(data);
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      if (session?.user) setUser(await loadProfile(session.user.id));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      setUser(session?.user ? await loadProfile(session.user.id) : null);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const login = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false, error: error?.message };
    setUser(await loadProfile(data.user.id));
    return { ok: true };
  };

  const signup = async (d: SignupData): Promise<{ ok: boolean; needsConfirmation: boolean; error?: string }> => {
    const { data, error } = await supabase.auth.signUp({
      email: d.email,
      password: d.password,
      options: { data: { name: d.name, employee_id: d.employeeId, role: d.role } },
    });
    if (error) return { ok: false, needsConfirmation: false, error: error.message };
    if (!data.user) return { ok: false, needsConfirmation: false, error: "Sign up failed. Please try again." };
    // When email confirmation is enabled in Supabase, signUp returns a user but
    // no session — the account exists but can't sign in until the email is confirmed.
    if (data.session) {
      setUser(await loadProfile(data.user.id));
      return { ok: true, needsConfirmation: false };
    }
    return { ok: true, needsConfirmation: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateProfile = async (patch: Partial<User>) => {
    if (!user) return;
    const dbPatch: Record<string, unknown> = {};
    if (patch.phone !== undefined) dbPatch.phone = patch.phone;
    if (patch.address !== undefined) dbPatch.address = patch.address;
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.about !== undefined) dbPatch.about = patch.about;
    if (patch.skills !== undefined) dbPatch.skills = patch.skills;
    if (patch.department !== undefined) dbPatch.department = patch.department;
    if (patch.position !== undefined) dbPatch.position = patch.position;
    const { error } = await supabase.from("profiles").update(dbPatch).eq("id", user.id);
    if (!error) setUser({ ...user, ...patch });
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, loading, login, signup, logout, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
