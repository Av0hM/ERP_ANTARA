import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { Role } from "@prisma/client";
export class CreateInvitationDto {
  @IsEmail() email!: string;
  @IsEnum(Role) role!: Role;
  @IsOptional() @IsString() @MinLength(1) subsystemId?: string;
}
export class AcceptInvitationDto {
  @IsString() @MinLength(1) @MaxLength(128) token!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
}

export class AcceptExistingInvitationDto {
  @IsString() @MinLength(1) @MaxLength(128) token!: string;
}
