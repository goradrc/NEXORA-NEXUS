import { Controller, Post, Get, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthController as AuthCoreController } from '../controllers/auth.controller';

@ApiTags('Authentication')
@Controller('api/v1/auth')
export class NestAuthCorsController {
  @Post('login')
  @ApiOperation({ summary: 'Authenticate user and obtain JWT tokens' })
  @ApiResponse({ status: 200, description: 'JWT Tokens granted' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() body: { email: string; password: string }) {
    try {
      return AuthCoreController.login(body.email, body.password);
    } catch (e: any) {
      throw new UnauthorizedException(e.message);
    }
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current tenant session context' })
  @ApiResponse({ status: 200, description: 'Current tenant session context' })
  async me(@Headers('authorization') authHeader: string) {
    try {
      return AuthCoreController.getTenantContext(authHeader);
    } catch (e: any) {
      throw new UnauthorizedException(e.message);
    }
  }
}
