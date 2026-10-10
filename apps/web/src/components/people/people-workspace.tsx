"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PersonRecord } from "@antara/contracts";
import { Button } from "@/components/ui/button";
import { useShell } from "@/components/layout/app-shell";
import { useActorProfile } from "@/hooks/use-actor-profile";
import { fetchInvitations, fetchPeople, peopleRequest } from "@/lib/people-api";
import { AccessDialog } from "./access-dialog";
const date = (value: string) => new Date(value).toLocaleString();
export function PeopleWorkspace() {
  const shell = useShell();
  const actor = useActorProfile();
  const cache = useQueryClient();
  const permitted = shell.data.permissions.viewPeople;
  const [tab, setTab] = useState<"members" | "invitations">("members");
  const [editor, setEditor] = useState<"invite" | PersonRecord>();
  const [action, setAction] = useState<{
    title: string;
    path: string;
    method: string;
    self?: boolean;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const people = useQuery({
    queryKey: ["people", actor?.id],
    queryFn: () => fetchPeople(actor!.accessToken),
    enabled: permitted && !!actor,
    retry: false,
  });
  const invitations = useQuery({
    queryKey: ["people-invitations", actor?.id],
    queryFn: () => fetchInvitations(actor!.accessToken),
    enabled: permitted && !!actor && tab === "invitations",
    retry: false,
  });
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["people"] });
    void cache.invalidateQueries({ queryKey: ["people-invitations"] });
    shell.refresh();
  };
  const confirm = async () => {
    if (!action || !actor) return;
    setBusy(true);
    setError("");
    try {
      await peopleRequest(action.path, actor.accessToken, action.method);
      setAction(undefined);
      setNotice("Change saved.");
      if (action.self) shell.logout();
      else refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (!permitted)
    return (
      <section className="glass-panel rounded-2xl p-6">
        <h1 className="text-2xl">People</h1>
        <p role="alert" className="mt-4">
          You do not have permission to manage people.
        </p>
      </section>
    );
  const activeQuery = tab === "members" ? people : invitations;
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-saffron">
            Team administration
          </p>
          <h1 className="mt-1 text-3xl font-semibold">People</h1>
          <p className="mt-2 text-sm text-muted">
            {shell.data.globalAuthority
              ? "Manage team access and invitation onboarding."
              : "Members and invitations within the subsystems you administer."}
          </p>
        </div>
        <Button onClick={() => setEditor("invite")}>Invite Person</Button>
      </header>
      <nav aria-label="People views" className="flex gap-2">
        {(["members", "invitations"] as const).map((value) => (
          <Button
            key={value}
            variant={tab === value ? "primary" : "secondary"}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {value === "members" ? "Members" : "Invitations"}
          </Button>
        ))}
      </nav>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {activeQuery.isLoading && <p role="status">Loading {tab}…</p>}
      {activeQuery.error && (
        <div role="alert" className="glass-panel rounded-xl p-4">
          <p>{activeQuery.error.message}</p>
          <Button variant="secondary" onClick={() => activeQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {!activeQuery.error && tab === "members" && (
        <div className="space-y-3">
          {people.data?.map((person) => (
            <article
              key={person.id}
              className="glass-panel flex flex-wrap justify-between gap-4 rounded-2xl p-5"
            >
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{person.name}</h2>
                <p className="break-all text-sm text-muted">{person.email}</p>
                <p className="mt-2 text-sm">
                  {person.role} ·{" "}
                  {!person.isActive
                    ? "Inactive"
                    : person.onboardingPending
                      ? "Pending onboarding"
                      : "Active"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {person.role === "OWNER" && (
                    <span className="rounded-full bg-saffron/10 px-3 py-1 text-xs text-saffron">
                      Global access
                    </span>
                  )}
                  {person.memberships.map((m) => (
                    <span
                      key={m.subsystemId}
                      className="rounded-full border border-steel/30 px-3 py-1 text-xs"
                    >
                      {m.subsystem.name} — {m.accessLevel}
                    </span>
                  ))}
                  {!person.memberships.length && person.role !== "OWNER" && (
                    <span className="text-xs text-muted">
                      No subsystem access
                    </span>
                  )}
                </div>
              </div>
              {shell.data.globalAuthority && (
                <div className="flex flex-wrap items-start gap-2">
                  <Button
                    variant="secondary"
                    disabled={!person.isActive || person.onboardingPending}
                    title={
                      person.onboardingPending
                        ? "Invitation must be accepted before editing access"
                        : !person.isActive
                          ? "Reactivate before editing access"
                          : undefined
                    }
                    onClick={() => setEditor(person)}
                  >
                    Edit Access
                  </Button>
                  {[
                    {
                      label: person.isActive ? "Deactivate" : "Reactivate",
                      route: person.isActive ? "deactivate" : "reactivate",
                    },
                    { label: "Revoke Sessions", route: "revoke-sessions" },
                  ].map((item) => (
                    <Button
                      key={item.route}
                      variant="secondary"
                      onClick={() => {
                        setError("");
                        setAction({
                          title: `${item.label} — ${person.name}`,
                          path: `/users/${person.id}/${item.route}`,
                          method: "PATCH",
                          self: person.id === actor?.id,
                        });
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              )}
            </article>
          ))}
          {people.data?.length === 0 && (
            <p className="glass-panel rounded-2xl p-8 text-muted">
              No team members yet. Invite the first subsystem member to start
              collaborating.
            </p>
          )}
        </div>
      )}
      {!activeQuery.error && tab === "invitations" && (
        <div className="space-y-3">
          {invitations.data?.map((invite) => (
            <article
              key={invite.id}
              className="glass-panel flex flex-wrap justify-between gap-4 rounded-2xl p-5"
            >
              <div className="min-w-0">
                <h2 className="break-all font-semibold">{invite.email}</h2>
                <p className="mt-1 text-sm">
                  {invite.globalRole === "OWNER"
                    ? "OWNER — Global access"
                    : invite.memberships
                        .map((m) => `${m.name} — ${m.accessLevel}`)
                        .join(", ") || "Unassigned Member"}
                </p>
                <p className="mt-2 text-sm text-muted">
                  Invited by {invite.invitedBy?.name ?? "Team administrator"} ·{" "}
                  {invite.status}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Created {date(invite.createdAt)} · Expires{" "}
                  {date(invite.expiresAt)}
                </p>
              </div>
              {invite.status === "PENDING" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError("");
                    setAction({
                      title: `Revoke invitation for ${invite.email}`,
                      path: `/invitations/${invite.id}/revoke`,
                      method: "POST",
                    });
                  }}
                >
                  Revoke
                </Button>
              )}
            </article>
          ))}
          {invitations.data?.length === 0 && (
            <p className="glass-panel rounded-2xl p-8 text-muted">
              No invitations yet.
            </p>
          )}
        </div>
      )}
      {editor && actor && (
        <AccessDialog
          token={actor.accessToken}
          person={editor === "invite" ? undefined : editor}
          onClose={() => setEditor(undefined)}
          onSaved={refresh}
        />
      )}
      <Dialog.Root
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(undefined);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-steel/30 bg-slate-950 p-6">
            <Dialog.Title className="text-xl">{action?.title}</Dialog.Title>
            <Dialog.Description className="mt-3 text-sm text-muted">
              This security action takes effect immediately. Revoked sessions
              require a new sign-in. Historical work is preserved.
            </Dialog.Description>
            {error && (
              <p role="alert" className="mt-3 text-danger">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setAction(undefined)}
              >
                Cancel
              </Button>
              <Button disabled={busy} onClick={confirm}>
                {busy ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
