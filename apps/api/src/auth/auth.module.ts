import { Body, Controller, Get, Injectable, Module, Post, Req, UseGuards, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/database.service';
import { DatabaseModule } from '../database/database.module';
import { AuthService } from '../../../../packages/core/src/auth/auth.service';
import { SalesAuthGuard } from '../modules/nexus/delivery-notes/sales-auth.guard';

@Injectable()
export class SessionService {
  constructor(private readonly db: PrismaService) {}

  async session(userId: string, organizationId?: string) {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured');
    const memberships = await this.db.organizationUser.findMany({
      where: { userId, status: 'ACTIVE', user: { isActive: true } },
      include: { user: true, organization: true, role: { include: { rolePermissions: { include: { permission: true } } } } },
      orderBy: { organizationId: 'asc' },
    });
    const valid = memberships.filter(m => m.role.organizationId === null || m.role.organizationId === m.organizationId);
    const member = organizationId ? valid.find(m => m.organizationId === organizationId) : valid[0];
    if (!member) throw new UnauthorizedException('Session unavailable');
    const user = { userId, email: member.user.email, organizationId: member.organizationId,
      permissions: member.role.rolePermissions.map(p => p.permission.code) };
    return { accessToken: AuthService.generateTokens({ userId, email: user.email, organizationId: member.organizationId }).accessToken, user,
      activeOrganization: { id: member.organizationId, name: member.organization.name },
      organizations: valid.map(m => ({ id: m.organizationId, name: m.organization.name })) };
  }

  async login(body: any) {
    if (typeof body?.email !== 'string' || body.email.length > 254 ||
        typeof body?.password !== 'string' || !body.password || body.password.length > 1024) {
      throw new BadRequestException('Invalid credentials');
    }
    const user = await this.db.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    let verified = false;
    try { verified = AuthService.verifyPassword(body.password, user?.passwordHash ?? '210000:00000000000000000000000000000000:' + '0'.repeat(128)); } catch { /* Invalid stored credentials are rejected. */ }
    if (!user?.isActive || !verified) throw new UnauthorizedException('Invalid credentials');
    return this.session(user.id);
  }
}

@Controller('auth')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}
  @Post('login')
  login(@Body() body: unknown) { return this.sessions.login(body); }
  @Get('me')
  @UseGuards(SalesAuthGuard)
  me(@Req() req: any) { return this.sessions.session(req.tenantContext.userId, req.tenantContext.organizationId); }
  @Post('switch-organization')
  @UseGuards(SalesAuthGuard)
  async switchOrganization(@Req() req: any, @Body() body: any) {
    if (typeof body?.organizationId !== 'string' || !body.organizationId) throw new BadRequestException('Organization required');
    await this.sessions.session(req.tenantContext.userId, req.tenantContext.organizationId);
    return this.sessions.session(req.tenantContext.userId, body.organizationId);
  }
}

@Module({ imports: [DatabaseModule], controllers: [SessionController], providers: [SessionService, SalesAuthGuard] })
export class SessionModule {}
