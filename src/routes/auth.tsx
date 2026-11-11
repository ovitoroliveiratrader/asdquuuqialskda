import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar · Escritório de Agentes" },
      { name: "description", content: "Acesso privado ao escritório de agentes de trading simulado." },
      { property: "og:title", content: "Entrar · Escritório de Agentes" },
      { property: "og:description", content: "Acesso privado ao escritório de agentes de trading simulado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function safePath(raw: string | undefined) {
  if (!raw) return "/escritorio";
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return "/escritorio";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/escritorio";
  }
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const go = () => navigate({ href: safePath(redirect), replace: true });
    supabase.auth.getSession().then(({ data }) => data.session && go());
    const { data } = supabase.auth.onAuthStateChange((e, session) => {
      if (e === "SIGNED_IN" && session) go();
    });
    return () => data.subscription.unsubscribe();
  }, [navigate, redirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/escritorio" },
        });
        if (error) throw error;
        if (!data.session) setSent(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + "/auth" });
    if (result.error) toast.error("Não foi possível entrar com essa conta.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-card p-7 shadow-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Laboratório privado</p>
        <h1 className="mt-2 text-3xl font-semibold">Escritório de Agentes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "entrar" ? "Entre para ver os agentes." : "A primeira conta criada vira a dona do escritório."}
        </p>

        {sent ? (
          <p className="mt-6 rounded-sm border border-border bg-muted p-4 text-sm">
            Enviamos um link de confirmação para <strong>{email}</strong>. Abra o e-mail para ativar a conta.
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-2">
              <button
                type="button"
                onClick={() => social("google")}
                className="flex h-10 w-full items-center justify-center gap-[10px] rounded-md border px-3 text-sm font-medium"
                style={{ backgroundColor: "#131314", borderColor: "#8E918F", color: "#E3E3E3" }}
              >
                <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
                Continuar com Google
              </button>
              <button type="button" className="lovable-auth-button w-full" onClick={() => social("lovable")}>
                Continue with Lovable
              </button>
            </div>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> ou com e-mail <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={submit} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" required minLength={8} autoComplete={mode === "entrar" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy} className="mt-1">
                {mode === "entrar" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
            <button
              type="button"
              className="mt-4 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}
            >
              {mode === "entrar" ? "Ainda não tem conta? Criar conta" : "Já tem conta? Entrar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
