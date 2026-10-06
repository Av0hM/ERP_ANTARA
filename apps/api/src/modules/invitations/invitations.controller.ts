import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  CreateInvitationDto,
  AcceptInvitationDto,
  AcceptExistingInvitationDto,
} from "./invitations.dto";
import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { InvitationsService } from "./invitations.service";

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string; role: string };
}

// InvitationsController intentionally does NOT use a class-level guard:
// - create, list, revoke require an authenticated OWNER/ADMIN (guarded per-method below)
// - accept and validate/:token are public — a brand-new invitee has no JWT yet,
//   and is authenticated by possession of the invitation token itself
@Controller("invitations")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN")
  async create(
    @Body() body: CreateInvitationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invitationsService.createInvitation(
      body.email,
      body.role,
      body.subsystemId,
      req.user.id,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN")
  async listPending(@Req() req: AuthenticatedRequest) {
    return this.invitationsService.listPendingInvitations(req.user.id);
  }

  @Post(":id/revoke")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN")
  async revoke(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.invitationsService.revokeInvitation(id, req.user.id);
  }

  @Post("accept")
  async accept(@Body() body: AcceptInvitationDto) {
    return this.invitationsService.acceptInvitation(
      body.token,
      body.password,
      body.name,
    );
  }

  @Post("accept-existing")
  @UseGuards(JwtAuthGuard)
  acceptExisting(
    @Body() body: AcceptExistingInvitationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invitationsService.acceptForAccount(body.token, req.user.id);
  }

  @Get("validate/:token")
  async validate(@Param("token") token: string) {
    const result = await this.invitationsService.validateToken(token);
    return { valid: !!result, ...result };
  }
}
