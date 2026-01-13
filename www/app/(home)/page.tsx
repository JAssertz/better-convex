'use client';

import { Code2, Database, Lock, Radio, Server, Shield } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

const features = [
  {
    icon: Code2,
    title: 'cRPC',
    description: 'tRPC, ported to Convex. AI-ready.',
    color: 'bg-indigo-500/10 text-indigo-500',
  },
  {
    icon: Radio,
    title: 'Real-time native',
    description:
      'WebSocket subscriptions flow directly into TanStack Query cache. No extra setup.',
    color: 'bg-amber-500/10 text-amber-500',
  },
  {
    icon: Shield,
    title: 'TanStack Query native',
    description:
      'useQuery, useMutation, useInfiniteQuery. All the patterns you know, with real-time updates.',
    color: 'bg-pink-500/10 text-pink-500',
  },
  {
    icon: Database,
    title: 'Relationships built-in',
    description:
      'Ents gives you relations, fluent queries, and ctx.table(). No more manual joins.',
    color: 'bg-orange-500/10 text-orange-500',
  },
  {
    icon: Lock,
    title: 'Auth that works',
    description:
      'Better Auth integration with session management, route guards, and lifecycle hooks.',
    color: 'bg-lime-500/10 text-lime-500',
  },
  {
    icon: Server,
    title: 'RSC ready',
    description:
      'Fire-and-forget prefetch or awaited preloading. Hydration included.',
    color: 'bg-sky-500/10 text-sky-500',
  },
];

// Syntax highlighting helpers
const kw = (text: string) => <span className="text-[#ff79c6]">{text}</span>;
const fn = (text: string) => <span className="text-[#50fa7b]">{text}</span>;
const str = (text: string) => <span className="text-[#f1fa8c]">{text}</span>;
const _type = (text: string) => <span className="text-[#8be9fd]">{text}</span>;
const _num = (text: string) => <span className="text-[#bd93f9]">{text}</span>;
const cm = (text: string) => <span className="text-[#6272a4]">{text}</span>;
const op = (text: string) => <span className="text-[#ff79c6]">{text}</span>;
const pr = (text: string) => <span className="text-[#f8f8f2]">{text}</span>;

// Token with tooltip (like tRPC's twoslash)
function T({ children, lsp }: { children: ReactNode; lsp: string }) {
  return (
    <span className="twoslash-hover" data-lsp={lsp}>
      {children}
    </span>
  );
}

// Code blocks with syntax highlighting
function Step1Code() {
  return (
    <>
      {cm('// convex/functions/greeting.ts')}
      {'\n'}
      {kw('export const ')}
      {T({
        children: fn('greeting'),
        lsp: 'const greeting: Query<{ name: string }, string>',
      })}{' '}
      {op('=')} {pr('publicQuery')}
      {'\n'}
      {'  '}.{fn('input')}({pr('z')}.{fn('object')}({'{ '}
      {pr('name')}: {pr('z')}.{fn('string')}(){' }'}))
      {'\n'}
      {'  '}.{fn('output')}({pr('z')}.{fn('string')}())
      {'\n'}
      {'  '}.{fn('query')}({kw('async ')}({'{ '}
      {T({ children: pr('input'), lsp: 'input: { name: string }' })}
      {' }'}) {op('=>')} {'{'}
      {'\n'}
      {'    '}
      {kw('return ')}
      {str('`Hello ${')}
      {T({ children: pr('input'), lsp: 'input: { name: string }' })}.
      {pr('name')}
      {str('}`')}
      {';'}
      {'\n'}
      {'  }'});
    </>
  );
}

function Step2Code() {
  return (
    <>
      {cm('// src/lib/convex/crpc.tsx')}
      {'\n'}
      {kw('import ')}
      {'{ '}
      {pr('api')}
      {' }'} {kw('from ')}
      {str("'@convex/_generated/api'")}
      {';'}
      {'\n'}
      {kw('import ')}
      {'{ '}
      {pr('meta')}
      {' }'} {kw('from ')}
      {str("'@convex/meta'")}
      {';'}
      {'\n'}
      {kw('import ')}
      {'{ '}
      {fn('createCRPCContext')}
      {' }'} {kw('from ')}
      {str("'better-convex/react'")}
      {';'}
      {'\n'}
      {'\n'}
      {kw('export const ')}
      {'{ '}
      {T({ children: fn('useCRPC'), lsp: 'const useCRPC: () => CRPCProxy' })}
      {' }'} {op('=')} {fn('createCRPCContext')}({pr('api')}, {pr('meta')});
    </>
  );
}

function Step3Code() {
  return (
    <>
      {cm('// app/page.tsx')}
      {'\n'}
      {kw('const ')}
      {pr('crpc')} {op('=')} {fn('useCRPC')}();
      {'\n'}
      {'\n'}
      {kw('const ')}
      {'{ '}
      {T({ children: pr('data'), lsp: 'const data: string | undefined' })}
      {' }'} {op('=')} {fn('useQuery')}({'\n'}
      {'  '}
      {pr('crpc')}.{pr('greeting')}.{fn('queryOptions')}({'{ '}
      {pr('name')}: {str("'World'")}
      {' }'}){'\n'}
      );
      {'\n'}
      {'\n'}
      {cm('// Mutations work the same way')}
      {'\n'}
      {kw('const ')}
      {T({ children: pr('create'), lsp: 'const create: UseMutationResult' })}{' '}
      {op('=')} {fn('useMutation')}({pr('crpc')}.{pr('posts')}.{pr('create')}.
      {fn('mutationOptions')}());
      {'\n'}
      {pr('create')}.{fn('mutate')}({'{ '}
      {pr('title')}: {str("'Hello'")}
      {' }'});
    </>
  );
}

const steps = [
  {
    num: 1,
    title: 'Define your procedures',
    description:
      'Chain .input(), .output(), .query() to build type-safe procedures.',
    code: <Step1Code />,
  },
  {
    num: 2,
    title: 'Create your client',
    description:
      'Bridge Convex with TanStack Query. The useCRPC hook gives you a typed proxy to all your procedures.',
    code: <Step2Code />,
  },
  {
    num: 3,
    title: 'Connect and start querying!',
    description:
      'Full TypeScript autocompletion from server to client. Queries subscribe to real-time updates via WebSocket.',
    code: <Step3Code />,
  },
];

function Hero() {
  return (
    <section className="flex flex-col items-center px-6 pt-20 pb-8 text-center md:pt-32 md:pb-12">
      <h1 className="flex flex-wrap items-center justify-center gap-x-3 font-black text-5xl text-fd-foreground uppercase [letter-spacing:-.05em] md:text-6xl lg:text-7xl">
        <span>Better</span>
        <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">
          Convex
        </span>
      </h1>
      <h2 className="mt-4 max-w-xl text-balance font-bold text-2xl [letter-spacing:-0.03em] md:text-4xl">
        Best-in-class stack
      </h2>
      <p className="mt-6 max-w-2xl text-fd-muted-foreground text-lg md:text-xl">
        <a
          className="font-medium text-fd-foreground underline decoration-fd-muted-foreground/50 decoration-dashed underline-offset-2 hover:decoration-fd-foreground"
          href="https://trpc.io"
          rel="noopener noreferrer"
          target="_blank"
        >
          tRPC
        </a>
        {' + '}
        <a
          className="font-medium text-fd-foreground underline decoration-fd-muted-foreground/50 decoration-dashed underline-offset-2 hover:decoration-fd-foreground"
          href="https://tanstack.com/query"
          rel="noopener noreferrer"
          target="_blank"
        >
          TanStack Query
        </a>
        {' + '}
        <a
          className="font-medium text-fd-foreground underline decoration-fd-muted-foreground/50 decoration-dashed underline-offset-2 hover:decoration-fd-foreground"
          href="https://better-auth.com"
          rel="noopener noreferrer"
          target="_blank"
        >
          Better Auth
        </a>
      </p>

      <div className="mt-10">
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md bg-fd-primary px-6 font-medium text-fd-primary-foreground text-sm transition-colors hover:bg-fd-primary/90"
          href="/docs"
        >
          Get Started
        </Link>
      </div>
    </section>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-12 text-center">
      <h2 className="font-bold text-2xl text-fd-foreground md:text-3xl">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-fd-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function Features() {
  return (
    <section className="px-6 pt-8 pb-16 md:pt-12 md:pb-24">
      <div className="mx-auto max-w-5xl">
        <SectionTitle title="What's included" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title}>
              <div
                className={`mb-4 grid h-12 w-12 place-items-center rounded-xl ${feature.color}`}
              >
                <feature.icon className="size-6" />
              </div>
              <h3 className="font-bold text-fd-foreground text-lg md:text-xl">
                {feature.title}
              </h3>
              <p className="mt-2 text-fd-muted-foreground text-sm md:text-base">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuickIntro() {
  return (
    <section className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-5xl">
        <SectionTitle
          description="It's quick and easy to build a typesafe API with Better Convex."
          title="Simple to use"
        />
        <div className="space-y-16 md:space-y-24">
          {steps.map((step, i) => (
            <div
              className={`flex flex-col gap-8 lg:flex-row lg:gap-12 ${
                i % 2 === 1 ? 'lg:flex-row-reverse' : ''
              }`}
              key={step.num}
            >
              {/* Text content */}
              <div className="flex flex-1 flex-col justify-center">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/10 font-bold text-lg text-sky-500">
                  {step.num}
                </div>
                <h3 className="font-bold text-fd-foreground text-xl md:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-3 text-fd-muted-foreground">
                  {step.description}
                </p>
              </div>

              {/* Code block */}
              <div className="flex-1">
                <div className="code-block overflow-hidden rounded-xl border border-fd-border">
                  <div className="flex items-center gap-2 border-fd-border border-b bg-[#282a36] px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-[#ff5555]/80" />
                      <div className="h-3 w-3 rounded-full bg-[#f1fa8c]/80" />
                      <div className="h-3 w-3 rounded-full bg-[#50fa7b]/80" />
                    </div>
                  </div>
                  <pre className="overflow-x-auto bg-[#282a36] p-4 font-mono text-[13px] leading-relaxed">
                    <code className="text-[#f8f8f2]">{step.code}</code>
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md bg-fd-primary px-6 font-medium text-fd-primary-foreground text-sm transition-colors hover:bg-fd-primary/90"
            href="/docs"
          >
            Read the docs →
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <Hero />
      <Features />
      <QuickIntro />
    </main>
  );
}
