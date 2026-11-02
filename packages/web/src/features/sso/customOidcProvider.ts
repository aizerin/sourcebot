import type { IdentityProvider } from "@/auth";
import { CUSTOM_OIDC_PROVIDER_ID } from "@/lib/constants";
import { findUserByEmail } from "@/lib/encryptedPrismaAdapter";
import { __unsafePrisma } from "@/prisma";
import { createLogger, env } from "@sourcebot/shared";
import type { Account, User } from "next-auth";
import type { OIDCConfig } from "next-auth/providers";

const logger = createLogger('web-custom-oidc');

interface CustomOidcProfile extends Record<string, unknown> {
    sub: string;
    email?: string;
    name?: string;
    preferred_username?: string;
    picture?: string;
}

export const getCustomOidcProvider = (): IdentityProvider | null => {
    const clientId = env.AUTH_CUSTOM_CLIENT_ID;
    const clientSecret = env.AUTH_CUSTOM_CLIENT_SECRET;
    const issuer = env.AUTH_CUSTOM_ISSUER;
    if (!clientId || !clientSecret || !issuer) {
        return null;
    }

    const provider: OIDCConfig<CustomOidcProfile> = {
        id: CUSTOM_OIDC_PROVIDER_ID,
        name: env.AUTH_CUSTOM_NAME,
        type: "oidc",
        issuer,
        clientId,
        clientSecret,
        client: {
            token_endpoint_auth_method: env.AUTH_CUSTOM_CLIENT_AUTH_METHOD,
        },
        authorization: {
            params: {
                scope: env.AUTH_CUSTOM_SCOPE,
            },
        },
        checks: env.AUTH_CUSTOM_CHECKS,
        // Auth.js validates the id token either way; `idToken: false` additionally reads the profile from the userinfo endpoint.
        idToken: env.AUTH_CUSTOM_FETCH_USERINFO !== 'true',
        async profile(profile, tokens) {
            return {
                id: profile.sub,
                name: profile.name ?? profile.preferred_username ?? profile.email,
                email: await resolveEmail(profile, tokens.id_token),
                image: profile.picture ?? null,
            };
        },
        allowDangerousEmailAccountLinking: env.AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING === 'true',
    };

    return {
        provider,
        purpose: "sso",
        issuerUrl: issuer.replace(/\/+$/, ''),
    };
}

// Users who registered before SSO may have used another address the identity provider
// knows them by (e.g. their domain login in `preferred_username`). Signing them in under
// that address lets account linking attach SSO to their existing user.
const resolveEmail = async (profile: CustomOidcProfile, idToken?: string) => {
    const claim = env.AUTH_CUSTOM_FALLBACK_EMAIL_CLAIM;
    if (!claim) {
        return profile.email;
    }

    // The userinfo response may omit claims that the id token carries; Auth.js has already validated the id token.
    const idTokenClaims = idToken ? JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()) : {};
    const fallbackEmail = profile[claim] ?? idTokenClaims[claim];
    if (typeof fallbackEmail !== 'string' || !fallbackEmail.includes('@')) {
        return profile.email;
    }

    // Auth.js lowercases the email before looking the user up.
    if (profile.email && await findUserByEmail(__unsafePrisma, profile.email.toLowerCase())) {
        return profile.email;
    }

    if (await findUserByEmail(__unsafePrisma, fallbackEmail.toLowerCase())) {
        logger.info(`Signing ${profile.sub} in with ${claim} because no user matches the email claim.`);
        return fallbackEmail;
    }

    return profile.email;
}

// Rejecting here instead of throwing in `profile` sends the user to the AccessDenied page
// before any user is created; a throwing `profile` redirects to a broken URL.
export const isCustomOidcSignInAllowed = ({ user, account }: { user: User, account?: Account | null }) => {
    if (account?.provider !== CUSTOM_OIDC_PROVIDER_ID || user.email) {
        return true;
    }

    logger.warn(`${env.AUTH_CUSTOM_NAME} did not return an email address for subject ${account.providerAccountId}. Sign-in rejected.`);
    return false;
}
