import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { OIDCConfig } from 'next-auth/providers';
import { getCustomOidcProvider, isCustomOidcSignInAllowed } from './customOidcProvider';

const mocks = vi.hoisted(() => ({
    env: {} as Record<string, unknown>,
    existingEmails: [] as string[],
}));

vi.mock('@sourcebot/shared', () => ({
    env: mocks.env,
    createLogger: () => ({ warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/prisma', () => ({
    __unsafePrisma: {},
}));

vi.mock('@/lib/encryptedPrismaAdapter', () => ({
    findUserByEmail: vi.fn(async (_prisma: unknown, email: string) =>
        mocks.existingEmails.includes(email) ? { id: email, email } : null
    ),
}));

const setEnv = (overrides: Record<string, unknown> = {}) => {
    for (const key of Object.keys(mocks.env)) {
        delete mocks.env[key];
    }
    Object.assign(mocks.env, {
        AUTH_CUSTOM_CLIENT_ID: 'client-id',
        AUTH_CUSTOM_CLIENT_SECRET: 'client-secret',
        AUTH_CUSTOM_ISSUER: 'https://idp.example.com:443',
        AUTH_CUSTOM_NAME: 'Example SSO',
        AUTH_CUSTOM_SCOPE: 'openid email profile',
        AUTH_CUSTOM_CLIENT_AUTH_METHOD: 'client_secret_post',
        AUTH_CUSTOM_CHECKS: ['state', 'nonce'],
        AUTH_CUSTOM_FETCH_USERINFO: 'true',
        AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING: 'false',
        ...overrides,
    });
};

const getConfig = () => {
    const identityProvider = getCustomOidcProvider();
    expect(identityProvider).not.toBeNull();
    return identityProvider!.provider as OIDCConfig<Record<string, unknown>>;
};

describe('getCustomOidcProvider', () => {
    beforeEach(() => {
        setEnv();
        mocks.existingEmails = [];
    });

    test.each(['AUTH_CUSTOM_CLIENT_ID', 'AUTH_CUSTOM_CLIENT_SECRET', 'AUTH_CUSTOM_ISSUER'])('returns null when %s is not set', (key) => {
        setEnv({ [key]: undefined });
        expect(getCustomOidcProvider()).toBeNull();
    });

    test('maps the environment to an OIDC provider', () => {
        const identityProvider = getCustomOidcProvider();
        const config = getConfig();

        expect(identityProvider?.purpose).toBe('sso');
        expect(identityProvider?.issuerUrl).toBe('https://idp.example.com:443');
        expect(config).toMatchObject({
            id: 'custom',
            name: 'Example SSO',
            type: 'oidc',
            issuer: 'https://idp.example.com:443',
            clientId: 'client-id',
            clientSecret: 'client-secret',
            client: { token_endpoint_auth_method: 'client_secret_post' },
            authorization: { params: { scope: 'openid email profile' } },
            checks: ['state', 'nonce'],
            idToken: false,
            allowDangerousEmailAccountLinking: false,
        });
    });

    test('reads the profile from the id token when userinfo is not fetched', () => {
        setEnv({ AUTH_CUSTOM_FETCH_USERINFO: 'false' });
        expect(getConfig().idToken).toBe(true);
    });

    test('maps the profile to a user', async () => {
        const user = await getConfig().profile!({
            sub: 'subject',
            email: 'jane.doe@example.com',
            preferred_username: 'jdoe',
        }, {});

        expect(user).toEqual({
            id: 'subject',
            name: 'jdoe',
            email: 'jane.doe@example.com',
            image: null,
        });
    });

    describe('fallback email claim', () => {
        const profile = { sub: 'subject', email: 'Jane.Doe@example.com', preferred_username: 'jdoe@corp.example.com' };
        const resolveEmail = async (p: Record<string, unknown> = profile, tokens = {}) => (await getConfig().profile!(p, tokens)).email;

        beforeEach(() => {
            setEnv({ AUTH_CUSTOM_FALLBACK_EMAIL_CLAIM: 'preferred_username' });
        });

        test('keeps the email claim when a user matches it', async () => {
            mocks.existingEmails = ['jane.doe@example.com', 'jdoe@corp.example.com'];
            expect(await resolveEmail()).toBe('Jane.Doe@example.com');
        });

        test('uses the fallback claim when only it matches a user', async () => {
            mocks.existingEmails = ['jdoe@corp.example.com'];
            expect(await resolveEmail()).toBe('jdoe@corp.example.com');
        });

        test('keeps the email claim when no user matches', async () => {
            expect(await resolveEmail()).toBe('Jane.Doe@example.com');
        });

        test('reads the fallback claim from the id token when userinfo omits it', async () => {
            mocks.existingEmails = ['jdoe@corp.example.com'];
            const idToken = `header.${Buffer.from(JSON.stringify({ preferred_username: 'jdoe@corp.example.com' })).toString('base64url')}.signature`;
            expect(await resolveEmail({ sub: 'subject', email: 'jane.doe@example.com' }, { id_token: idToken })).toBe('jdoe@corp.example.com');
        });

        test('ignores a fallback claim that is not an email', async () => {
            mocks.existingEmails = ['jdoe'];
            expect(await resolveEmail({ ...profile, preferred_username: 'jdoe' })).toBe('Jane.Doe@example.com');
        });

        test('is disabled without the setting', async () => {
            setEnv();
            mocks.existingEmails = ['jdoe@corp.example.com'];
            expect(await resolveEmail()).toBe('Jane.Doe@example.com');
        });
    });

    test('rejects a sign-in without an email', () => {
        expect(isCustomOidcSignInAllowed({
            user: { email: undefined },
            account: { provider: 'custom', providerAccountId: 'subject', type: 'oidc' },
        })).toBe(false);
    });

    test('allows a sign-in with an email', () => {
        expect(isCustomOidcSignInAllowed({
            user: { email: 'jane.doe@example.com' },
            account: { provider: 'custom', providerAccountId: 'subject', type: 'oidc' },
        })).toBe(true);
    });

    test('ignores other providers', () => {
        expect(isCustomOidcSignInAllowed({
            user: { email: undefined },
            account: { provider: 'github', providerAccountId: 'subject', type: 'oauth' },
        })).toBe(true);
    });
});
