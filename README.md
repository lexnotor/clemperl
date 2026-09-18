# ClemPerl

Multi-vendor marketplace for apparel, jewellery and bags.

## Stack

Turborepo monorepo: Next.js storefront, vendor and admin apps, NestJS API,
PostgreSQL with Prisma, Redis, Supabase Storage for media.

## Getting started

    corepack enable
    cp .env.example .env
    pnpm install
    pnpm docker:up

Each app publishes its own port: storefront on 3000, vendor on 3001, admin on
3002, API on 3003, Mailpit on 8025. No proxy and no TLS in development — the
reverse proxy belongs to production. To reach the stack from another device on
the LAN, set `DEV_HOST` to this machine's address and use it instead of
`localhost`.

## Documentation

Conventions and design documents live in `docs/`, in French.
