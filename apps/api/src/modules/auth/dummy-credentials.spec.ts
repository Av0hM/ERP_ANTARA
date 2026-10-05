import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dummyLoginAllowed } from "./dummy-credentials";

describe("dummy login allowlist", () => {
  let root: string;
  const originalEnv = { ...process.env };
  const dummy = { email: "member@dummy.local", isDummySeed: true };
  const writeUsers = (emails: string[]) => writeFileSync(join(root, "dummy-credentials.local.json"), JSON.stringify({
    users: emails.map((email) => ({ email, name: "Dummy", password: "Dummy#12345", role: "MEMBER" })),
  }));

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "antara-allowlist-"));
    mkdirSync(join(root, "apps/api/prisma"), { recursive: true });
    writeFileSync(join(root, "apps/api/prisma/schema.prisma"), "");
    jest.spyOn(process, "cwd").mockReturnValue(root);
    process.env.NODE_ENV = "test";
    process.env.ENFORCE_DUMMY_ALLOWLIST = "true";
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    rmSync(root, { recursive: true, force: true });
  });

  it("re-reads edits immediately and normalizes emails", () => {
    writeUsers(["MEMBER@dummy.local", "admin@dummy.local"]);
    expect(dummyLoginAllowed(dummy)).toBe(true);
    writeUsers(["admin@dummy.local"]);
    expect(dummyLoginAllowed(dummy)).toBe(false);
    expect(dummyLoginAllowed({ ...dummy, email: "admin@dummy.local" })).toBe(true);
  });
  it("denies missing, malformed, and invalid files", () => {
    expect(dummyLoginAllowed(dummy)).toBe(false);
    writeFileSync(join(root, "dummy-credentials.local.json"), "{");
    expect(dummyLoginAllowed(dummy)).toBe(false);
    writeFileSync(join(root, "dummy-credentials.local.json"), '{"users":[{"email":"member@dummy.local"}]}');
    expect(dummyLoginAllowed(dummy)).toBe(false);
  });
  it("does not restrict ordinary users", () => {
    expect(dummyLoginAllowed({ ...dummy, isDummySeed: false })).toBe(true);
  });
  it("is off by default", () => {
    delete process.env.ENFORCE_DUMMY_ALLOWLIST;
    expect(dummyLoginAllowed(dummy)).toBe(true);
  });
  it("cannot activate in production", () => {
    process.env.NODE_ENV = "production";
    expect(dummyLoginAllowed(dummy)).toBe(true);
  });
});
