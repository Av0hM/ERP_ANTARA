import {
  IsArray,
  IsIn,
  ArrayMaxSize,
  ArrayUnique,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { MembershipGrantDto } from "../invitations/invitations.dto";
export class UpdateAccessDto {
  @IsIn(["MEMBER", "OWNER"]) globalRole!: "MEMBER" | "OWNER";
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique((grant: MembershipGrantDto) => grant?.subsystemId)
  @ValidateNested({ each: true })
  @Type(() => MembershipGrantDto)
  memberships!: MembershipGrantDto[];
}
