"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useActorProfile } from "@/hooks/use-actor-profile";
import { useAttachmentVault, useTaskCatalog } from "@/hooks/use-operations";
import { fileLifecycle, openAttachment } from "@/lib/operations-api";
import type { AttachmentRecord } from "@/lib/operations-types";

export function AttachmentVault() {
  const actor = useActorProfile();
  const queryClient = useQueryClient();
  const shell = useShell();
  const [deleted, setDeleted] = useState(false);
  const vault = useAttachmentVault(deleted);
  const { data: tasks = [] } = useTaskCatalog();
  const [taskId, setTaskId] = useState("");
  const [category, setCategory] =
    useState<AttachmentRecord["category"]>("DOCUMENT");
  const [file, setFile] = useState<File>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string>();
  const current = shell.current.subsystemId;
  const visible = vault.attachments.filter(
    (item) =>
      !current ||
      item.task?.subsystemId === current ||
      item.scopeSubsystemIds.includes(current),
  );
  async function action(
    item: AttachmentRecord,
    operation: "open" | "delete" | "restore",
  ) {
    setBusy(item.id);
    setMessage("");
    try {
      if (operation === "open")
        await openAttachment(item.id, item.name, actor?.accessToken);
      else {
        await fileLifecycle(item.id, operation, actor?.accessToken);
        await queryClient.invalidateQueries({ queryKey: ["attachments"] });
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "File operation failed",
      );
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <section className="section-dark rounded-[2rem] p-6">
      <h2 className="text-xl font-semibold">ERP files</h2>
      <p className="mt-2 text-sm text-muted">
        Documents and meeting reports use Drive. CAD, images, exports and other
        files use private object storage.
      </p>
      {shell.data.permissions.manageOperations && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label>
            Destination task
            <select
              className="input-field"
              aria-label="Destination task"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
            >
              <option value="">
                {shell.data.globalAuthority
                  ? "Unlinked (OWNER only)"
                  : "Select a managed task"}
              </option>
              {tasks
                .filter((task) => task.permissions?.canManage)
                .map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Category
            <select
              className="input-field"
              aria-label="Category"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as AttachmentRecord["category"])
              }
            >
              {(
                [
                  "DOCUMENT",
                  "MEETING_REPORT",
                  "CAD",
                  "IMAGE",
                  "EXPORT",
                  "OTHER",
                ] as const
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            File
            <input
              className="input-field"
              type="file"
              aria-label="File"
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
          <Button
            disabled={
              !file ||
              vault.isCreating ||
              (!taskId && !shell.data.globalAuthority)
            }
            onClick={() => {
              if (file)
                vault.createAttachment(
                  { file, category, taskId: taskId || undefined },
                  {
                    onSuccess: () => {
                      setFile(undefined);
                      void vault.refetch();
                    },
                  },
                );
            }}
          >
            {vault.isCreating ? "Uploading…" : "Upload file"}
          </Button>
          <p className="text-xs text-muted">
            Default upload limit: 100 MiB. Deletion retains content for 30 days
            unless configured otherwise.
          </p>
        </div>
      )}
      {shell.data.permissions.manageOperations && (
        <label className="mt-4 flex gap-2">
          <input
            type="checkbox"
            checked={deleted}
            onChange={(e) => setDeleted(e.target.checked)}
          />
          Retained deleted files
        </label>
      )}
      {(message || vault.error) && (
        <p role="alert" className="mt-4 text-red-300">
          {message || vault.error?.message}
        </p>
      )}
      {vault.isLoading ? (
        <p role="status">Loading files…</p>
      ) : (
        !visible.length && (
          <p className="mt-4 text-muted">No files in this context.</p>
        )
      )}
      <div className="mt-4 space-y-3">
        {visible.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-steel/30 p-4"
          >
            <h3 className="break-words font-medium">{item.name}</h3>
            <p className="text-sm text-muted">
              {item.category} · {item.provider ?? "Legacy provider unverified"}{" "}
              · {Math.round(item.sizeBytes / 1024)} KB
            </p>
            <p className="text-sm text-muted">
              {item.task?.title ?? "Scoped report or OWNER-only file"} ·{" "}
              {item.uploadedBy?.name}
            </p>
            {item.provenance !== "VERIFIED" && (
              <p className="text-sm text-saffron">
                Historical metadata requires provider reconciliation.
              </p>
            )}
            {item.deletedAt && (
              <p className="text-sm text-muted">
                Deleted · retained until{" "}
                {item.purgeAfter
                  ? new Date(item.purgeAfter).toLocaleDateString()
                  : "review"}
              </p>
            )}
            <div className="mt-3 flex gap-3">
              {!item.deletedAt && item.provenance === "VERIFIED" && (
                <Button
                  disabled={busy === item.id}
                  onClick={() => void action(item, "open")}
                >
                  Open / download
                </Button>
              )}
              {item.permissions.canManage && (
                <Button
                  disabled={busy === item.id}
                  onClick={() =>
                    void action(item, item.deletedAt ? "restore" : "delete")
                  }
                >
                  {item.deletedAt ? "Restore" : "Delete"}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
