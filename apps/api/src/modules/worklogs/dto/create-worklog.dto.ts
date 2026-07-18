import { IsDateString, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateWorklogDto {
  @IsString()
  userId!: string;

  @IsString()
  taskId!: string;

  @IsDateString()
  startedAt!: string;

  @IsDateString()
  @IsOptional()
  endedAt?: string;

  @IsInt()
  @Min(1)
  durationMin!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

