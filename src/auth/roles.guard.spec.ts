import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../users/entities/user.entity';

function createMockContext(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createMockContext({ id: 'u1', role: Role.USER });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows a user with the exact required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MODERATOR]);
    const ctx = createMockContext({ id: 'u1', role: Role.MODERATOR });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows admin access to moderator-protected routes (hierarchy)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MODERATOR]);
    const ctx = createMockContext({ id: 'u1', role: Role.ADMIN });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows admin access to admin-protected routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = createMockContext({ id: 'u1', role: Role.ADMIN });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects a regular user on moderator-protected routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MODERATOR]);
    const ctx = createMockContext({ id: 'u1', role: Role.USER });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a moderator on admin-protected routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = createMockContext({ id: 'u1', role: Role.MODERATOR });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects requests with no user object', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = createMockContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects requests where user has no role field', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = createMockContext({ id: 'u1' });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('includes required role in the error message', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = createMockContext({ id: 'u1', role: Role.USER });

    try {
      guard.canActivate(ctx);
      fail('Expected ForbiddenException');
    } catch (e) {
      expect(e.message).toContain('admin');
    }
  });
});
