# ADR 001: Use PostgreSQL as Primary Data Store

## Status
Accepted

## Context
The ANTARA ERP platform requires a robust, reliable relational database for storing mission-critical data including tasks, users, calendar events, worklogs, and audit logs. The team evaluated several database options.

## Decision
Use PostgreSQL 16+ as the primary data store, accessed via Prisma ORM.

## Consequences

### Positive
- ACID compliance ensures data integrity for mission-critical operations
- Strong JSON support for flexible schema evolution (analytics payloads, AI insights)
- Mature ecosystem with excellent tooling (pgAdmin, Prisma, pg_dump)
- Proven track record in production environments
- Excellent support for complex queries and reporting

### Negative
- Operational overhead compared to managed services
- Horizontal scaling requires more effort than NoSQL solutions
- Connection pooling needed for high concurrency

### Risks
- Database migration complexity as schema evolves
- Single point of failure without replication setup

## Alternatives Considered
- **MySQL**: Less robust JSON support, weaker GIS extensions
- **MongoDB**: No ACID transactions across documents, schema validation weaker
- **SQLite**: Not suitable for concurrent multi-user access
- **Firebase/Supabase**: Vendor lock-in, less control over data

## Implementation Notes
- Use Prisma Migrate for schema versioning
- Enable pg_trgm for full-text search
- Configure connection pooling with PgBouncer
- Set up automated backups with pg_dump

## References
- Prisma Schema: `apps/api/prisma/schema.prisma`
- Migration scripts: `apps/api/prisma/migrations/`