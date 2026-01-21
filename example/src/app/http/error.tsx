'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('HTTP Demo Error:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-4 font-bold text-2xl text-destructive">
        Something went wrong!
      </h1>
      <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="font-mono text-sm">{error.message}</p>
        {error.digest && (
          <p className="mt-2 text-muted-foreground text-xs">
            Digest: {error.digest}
          </p>
        )}
      </div>
      <button
        className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground text-sm"
        onClick={() => reset()}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
