import { AppRole } from "@antara/contracts";

export const FALLBACK_USER_ID = "fallback-user";
export const FALLBACK_USER_NAME = "Mission Member";
export const FALLBACK_USER_ROLE = AppRole.MEMBER;

export const subsystemIdMap = {
  Software: "software",
  Avionics: "avionics",
  Structures: "structures",
  Payload: "payload",
  Communications: "communications",
  Thermal: "thermal",
  "Ground Station": "ground-station",
} as const;

