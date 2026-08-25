import { IsEnum } from 'class-validator';
import { Role } from '../entities/user.entity';

export class UpdateRoleDto {
  @IsEnum(Role, { message: `role must be one of: ${Object.values(Role).join(', ')}` })
  role: Role;
}
