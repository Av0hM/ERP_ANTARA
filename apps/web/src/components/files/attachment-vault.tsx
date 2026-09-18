"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Copy, FileText, FileUp, Image as ImageIcon, Loader2, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useActorProfile } from "@/hooks/use-actor-profile";
import { useAttachmentVault, useTaskCatalog } from "@/hooks/use-operations";

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unsupported file result"));
        return;
      }
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function AttachmentVault() {
  const actor = useActorProfile();

  if (!actor) {
    return null;
  }

  const { attachments, createAttachment, isCreating } = useAttachmentVault();
  const { data: taskData = [] } = useTaskCatalog();
  const [taskId, setTaskId] = useState("");
  const [tags, setTags] = useState("drive, review");
  const [selectedName, setSelectedName] = useState("");
  const [selectedMimeType, setSelectedMimeType] = useState("application/pdf");
  const [selectedSize, setSelectedSize] = useState(0);
  const [selectedContent, setSelectedContent] = useState("");

  useEffect(() => {
    if (!taskId && taskData[0]) {
      setTaskId(taskData[0].id);
    }
  }, [taskData, taskId]);

  const selectedLabel = useMemo(() => {
    if (!selectedName) {
      return "No file selected";
    }
    return `${selectedName} - ${Math.round(selectedSize / 1024)} KB`;
  }, [selectedName, selectedSize]);

  const resetSelection = () => {
    setSelectedName("");
    setSelectedMimeType("application/pdf");
    setSelectedSize(0);
    setSelectedContent("");
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSelectedName(file.name);
    setSelectedMimeType(file.type || "application/octet-stream");
    setSelectedSize(file.size);
    setSelectedContent(await toBase64(file));
  };

  const handleUpload = () => {
    if (!selectedName || !selectedContent) {
      return;
    }

    createAttachment({
      name: selectedName,
      mimeType: selectedMimeType,
      sizeBytes: selectedSize,
      taskId: taskId.trim() || undefined,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      contentBase64: selectedContent,
    }, {
      onSuccess: () => resetSelection(),
    });
  };

  const fileIcon =
    selectedMimeType === "application/pdf" ? (
      <FileText className="size-4 text-red-300" />
    ) : selectedMimeType.startsWith("image/") ? (
      <ImageIcon className="size-4 text-cobalt" />
    ) : (
      <Paperclip className="size-4 text-muted" />
    );

  return (
    <div className="glass-panel rounded-[2rem] p-6">
      <div className="flex items-center gap-3">
        <Paperclip className="size-5 text-accent" />
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent">Attachments</p>
          <h2 className="text-xl font-semibold">Drive-backed file vault</h2>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-muted">Link to task</span>
            <select
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-sm outline-none"
            >
              <option value="" disabled>
                Select a task (optional)...
              </option>
              {taskData.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-muted">Tags</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-sm outline-none"
              placeholder="CAD, review, thermal"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-muted">File</span>
            <input
              type="file"
              onChange={handleFile}
              className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-sm outline-none file:mr-4 file:rounded-full file:border-0 file:bg-accent/10 file:px-4 file:py-2 file:text-accent"
            />
          </label>

          <div className="rounded-2xl border border-line bg-white/5 p-4 text-sm text-muted">
            <div className="flex items-center gap-2">
              {fileIcon}
              <p className="font-medium text-text">Selected file</p>
            </div>
            <p className="mt-1">{selectedLabel}</p>
          </div>

          <Button className="w-full gap-2" onClick={handleUpload} disabled={isCreating || !selectedContent}>
            {isCreating ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            {isCreating ? "Uploading..." : "Upload Attachment"}
          </Button>

          <p className="text-xs text-muted">
            Uploaded by <span className="text-accent">{actor.name}</span>. If Google Drive credentials are present, the file is mirrored there automatically.
          </p>
        </div>

        <div className="space-y-3">
          {attachments.map((item) => (
            <article key={item.id} className="rounded-2xl border border-line bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {item.mimeType === "application/pdf" ? (
                    <FileText className="mt-1 size-4 text-red-300" />
                  ) : item.mimeType.startsWith("image/") ? (
                    <ImageIcon className="mt-1 size-4 text-cobalt" />
                  ) : (
                    <Paperclip className="mt-1 size-4 text-muted" />
                  )}
                  <div>
                  <h3 className="font-medium">{item.name}</h3>
                  <p className="mt-1 text-xs text-muted">{item.mimeType}</p>
                </div>
                </div>
                <span className="text-xs text-accent">{Math.round(item.sizeBytes / 1024)} KB</span>
              </div>
              <p className="mt-3 text-sm text-muted">
                {item.task?.title ? `Linked to ${item.task.title}` : "Not linked to a task yet"}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs text-muted">
                <span>{item.uploadedBy?.name ?? "Mission Member"}</span>
                {item.storageUrl.startsWith("http") ? (
                  <a className="text-accent" href={item.storageUrl} target="_blank" rel="noreferrer">
                    Open file
                  </a>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-accent"
                    onClick={() => void navigator.clipboard.writeText(item.storageUrl)}
                  >
                    <Copy className="size-3" />
                    Copy path
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}


