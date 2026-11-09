"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store";
import { clearDemoCookie } from "@/lib/demo-mode";
import { APP_DESCRIPTION } from "@/lib/constants";
import { BrandMark } from "@/components/shared/brand-mark";
import { loadStaffSessionFromSupabase } from "@/lib/auth/staff-session";
import { markSessionVerified } from "@/lib/auth/ensure-session";

function safeRedirectPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/dashboard";
  }
  return raw;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key || url.includes("your-project")) {
      toast.error("Supabase is not configured", {
        description: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
      });
      setLoading(false);
      return;
    }

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const session = await loadStaffSessionFromSupabase(
        supabase,
        data.user.id,
        data.user.email ?? ""
      );

      if (!session) {
        await supabase.auth.signOut();
        throw new Error(
          "No staff profile found for this account. Use a staff login or ask an admin to invite you."
        );
      }

      setSession({
        staff: session.staff,
        branch: session.branch,
        isDemoMode: false,
      });
      markSessionVerified();

      clearDemoCookie();
      toast.success("Welcome back");
      router.push(safeRedirectPath(searchParams.get("redirect")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-app relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/25 blur-3xl"
        animate={{ y: [0, 24, 0], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-primary/15 blur-3xl"
        animate={{ y: [0, -20, 0], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <BrandMark size="md" className="shadow-xl shadow-primary/30" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            <BrandMark variant="wordmark" wordmarkClassName="text-3xl" />
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Admin Dashboard · {APP_DESCRIPTION}
          </p>
        </div>

        <Card className="border-white/30 shadow-2xl shadow-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Staff Sign In
            </CardTitle>
            <CardDescription>
              Role-based access for Super Admin, Manager, Cashier, Receptionist, and Coach.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : null}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-app flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
