import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Logo className="mb-10 justify-center" />
        <div className="glass-card-strong rounded-2xl p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Track your team&apos;s AI coding spend
            </p>
          </div>

          <Suspense fallback={<div className="h-12" />}>
            <LoginForm />
          </Suspense>

          <p className="mt-8 text-center text-[11px] text-[var(--muted-foreground)]">
            Internal tool · Bigstep employees only
          </p>
        </div>
      </div>
    </div>
  );
}
