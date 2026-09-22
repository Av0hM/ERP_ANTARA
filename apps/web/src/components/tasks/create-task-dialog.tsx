"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { TaskPriority } from "@antara/contracts";

import { Button } from "@/components/ui/button";
import { useMemberCatalog, useSubsystemCatalog } from "@/hooks/use-operations";
import { CreateTaskInput, TaskRecord } from "@/lib/task-types";

const priorities = [TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH, TaskPriority.CRITICAL];

type CreateTaskDialogProps = {
  onCreate: (input: CreateTaskInput) => void;
  isCreating: boolean;
};

export function CreateTaskDialog({ onCreate, isCreating }: CreateTaskDialogProps) {
  const { data: subsystemData = [] } = useSubsystemCatalog();
  const { data: memberData = [] } = useMemberCatalog();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.HIGH);
  const [subsystem, setSubsystem] = useState<TaskRecord["subsystem"]>("Software");
  const [assignedToId, setAssignedToId] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("6");
  const [deadline, setDeadline] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (subsystemData[0] && subsystem === "Software") {
      setSubsystem(subsystemData[0].name as TaskRecord["subsystem"]);
    }
  }, [subsystem, subsystemData]);

  const submit = () => {
    if (!title.trim() || !description.trim() || !deadline) {
      return;
    }

    onCreate({
      title: title.trim(),
      description: description.trim(),
      priority,
      subsystem,
      estimatedHours: Number(estimatedHours),
      deadline,
      ...(assignedToId ? { assignedToId } : {}),
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });

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

  return (
    <>
      <Button className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create Task
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="glass-modal w-full max-w-2xl rounded-[2rem] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-saffron">New Mission Task</p>
                <h2 className="mt-2 text-2xl font-semibold">Create a subsystem work item</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="label-field">Title</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="input-field"
                  placeholder="Telemetry integration validation"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label-field">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  className="input-field resize-none"
                  placeholder="Describe dependencies, objectives, and review criteria..."
                />
              </div>
              <div>
                <label className="label-field">Priority</label>
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as TaskPriority)}
                  className="select-field"
                >
                  {priorities.map((option) => (
                    <option key={option} value={option} className="bg-panel text-text">
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field">Subsystem</label>
                <select
                  value={subsystem}
                  onChange={(event) => setSubsystem(event.target.value as TaskRecord["subsystem"])}
                  className="select-field"
                >
                  {subsystemData.map((option) => (
                    <option key={option.id} value={option.name} className="bg-panel text-text">
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field">Assign To</label>
                <select
                  value={assignedToId}
                  onChange={(event) => setAssignedToId(event.target.value)}
                  className="select-field"
                >
                  <option value="">Unassigned</option>
                  {memberData.map((member) => (
                    <option key={member.id} value={member.id} className="bg-panel text-text">
                      {member.name} ({member.subsystem?.name ?? member.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field">Estimated Hours</label>
                <input
                  type="number"
                  min="1"
                  value={estimatedHours}
                  onChange={(event) => setEstimatedHours(event.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-field">Deadline</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  className="input-field"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label-field">Tags</label>
                <input
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  className="input-field"
                  placeholder="e.g. integration, firmware, review"
                />
                <p className="mt-1 text-xs text-muted">Separate multiple tags with commas</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Task"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}