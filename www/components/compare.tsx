import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../lib/cn';

export function Compare({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('my-3 grid items-start gap-3 lg:grid-cols-2', className)}
      data-compare
      {...props}
    />
  );
}

export function CompareItem({
  title,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-fd-secondary',
        className
      )}
      data-compare-item
      {...props}
    >
      <div className="not-prose flex items-center gap-2 overflow-x-auto px-3 py-1.5">
        <span className="font-medium text-[0.75rem] text-fd-secondary-foreground leading-5">
          {title}
        </span>
      </div>
      <div className="prose-no-margin rounded-lg bg-fd-background p-3 text-[0.8125rem] outline-none [&>figure:only-child]:-m-3 [&>figure:only-child]:border-none">
        {children}
      </div>
    </div>
  );
}
