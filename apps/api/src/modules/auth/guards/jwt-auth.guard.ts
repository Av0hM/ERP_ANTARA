import { ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { limitVerifiedApplicationRequest } from "../../../common/middleware/rate-limiting.middleware";

export class JwtAuthGuard extends AuthGuard("jwt") {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user: { id: string } }>();
    let allowed: boolean;
    try {
      allowed = (await super.canActivate(context)) as boolean;
    } catch (error) {
      // Failed credentials never create an account bucket. Authentication still denies.
      limitVerifiedApplicationRequest(req);
      throw error;
    }
    limitVerifiedApplicationRequest(req, allowed ? req.user.id : undefined);
    return allowed;
  }
}
