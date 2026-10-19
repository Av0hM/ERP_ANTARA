"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { TaskPriority } from "@antara/contracts";

import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { OperationFeedback } from "@/components/ui/operation-feedback";
import { classifyError, UxRequestError, uxError } from "@/lib/ux-error";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Button } from "@/components/ui/button";
import { useMemberCatalog, useSubsystemCatalog } from "@/hooks/use-operations";
import { CreateTaskInput, TaskRecord } from "@/lib/task-types";

const priorities = [
  TaskPriority.LOW,
  TaskPriority.MEDIUM,
  TaskPriority.HIGH,
  TaskPriority.CRITICAL,
];

type CreateTaskDialogProps = {
  onCreate: (input: CreateTaskInput) => Promise<unknown>;
  isCreating: boolean;
};

export function CreateTaskDialog({
  onCreate,
  isCreating,
}: CreateTaskDialogProps) {
  const { data: readableSubsystems = [] } = useSubsystemCatalog();
  const subsystemData = readableSubsystems.filter(
    (subsystem) => subsystem.canManage,
  );
  const { data: memberData = [] } = useMemberCatalog();
  const [open, setOpen] = useState(false);
  const submitting = useRef(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.HIGH);
  const [subsystem, setSubsystem] =
    useState<TaskRecord["subsystem"]>("Software");
  const [assignedToId, setAssignedToId] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("6");
  const [deadline, setDeadline] = useState("");
  const [tags, setTags] = useState("");
  const [discard, setDiscard] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const fieldErrors = saveError ? classifyError(saveError).fields : {};
  const dirty = !!(
    title ||
    description ||
    tags ||
    deadline ||
    assignedToId ||
    estimatedHours !== "6" ||
    priority !== TaskPriority.HIGH
  );
  useUnsavedChanges(open && dirty);
  const close = () => {
    if (!isCreating && !submitting.current) {
      if (dirty) setDiscard(true);
      else setOpen(false);
    }
  };

  useEffect(() => {
    if (subsystemData[0] && subsystem === "Software") {
      setSubsystem(subsystemData[0].name as TaskRecord["subsystem"]);
    }
  }, [subsystem, subsystemData]);

  const submit = async () => {
    if (isCreating || submitting.current) return;
    submitting.current = true;
    setSaveError(null);
    const selectedSubsystem = subsystemData.find(
      (entry) => entry.name === subsystem,
    );
    if (
      !title.trim() ||
      !description.trim() ||
      !deadline ||
      !selectedSubsystem
    ) {
      const fields: Record<string, string> = {};
      if (!title.trim()) fields.title = "Enter a task title.";
      if (!description.trim()) fields.description = "Enter a description.";
      if (!deadline) fields.deadline = "Choose a deadline.";
      if (!selectedSubsystem)
        fields.subsystemId = "Choose an available subsystem.";
      submitting.current = false;
      setSaveError(new UxRequestError(uxError("VALIDATION_ERROR", fields)));
      return;
    }

    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        priority,
        subsystem,
        subsystemId: selectedSubsystem.id,
        estimatedHours: Number(estimatedHours),
        deadline,
        ...(assignedToId ? { assignedToId } : {}),
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
    } catch (error) {
      setSaveError(error);
      // Retain the dialog and entered values.
      return;
    } finally {
      submitting.current = false;
    }

    setTitle("");
    setDescription("");
    setPriority(TaskPriority.HIGH);
    setSubsystem("Software");
    setAssignedToId("");
    setEstimatedHours("6");
    setDeadline("");
    setTags("");
    setOpen(false);
  };

  if (!subsystemData.length) return null;

  return (
    <>
      <ConfirmAction
        open={discard}
        title="You have unsaved changes"
        description="Discard this task draft? Nothing has been submitted by closing this dialog."
        confirmLabel="Discard changes"
        onCancel={() => setDiscard(false)}
        onConfirm={() => {
          setTitle("");
          setDescription("");
          setTags("");
          setDeadline("");
          setAssignedToId("");
          setEstimatedHours("6");
          setPriority(TaskPriority.HIGH);
          setDiscard(false);
          setSaveError(null);
          setOpen(false);
        }}
      />
      <Button className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create Task
      </Button>

      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Content
            aria-describedby={undefined}
            aria-label="Create task"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          >
            <Dialog.Title className="sr-only">Create task</Dialog.Title>
            <div className="glass-modal w-full max-w-2xl rounded-[2rem] p-0 max-h-[90vh] overflow-y-auto">
              <div className="section-light grid-texture-light rounded-[2rem] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-saffron">
                      New Mission Task
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-admin-ink">
                      Create a subsystem work item
                    </h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    surface="light"
                    onClick={close}
                    aria-label="Close create task"
                    disabled={isCreating}
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <OperationFeedback
                  state={isCreating ? "saving" : saveError ? "error" : "idle"}
                  error={saveError}
                  preserved={!!saveError}
                  page="Tasks"
                />
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label htmlFor="task-title" className="label-field-light">
                      Title
                    </label>
                    {fieldErrors.title && (
                      <p id="task-title-error" className="text-sm text-danger">
                        {fieldErrors.title}
                      </p>
                    )}
                    <input
                      id="task-title"
                      aria-invalid={!!fieldErrors.title}
                      aria-describedby={
                        fieldErrors.title ? "task-title-error" : undefined
                      }
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="input-field-light"
                      placeholder="Telemetry integration validation"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label
                      htmlFor="task-description"
                      className="label-field-light"
                    >
                      Description
                    </label>
                    {fieldErrors.description && (
                      <p
                        id="task-description-error"
                        className="text-sm text-danger"
                      >
                        {fieldErrors.description}
                      </p>
                    )}
                    <textarea
                      id="task-description"
                      aria-invalid={!!fieldErrors.description}
                      aria-describedby={
                        fieldErrors.description
                          ? "task-description-error"
                          : undefined
                      }
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={4}
                      className="input-field-light resize-none"
                      placeholder="Describe dependencies, objectives, and review criteria..."
                    />
                  </div>
                  <div>
                    <label className="label-field-light">Priority</label>
                    <select
                      value={priority}
                      onChange={(event) =>
                        setPriority(event.target.value as TaskPriority)
                      }
                      className="select-field-light"
                    >
                      {priorities.map((option) => (
                        <option
                          key={option}
                          value={option}
                          className="bg-paper-highlight text-admin-ink"
                        >
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-field-light">Subsystem</label>
                    <select
                      value={subsystem}
                      onChange={(event) =>
                        setSubsystem(
                          event.target.value as TaskRecord["subsystem"],
                        )
                      }
                      className="select-field-light"
                    >
                      {subsystemData.map((option) => (
                        <option
                          key={option.id}
                          value={option.name}
                          className="bg-paper-highlight text-admin-ink"
                        >
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-field-light">Assign To</label>
                    <select
                      value={assignedToId}
                      onChange={(event) => setAssignedToId(event.target.value)}
                      className="select-field-light"
                    >
                      <option
                        value=""
                        className="bg-paper-highlight text-admin-ink"
                      >
                        Unassigned
                      </option>
                      {memberData.map((member) => (
                        <option
                          key={member.id}
                          value={member.id}
                          className="bg-paper-highlight text-admin-ink"
                        >
                          {member.name} ({member.subsystem?.name ?? member.role}
                          )
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-field-light">Estimated Hours</label>
                    <input
                      type="number"
                      min="1"
                      value={estimatedHours}
                      onChange={(event) =>
                        setEstimatedHours(event.target.value)
                      }
                      className="input-field-light"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="task-deadline"
                      className="label-field-light"
                    >
                      Deadline
                    </label>
                    {fieldErrors.deadline && (
                      <p
                        id="task-deadline-error"
                        className="text-sm text-danger"
                      >
                        {fieldErrors.deadline}
                      </p>
                    )}
                    <input
                      type="date"
                      id="task-deadline"
                      aria-invalid={!!fieldErrors.deadline}
                      aria-describedby={
                        fieldErrors.deadline ? "task-deadline-error" : undefined
                      }
                      value={deadline}
                      onChange={(event) => setDeadline(event.target.value)}
                      className="input-field-light"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label-field-light">Tags</label>
                    <input
                      value={tags}
                      onChange={(event) => setTags(event.target.value)}
                      className="input-field-light"
                      placeholder="e.g. integration, firmware, review"
                    />
                    <p className="mt-1 text-xs text-secondary-ink">
                      Separate multiple tags with commas
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    surface="light"
                    onClick={close}
                    disabled={isCreating}
                  >
                    Cancel
                  </Button>
                  <Button onClick={submit} disabled={isCreating}>
                    {isCreating ? "Creating..." : "Create Task"}
                  </Button>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
