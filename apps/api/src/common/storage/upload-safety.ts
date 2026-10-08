import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { FileCategory } from "@prisma/client";
export function sanitizeFilename(name: string) {
  const safe = name
    .normalize("NFKC")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);
  return safe || "file";
}
export function contentType(value: string) {
  return /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(value)
    ? value.toLowerCase()
    : "application/octet-stream";
}
export function objectKey(category: FileCategory) {
  return `antara-v1/${category.toLowerCase()}/${randomUUID()}`;
}
export async function inspectUpload(path: string, maxBytes: number) {
  const info = await stat(path);
  if (!info.isFile() || !info.size)
    throw new BadRequestException("File content is required");
  if (info.size > maxBytes)
    throw new PayloadTooLargeException("File exceeds upload limit");
  return info.size;
}
