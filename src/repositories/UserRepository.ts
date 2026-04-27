import { PrismaClient, User } from '@prisma/client';

export type CreateUserParams = {
  email: string;
  passwordHash: string;
};

export type UpdateUserParams = {
  email?: string;
  passwordHash?: string;
};

export class UserRepository {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? new PrismaClient();
  }

  async createUser(params: CreateUserParams): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: params.email,
        passwordHash: params.passwordHash,
      },
    });
  }

  async getUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async updateUser(id: string, params: UpdateUserParams): Promise<User | null> {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(params.email !== undefined ? { email: params.email } : {}),
        ...(params.passwordHash !== undefined ? { passwordHash: params.passwordHash } : {}),
      },
    });
  }

  async deleteUser(id: string): Promise<User | null> {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async listUsers(): Promise<User[]> {
    return this.prisma.user.findMany();
  }
}