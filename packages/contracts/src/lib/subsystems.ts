export const subsystemCatalog = [
  "Software",
  "Avionics",
  "Structures",
  "Payload",
  "Communications",
  "Thermal",
  "Ground Station",
] as const;

export type SubsystemName = (typeof subsystemCatalog)[number];

