import { ConfigService } from "@nestjs/config";
import {
  InvitationEmailJob,
  InvitationEmailProcessor,
} from "./invitation-email.processor";
const send = jest.fn();
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
}));
const data: InvitationEmailJob = {
  email: "member@fixture.invalid",
  globalRole: "MEMBER",
  memberships: [
    { name: "ADCS <private>", accessLevel: "ADMIN" },
    { name: "Payload", accessLevel: "MEMBER" },
  ],
  invitationUrl: "https://example.invalid/invite/one-time-credential",
  expiresAt: "2027-01-02T00:00:00.000Z",
};
const job = { data };
describe("Invitation email delivery boundary (offline)", () => {
  beforeEach(() => send.mockReset());
  const processor = () =>
    new InvitationEmailProcessor(
      new ConfigService({
        NOTIFICATIONS_EMAIL_ENABLED: "true",
        RESEND_API_KEY: "fixture",
        NOTIFICATIONS_FROM_EMAIL: "test@fixture.invalid",
      }),
    );
  it("renders precise grant names and actual expiry with escaped content", async () => {
    send.mockResolvedValue({ error: null });
    await expect(processor().process(job)).resolves.toBe(true);
    expect(send.mock.calls[0][0].html).toContain(
      "ADCS &lt;private&gt; — Admin",
    );
    expect(send.mock.calls[0][0].html).toContain("Payload — Member");
    expect(send.mock.calls[0][0].html).toContain(data.expiresAt);
  });
  it("delivers older queued payloads without exposing internal subsystem IDs", async () => {
    send.mockResolvedValue({ error: null });
    await processor().process({
      data: {
        email: data.email,
        token: "legacy-token",
        role: "ADMIN",
        subsystemId: "private-database-id",
        expiresAt: data.expiresAt,
      },
    });
    expect(send.mock.calls[0][0].html).toContain("/invite/legacy-token");
    expect(send.mock.calls[0][0].html).not.toContain("private-database-id");
  });
  it("SDK error responses fail truthfully without leaking provider payload", async () => {
    send.mockResolvedValue({ error: { message: data.invitationUrl } });
    await expect(processor().process(job)).rejects.toThrow(
      "EMAIL_DELIVERY_FAILED",
    );
  });
  it("disabled provider is not reported delivered", async () => {
    await expect(
      new InvitationEmailProcessor(new ConfigService()).process(job),
    ).rejects.toThrow("EMAIL_DELIVERY_UNAVAILABLE");
    expect(send).not.toHaveBeenCalled();
  });
});
