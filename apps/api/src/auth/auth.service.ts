import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { UsersService } from '../users/users.service';

export type AuthUserView = Pick<User, 'id' | 'email' | 'name' | 'createdAt'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(
    email: string,
    password: string,
    name?: string,
  ): Promise<{ accessToken: string; user: AuthUserView }> {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.users.create({ email, passwordHash, name });
    const accessToken = await this.signAccessToken(user.id);
    return { accessToken, user: this.toView(user) };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; user: AuthUserView }> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const accessToken = await this.signAccessToken(user.id);
    return { accessToken, user: this.toView(user) };
  }

  private signAccessToken(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId });
  }

  private toView(user: User): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }
}
