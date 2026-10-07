import { IsString } from "class-validator";

export class CreateTaskCommentDto {
  @IsString()
  content!: string;
}
