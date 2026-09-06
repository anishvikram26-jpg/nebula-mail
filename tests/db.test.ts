import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/db/prisma';

describe('Prisma Client Helper', () => {
  it('should export an initialized PrismaClient instance', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.user.findMany).toBe('function');
    expect(typeof prisma.account.findMany).toBe('function');
    expect(typeof prisma.thread.findMany).toBe('function');
    expect(typeof prisma.email.findMany).toBe('function');
    expect(typeof prisma.syncState.findMany).toBe('function');
  });
});
