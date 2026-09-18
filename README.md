# ClemPerl

Multi-vendor marketplace for apparel, jewellery and bags.

## Stack

Turborepo monorepo: Next.js storefront, vendor and admin apps, NestJS API,
PostgreSQL with Prisma, Redis, Supabase Storage for media.

## Getting started

    corepack enable
    cp .env.example .env      # set DEV_HOST to this machine's LAN address
    pnpm install
    pnpm dev:certs            # local TLS certificate for DEV_HOST
    pnpm docker:up

The apps are served over HTTPS by nginx. Application ports are never published.

## Documentation

Conventions and design documents live in `docs/`, in French.
