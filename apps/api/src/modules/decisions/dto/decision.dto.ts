import { DecisionScope, DecisionAuthority } from "@prisma/client";
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  MinLength,
} from "class-validator";

export class CreateDecisionDto {
  @IsOptional()
  @IsEnum(DecisionScope)
  scope?: DecisionScope;

  @IsOptional()
  @IsEnum(DecisionAuthority)
  authority?: DecisionAuthority;

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
  @IsString()
  @MinLength(1)
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
  @IsString()
  @MinLength(1)
  supersededById?: string;
}

export class DecisionQueryDto {
  @IsOptional()
  @IsEnum(["PROPOSED", "ACCEPTED", "REJECTED", "SUPERSEDED", "DEFERRED"])
  status?: "PROPOSED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "DEFERRED";

  @IsOptional()
  @IsString()
  @MinLength(1)
  subsystemId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  authorId?: string;
}
