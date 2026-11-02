import { describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@sourcebot/db';
import { findUserByEmail } from './encryptedPrismaAdapter';

vi.mock('@sourcebot/shared', () => ({
    encryptOAuthToken: (token: string) => token,
}));

const createPrisma = (emails: string[]) => ({
    user: {
        findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
            emails.includes(where.email) ? { id: where.email, email: where.email } : null
        ),
        findMany: vi.fn(async ({ where }: { where: { email: { equals: string } } }) =>
            emails
                .filter((email) => email.toLowerCase() === where.email.equals.toLowerCase())
                .map((email) => ({ id: email, email }))
        ),
    },
}) as unknown as PrismaClient;

describe('findUserByEmail', () => {
    test('prefers an exact match', async () => {
        const user = await findUserByEmail(createPrisma(['Jane.Doe@example.com', 'jane.doe@example.com']), 'jane.doe@example.com');
        expect(user?.email).toBe('jane.doe@example.com');
    });

    test('falls back to a case-insensitive match', async () => {
        const user = await findUserByEmail(createPrisma(['Jane.Doe@example.com']), 'jane.doe@example.com');
        expect(user?.email).toBe('Jane.Doe@example.com');
    });

    test('returns null for an ambiguous case-insensitive match', async () => {
        const user = await findUserByEmail(createPrisma(['Jane.Doe@example.com', 'JANE.DOE@example.com']), 'jane.doe@example.com');
        expect(user).toBeNull();
    });

    test('returns null when nothing matches', async () => {
        expect(await findUserByEmail(createPrisma([]), 'jane.doe@example.com')).toBeNull();
    });
});
