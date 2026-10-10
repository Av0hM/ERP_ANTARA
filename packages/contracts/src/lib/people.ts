export interface MembershipGrant {
  subsystemId: string;
  accessLevel: "MEMBER" | "ADMIN";
}
export interface AccessSelection {
  globalRole: "MEMBER" | "OWNER";
  memberships: MembershipGrant[];
}
export interface PersonRecord {
  id: string;
  name: string;
  email: string;
  role: "MEMBER" | "ADMIN" | "OWNER";
  isActive: boolean;
  onboardingPending: boolean;
  memberships: (MembershipGrant & {
    subsystem: { name: string; key: string | null };
  })[];
}
export interface InvitationView extends AccessSelection {
  id: string;
  email: string;
  memberships: (MembershipGrant & { name: string })[];
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
  invitedBy?: { id: string; name: string };
}
export interface InvitationCreated extends InvitationView {
  invitationUrl: string;
  emailDelivery: { status: "disabled" | "queued" | "unavailable" };
}
