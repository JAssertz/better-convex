import { SignForm } from '@/lib/convex/components/login-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-semibold text-xl tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground text-sm">Sign in to continue</p>
        </div>
        <SignForm />
      </div>
    </div>
  );
}
