import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import { PrismaClient } from "@sourcebot/db";
import { encryptOAuthToken } from "@sourcebot/shared";

/**
 * Encrypts OAuth tokens in account data before database storage
 */
function encryptAccountTokens(account: AdapterAccount): AdapterAccount {
    return {
        ...account,
        access_token: encryptOAuthToken(account.access_token),
        refresh_token: encryptOAuthToken(account.refresh_token),
        id_token: encryptOAuthToken(account.id_token),
    };
}

/**
 * Looks a user up by email. An exact match wins; otherwise a case-insensitive match is
 * used when it is unambiguous, since users may have registered with mixed-case emails.
 */
export async function findUserByEmail(prisma: PrismaClient, email: string) {
    const exactMatch = await prisma.user.findUnique({
        where: { email },
    });
    if (exactMatch) {
        return exactMatch;
    }

    const matches = await prisma.user.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
        take: 2,
    });
    return matches.length === 1 ? matches[0] : null;
}

/**
 * Encrypted Prisma adapter that automatically encrypts OAuth tokens before storage
 */
export function EncryptedPrismaAdapter(prisma: PrismaClient): Adapter {
    const baseAdapter = PrismaAdapter(prisma);
    
    return {
        ...baseAdapter,
        async getUserByEmail(email: string) {
            return (await findUserByEmail(prisma, email)) as AdapterUser | null;
        },
        linkAccount(account: AdapterAccount) {
            return baseAdapter.linkAccount!(encryptAccountTokens(account));
        },
    };
}

/**
 * Encrypts OAuth tokens in account data (for manual account updates in signIn event)
 */
export function encryptAccountData(data: {
    access_token?: string | null;
    refresh_token?: string | null;
    id_token?: string | null;
    expires_at?: number | null;
    token_type?: string | null;
    scope?: string | null;
    issuerUrl?: string | null;
    tokenRefreshErrorMessage?: string | null;
}) {
    return {
        ...data,
        access_token: encryptOAuthToken(data.access_token),
        refresh_token: encryptOAuthToken(data.refresh_token),
        id_token: encryptOAuthToken(data.id_token),
    };
}
