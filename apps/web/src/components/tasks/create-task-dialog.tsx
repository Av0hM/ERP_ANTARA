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
          <div className="glass-modal w-full max-w-2xl rounded-[2rem] p-0 max-h-[90vh] overflow-y-auto">
            <div className="section-light grid-texture-light rounded-[2rem] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-saffron">New Mission Task</p>
                  <h2 className="mt-2 text-2xl font-semibold text-admin-ink">Create a subsystem work item</h2>
                </div>
                <Button variant="ghost" size="sm" surface="light" onClick={() => setOpen(false)}>
                  <X className="size-4" />
                </Button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="label-field-light">Title</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="input-field-light"
                    placeholder="Telemetry integration validation"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label-field-light">Description</label>
                  <textarea
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
                    onChange={(event) => setPriority(event.target.value as TaskPriority)}
                    className="select-field-light"
                  >
                    {priorities.map((option) => (
                      <option key={option} value={option} className="bg-paper-highlight text-admin-ink">
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-field-light">Subsystem</label>
                  <select
                    value={subsystem}
                    onChange={(event) => setSubsystem(event.target.value as TaskRecord["subsystem"])}
                    className="select-field-light"
                  >
                    {subsystemData.map((option) => (
                      <option key={option.id} value={option.name} className="bg-paper-highlight text-admin-ink">
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
                    <option value="" className="bg-paper-highlight text-admin-ink">Unassigned</option>
                    {memberData.map((member) => (
                      <option key={member.id} value={member.id} className="bg-paper-highlight text-admin-ink">
                        {member.name} ({member.subsystem?.name ?? member.role})
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
                    onChange={(event) => setEstimatedHours(event.target.value)}
                    className="input-field-light"
                  />
                </div>
                <div>
                  <label className="label-field-light">Deadline</label>
                  <input
                    type="date"
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
                  <p className="mt-1 text-xs text-secondary-ink">Separate multiple tags with commas</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button variant="secondary" surface="light" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create Task"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}