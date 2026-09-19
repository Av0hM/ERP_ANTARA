# Contributing to ANTARA ERP

Thank you for your interest in contributing to ANTARA ERP! This guide will help you get started.

## Code of Conduct

By participating, you agree to uphold our Code of Conduct:
- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect differing viewpoints

## Getting Started

### Prerequisites
- Node.js 22+
- npm 10+
- PostgreSQL 16+
- Redis 7+ (optional, for caching)
- Git

### Setup
```bash
# Clone the repository
git clone https://github.com/your-org/antara-erp.git
cd antara-erp

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start infrastructure
docker compose -f infra/docker/docker-compose.yml up -d

# Run database migrations
cd apps/api && npm run prisma:migrate

# Start development servers
npm run dev
```

## Development Workflow

### Branch Naming
- `feature/<short-description>` - New features
- `fix/<short-description>` - Bug fixes
- `docs/<short-description>` - Documentation updates
- `refactor/<short-description>` - Code refactoring
- `chore/<short-description>` - Maintenance tasks

### Commit Messages
Follow Conventional Commits:
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`

Example:
```
feat(tasks): add dependency graph visualization

- Add D3 force-directed graph for task dependencies
- Implement critical path highlighting

Closes #123
```

### Pull Request Process
1. Ensure your branch is up to date with `main`
2. Run `npm run lint` and `npm run test` locally
3. Create PR with clear description
4. Link related issues
4. Request review from code owners
5. Address feedback
5. Squash and merge after approval

## Code Style

### TypeScript
- Strict mode enabled
- No `any` types without justification
- Use `unknown` instead of `any` when possible
- Prefer `interface` over `type` for object shapes
- Use `const` assertions for literal types

### React/Next.js
- Server Components by default
- Client Components only when necessary (`"use client"`)
- Use TanStack Query for server state
- Use Server Actions for mutations
- Follow accessibility guidelines (WCAG 2.1 AA)

### Testing
- Write tests for new features
- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical user flows (Playwright)

### Git Hooks
Pre-commit hooks run:
- TypeScript type checking (`tsc --noEmit`)
- ESLint (if configured)
- Prettier formatting (if configured)

## Architecture Guidelines

### Backend (NestJS)
- Feature modules in `apps/api/src/modules/`
- Shared modules in `apps/api/src/common/`
- Prisma for database access
- Class-validator for DTO validation
- Guards for authentication/authorization

### Frontend (Next.js)
- App Router with Server Components
- TanStack Query for server state
- Tailwind CSS for styling
- Component library in `apps/web/src/components/`

### Database (Prisma)
- Migrations for all schema changes
- Indexes for query performance
- Soft deletes with `deletedAt`
- Audit logging for sensitive operations

## Pull Request Checklist

- [ ] Code compiles (`npm run build`)
- [ ] TypeScript passes (`npm run lint`)
- [ ] Tests pass (`npm run test`)
- [ ] No new ESLint warnings
- [ ] Documentation updated
- [ ] CHANGELOG updated (if applicable)
- [ ] Related issue linked
- [ ] Screenshots for UI changes

## Release Process

### Versioning
Semantic Versioning (SemVer):
- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes (backward compatible)

### Release Steps
1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create release tag
4. GitHub Actions builds and deploys
5. Verify deployment

## Getting Help

- Check existing issues and PRs
- Ask in GitHub Discussions
- Tag maintainers for urgent issues
- Check documentation in `docs/`

## License

By contributing, you agree that your contributions will be licensed under the project's license (MIT).