import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { Role } from '../users/entities/user.entity';

/** Hierarchy: admin > moderator > user. Higher roles inherit lower privileges. */
const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.USER]: 0,
  [Role.MODERATOR]: 1,
  [Role.ADMIN]: 2,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException(
        `Insufficient permissions. Required role: ${requiredRoles.join(' or ')}`,
      );
    }

    const userLevel = ROLE_HIERARCHY[user.role as Role] ?? -1;
    const hasRole = requiredRoles.some(
      (role) => userLevel >= ROLE_HIERARCHY[role],
    );

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required role: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
