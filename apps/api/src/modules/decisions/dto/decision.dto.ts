import { IsString, IsOptional, IsArray, IsEnum, IsUUID } from "class-validator";

export class CreateDecisionDto {
  @IsString()
  title!: string;

  @IsString()
  context!: string;

  @IsString()
  decision!: string;

  @IsString()
  rationale!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alternatives?: string[];

  @IsOptional()
  @IsString()
  consequences?: string;

  @IsOptional()
  @IsUUID()
  subsystemId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedTaskIds?: string[];
}

export class UpdateDecisionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  context?: string;

  @IsOptional()
  @IsString()
  decision?: string;

  @IsOptional()
  @IsString()
  rationale?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alternatives?: string[];

  @IsOptional()
  @IsString()
  consequences?: string;

  @IsOptional()
  @IsEnum(["PROPOSED", "ACCEPTED", "REJECTED", "SUPERSEDED", "DEFERRED"])
  status?: "PROPOSED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "DEFERRED";

  @IsOptional()
  @IsUUID()
  supersededById?: string;
}

export class DecisionQueryDto {
  @IsOptional()
  @IsEnum(["PROPOSED", "ACCEPTED", "REJECTED", "SUPERSEDED", "DEFERRED"])
  status?: "PROPOSED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "DEFERRED";

  @IsOptional()
  @IsUUID()
  subsystemId?: string;

  @IsOptional()
  @IsUUID()
  authorId?: string;
}