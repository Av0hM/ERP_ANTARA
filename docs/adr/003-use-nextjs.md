# ADR 003: Use Next.js 15 with App Router for Frontend

## Status
Accepted

## Context
The frontend needs a modern React framework with SSR/SSG support, excellent TypeScript integration, and excellent developer experience for the ANTARA ERP dashboard.

## Decision
Use Next.js 15 with App Router and React 19.

## Consequences

### Positive
- Server Components reduce client bundle size
- Built-in routing, image optimization, font optimization
- Excellent TypeScript support
- Turbopack for fast builds
- Excellent developer experience (Fast Refresh, error overlays)

### Negative
- App Router learning curve (Server Components, Suspense)
- Larger bundle than minimal SPA frameworks
- Vercel-specific optimizations

### Risks
- Server Component patterns may not fit all UI patterns
- Migration from Pages Router if needed

## Alternatives Considered
- **Vite + React**: Faster builds, but no SSR/SSG out of the box
- **Remix**: Great for SSR, but smaller ecosystem
- **Astro**: Great for content sites, less suited for dashboards

## Implementation Notes
- Use App Router with Server Components by default
- Use Client Components only where needed (interactivity)
- Leverage TanStack Query for server state
- Use Tailwind CSS for styling
- Configure path aliases for clean imports

## References
- Next.js Documentation: https://nextjs.org/docs
- Project Structure: `apps/web/src/app/`