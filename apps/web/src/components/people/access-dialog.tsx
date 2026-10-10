"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useState, type FormEvent } from "react";
import type {
  AccessSelection,
  InvitationCreated,
  PersonRecord,
} from "@antara/contracts";
import { Button } from "@/components/ui/button";
import { useShell } from "@/components/layout/app-shell";
import { createInvitation, peopleRequest } from "@/lib/people-api";

export function AccessDialog({
  token,
  person,
  onClose,
  onSaved,
}: {
  token: string;
  person?: PersonRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const shell = useShell();
  const owner = shell.data.globalAuthority;
  const scopes = shell.data.contexts.filter(
    (c) => c.subsystemId && c.canManage,
  );
  const [globalRole, setGlobalRole] = useState<AccessSelection["globalRole"]>(
    person?.role === "OWNER" ? "OWNER" : "MEMBER",
  );
  const [grants, setGrants] = useState<Record<string, "MEMBER" | "ADMIN" | "">>(
    Object.fromEntries(
      person?.memberships.map((m) => [m.subsystemId, m.accessLevel]) ?? [],
    ),
  );
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<InvitationCreated>();
  const [copied, setCopied] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const memberships =
      globalRole === "OWNER"
        ? []
        : scopes.flatMap((scope) => {
            const accessLevel = grants[scope.subsystemId!];
            return accessLevel
              ? [{ subsystemId: scope.subsystemId!, accessLevel }]
              : [];
          });
    try {
      const access = { globalRole, memberships };
      if (person) {
        await peopleRequest(
          `/users/${person.id}/access`,
          token,
          "PATCH",
          access,
        );
        onSaved();
        onClose();
      } else {
        setCreated(await createInvitation(token, email, access));
        onSaved();
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save access.",
      );
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created!.invitationUrl);
      setCopied(true);
    } catch {
      setError("Clipboard is unavailable. Select and copy the link below.");
    }
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw_-_2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-steel/30 bg-slate-950 p-6 shadow-glass">
          <Dialog.Title className="text-xl font-semibold">
            {created
              ? "Invitation created"
              : person
                ? `Edit access for ${person.name}`
                : "Invite person"}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {person
              ? "Access changes revoke existing sessions. The person will need to sign in again."
              : "Invite someone to Project ANTARA with precisely the access they need."}
          </Dialog.Description>
          {created ? (
            <div className="mt-6 space-y-4">
              <p>{created.email}</p>
              <p className="text-sm">
                {created.globalRole === "OWNER"
                  ? "Owner — Global access"
                  : created.memberships
                      .map((m) => `${m.name} — ${m.accessLevel}`)
                      .join(", ") || "Member — no subsystem access"}
              </p>
              <p role="status" className="text-sm text-muted">
                {created.emailDelivery.status === "disabled"
                  ? "Invitation created. Email delivery is disabled."
                  : created.emailDelivery.status === "queued"
                    ? "Invitation created. Email queued for delivery."
                    : "Invitation created. Email delivery is unavailable. Share the link directly."}
              </p>
              <label className="block text-sm">
                Invitation link
                <input
                  className="input-field mt-2"
                  readOnly
                  value={created.invitationUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <p className="text-xs text-muted">
                This link is shown only now. If you lose it, revoke the
                invitation and create another.
              </p>
              <div className="flex gap-3">
                <Button onClick={copy}>
                  {copied ? "Copied" : "Copy Link"}
                </Button>
                <Button variant="secondary" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-5">
              {!person && (
                <label className="block text-sm">
                  Email
                  <input
                    type="email"
                    className="input-field mt-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </label>
              )}
              <fieldset>
                <legend className="mb-2 text-sm font-medium">
                  Global access
                </legend>
                <div className="flex gap-5">
                  {(["MEMBER", "OWNER"] as const)
                    .filter((role) => owner || role === "MEMBER")
                    .map((role) => (
                      <label
                        key={role}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="global-access"
                          value={role}
                          checked={globalRole === role}
                          onChange={() => setGlobalRole(role)}
                        />
                        {role === "MEMBER" ? "Member" : "Owner"}
                      </label>
                    ))}
                </div>
              </fieldset>
              {globalRole === "OWNER" && (
                <p className="text-sm text-muted">
                  Owners have global access and do not require subsystem
                  memberships.
                  {person ? " Existing memberships are preserved." : ""}
                </p>
              )}
              {!owner && (
                <p className="text-sm text-muted">
                  You may invite Members only into subsystems you administer.
                </p>
              )}
              <fieldset disabled={globalRole === "OWNER"}>
                <legend className="mb-2 text-sm font-medium">
                  Subsystem access
                </legend>
                <div className="space-y-3">
                  {scopes.map((scope) => (
                    <label
                      key={scope.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span>{scope.label}</span>
                      <select
                        aria-label={`${scope.label} access`}
                        className="input-field w-32"
                        value={
                          globalRole === "OWNER"
                            ? ""
                            : (grants[scope.subsystemId!] ?? "")
                        }
                        onChange={(event) =>
                          setGrants({
                            ...grants,
                            [scope.subsystemId!]: event.target.value as
                              "" | "MEMBER" | "ADMIN",
                          })
                        }
                      >
                        <option value="">None</option>
                        <option value="MEMBER">Member</option>
                        {owner && <option value="ADMIN">Admin</option>}
                      </select>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : person
                      ? "Save access"
                      : "Create invitation"}
                </Button>
              </div>
            </form>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
