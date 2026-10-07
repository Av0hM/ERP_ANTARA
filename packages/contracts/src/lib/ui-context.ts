import type { SubsystemKey } from "./subsystems";

/** Presentation hints only. Every feature endpoint independently authorizes its data. */
export interface DashboardContext {
  id: string;
  label: string;
  view: "ANALYTICS" | "SUBSYSTEM" | "EMPTY";
  subsystemId?: string;
  key?: SubsystemKey;
  slug?: string;
  canManage: boolean;
}
export interface UiContext {
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
    role: "OWNER" | "ADMIN" | "MEMBER";
  };
  globalAuthority: boolean;
  contexts: DashboardContext[];
  defaultContextId: string;
  permissions: {
    manageOperations: boolean;
    viewResources: boolean;
    viewReports: boolean;
  };
  unreadCount: number;
}
