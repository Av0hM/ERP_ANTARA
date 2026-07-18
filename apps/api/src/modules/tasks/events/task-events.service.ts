import { Injectable } from "@nestjs/common";

import { TaskCollaborationGateway } from "../gateways/task-collaboration.gateway";

@Injectable()
export class TaskEventsService {
  constructor(private readonly gateway: TaskCollaborationGateway) {}

  emitTaskUpdated(payload: unknown) {
    this.gateway.server?.emit("task.updated", payload);
  }

  emitCommentAdded(payload: unknown) {
    this.gateway.server?.emit("task.comment.added", payload);
  }

  emitPresenceSnapshot(payload: unknown) {
    this.gateway.server?.emit("presence.snapshot", payload);
  }
}

