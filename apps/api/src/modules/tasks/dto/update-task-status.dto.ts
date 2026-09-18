import { IsEnum } from "class-validator";
import { TaskStatus } from "@antara/contracts";

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}


