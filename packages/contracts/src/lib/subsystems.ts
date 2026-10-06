/** Frozen v1 operational catalog. Legacy database rows require reviewed mapping. */
export const canonicalSubsystems = [
  {
    key: "ADCS",
    name: "ADCS",
    slug: "adcs",
    description: "Attitude Determination & Control System",
    color: "#7ef2c6",
  },
  {
    key: "PAYLOAD",
    name: "Payload",
    slug: "payload",
    description: "Scientific payload work",
    color: "#ffa0a0",
  },
  {
    key: "GROUND_COMMS",
    name: "Ground-Station & Comms",
    slug: "ground-comms",
    description: "Ground station and communications",
    color: "#8cc8ff",
  },
  {
    key: "SDM",
    name: "SDM",
    slug: "sdm",
    description: "Sponsorship, Design & Media",
    color: "#f3d17a",
  },
  {
    key: "MAIN_SATELLITE",
    name: "Main Satellite",
    slug: "main-satellite",
    description: "Main spacecraft and integrated satellite work",
    color: "#6aa4ff",
  },
] as const;

export type SubsystemKey = (typeof canonicalSubsystems)[number]["key"];
export type SubsystemSlug = (typeof canonicalSubsystems)[number]["slug"];
export type CanonicalSubsystemName =
  (typeof canonicalSubsystems)[number]["name"];
/** @deprecated Read compatibility only, pending reviewed legacy backfill.
 * These names are NOT canonical identities or provisioning inputs.
 */
export type LegacySubsystemName =
  | "Software"
  | "Avionics"
  | "Structures"
  | "Communications"
  | "Thermal"
  | "Ground Station";
/** Existing task display contracts must still represent unmigrated rows honestly. */
export type SubsystemName = CanonicalSubsystemName | LegacySubsystemName;
export const subsystemCatalog: readonly CanonicalSubsystemName[] =
  canonicalSubsystems.map(({ name }) => name);

export enum MembershipAccessLevel {
  MEMBER = "MEMBER",
  ADMIN = "ADMIN",
}

export interface SubsystemMembership {
  userId: string;
  subsystemId: string;
  accessLevel: MembershipAccessLevel;
  createdAt: string;
  updatedAt: string;
}
