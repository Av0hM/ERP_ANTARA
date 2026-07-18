# Folder Structure

```text
orbitalops-erp/
  apps/
    api/
      prisma/
      src/
        common/
        modules/
          auth/
          users/
          tasks/
          analytics/
          ai/
          notifications/
          calendar/
          worklogs/
          files/
    web/
      src/
        app/
        components/
        hooks/
        lib/
  packages/
    contracts/
    ui/
  docs/
    architecture/
  infra/
    docker/
```

## Rationale

- `apps/api` isolates business logic, data access, and integration services.
- `apps/web` owns UI flows, navigation, protected routes, and operator experience.
- `packages/contracts` prevents enum and DTO drift across the stack.
- `packages/ui` is reserved for reusable design-system primitives as the frontend surface expands.