import { Prisma } from "@prisma/client";

// Normal feature relations deliberately omit email and all account/security state.
export const safeUserSelect = {
  id: true,
  name: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

// Privileged member-directory/profile and resource-planning fields only.
export const memberProfileSelect = {
  ...safeUserSelect,
  email: true,
  role: true,
  skills: true,
  weeklyCapacityHours: true,
  availabilityScore: true,
  subsystemId: true,
  subsystem: { select: { id: true, name: true, color: true } },
} satisfies Prisma.UserSelect;
