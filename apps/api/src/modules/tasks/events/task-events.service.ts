import { Injectable, Logger } from "@nestjs/common";
import { TaskCollaborationGateway } from "../gateways/task-collaboration.gateway";

@Injectable()
export class TaskEventsService {
  private readonly logger = new Logger(TaskEventsService.name);
  constructor(private readonly gateway: TaskCollaborationGateway) {}
  emitTaskUpdated(payload: { type: string; task: { id: string } }) {
    this.invalidate(payload.task.id);
  }
  emitCommentAdded(payload: { taskId: string }) {
    this.invalidate(payload.taskId);
  }
  private invalidate(taskId: string) {
    void this.gateway
      .invalidateTask(taskId)
      .catch(() => this.logger.warn("Task refresh delivery failed"));
  }
}
