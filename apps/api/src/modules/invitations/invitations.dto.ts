import { Type } from "class-transformer";
import {
  IsIn,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  ValidateNested,
} from "class-validator";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
export class MembershipGrantDto {
  @IsString() @MinLength(1) subsystemId!: string;
  @IsIn(["MEMBER", "ADMIN"]) accessLevel!: "MEMBER" | "ADMIN";
}
export class CreateInvitationDto {
  @IsEmail() email!: string;
  @IsIn(["MEMBER", "OWNER"]) globalRole!: "MEMBER" | "OWNER";
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique((grant: MembershipGrantDto) => grant?.subsystemId)
  @ValidateNested({ each: true })
  @Type(() => MembershipGrantDto)
  memberships!: MembershipGrantDto[];
}
export class AcceptInvitationDto {
  @IsString() @MinLength(1) @MaxLength(128) token!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
}

export class AcceptExistingInvitationDto {
  @IsString() @MinLength(1) @MaxLength(128) token!: string;
}
