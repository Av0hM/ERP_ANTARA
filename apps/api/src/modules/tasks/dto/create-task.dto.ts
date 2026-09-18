import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";
import { TaskPriority, TaskStatus } from "@antara/contracts";

export class CreateTaskDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsEnum(TaskPriority)
  priority!: TaskPriority;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsString()
  subsystemId!: string;

  @IsString()
  assignedById!: string;

  @IsString()
  @IsOptional()
  assignedToId?: string;

  @IsArray()
  @ArrayUnique()
  @IsOptional()
  tags?: string[];

  @IsArray()
  @ArrayUnique()
  @IsOptional()
  dependencyIds?: string[];

  @Type(() => Number)
  @IsNumber()
  estimatedHours!: number;

  @IsDateString()
  deadline!: string;
}

