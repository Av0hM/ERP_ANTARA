# ADR 002: Use NestJS for Backend API

## Status
Accepted

## Context
The backend API needs a structured, maintainable framework with strong TypeScript support, dependency injection, and modular architecture for the ANTARA ERP platform.

## Decision
Use NestJS 11+ with TypeScript for the backend API.

## Consequences

### Positive
- First-class TypeScript support with decorators
- Built-in dependency injection and modular architecture
- Built-in validation (class-validator), OpenAPI (Swagger)
- Excellent testing utilities (Jest integration)
- Strong ecosystem and community

### Negative
- Learning curve for developers unfamiliar with decorators/DI
- Opinionated structure may feel restrictive
- Larger bundle size than minimal frameworks

### Risks
- Version upgrade complexity (breaking changes between major versions)
- Over-engineering for simple endpoints

## Alternatives Considered
- **Fastify + TypeScript**: Faster, but less structure for large teams
- **Express + TypeScript**: Minimal, but requires manual setup for DI, validation
- **tRPC**: Great for type safety, but less mature ecosystem

## Implementation Notes
- Use modular architecture with feature modules
- Leverage guards, interceptors, pipes for cross-cutting concerns
- Use Prisma ORM for database access
- Configure Swagger for API documentation

## References
- NestJS Documentation: https://docs.nestjs.com
- Project Structure: `apps/api/src/modules/`