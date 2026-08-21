import { Controller, Get, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from './entities/user.entity';

@Controller(['v1/users', 'api/v1/users'])
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id/reputation')
  getReputation(@Param('id') id: string) {
    return this.usersService.getReputation(id);
  }

  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateRole(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @Request() req: any,
  ) {
    const changedBy = req.user?.sub || req.user?.id;
    return this.usersService.updateRole(id, updateRoleDto.role, changedBy);
  }

  @Get('role-audit-log')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getRoleAuditLog() {
    return this.usersService.getRoleAuditLog();
  }
}
