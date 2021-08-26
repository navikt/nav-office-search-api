import jwt from 'jsonwebtoken';
import jwks from 'jwks-rsa';

const oneHourInMs = 60 * 60 * 1000;

const jwksClient = jwks({
    jwksUri: process.env.AZURE_OPENID_CONFIG_JWKS_URI as string,
    cacheMaxAge: oneHourInMs,
});

const verifySigningKey = async (kid: string) => {
    const key = await jwksClient.getSigningKey(kid);
    return !!key.getPublicKey();
};

const decodeBase64 = (str: string) => Buffer.from(str, 'base64').toString();

export const validateAuthorizationHeader = async (
    authorizationHeader: string
) => {
    const clientSecret = process.env.AZURE_APP_CLIENT_SECRET;
    if (!clientSecret) {
        console.error('Client secret was not provided');
        return false;
    }

    const accessToken = decodeBase64(authorizationHeader);

    try {
        const decodedToken = jwt.verify(accessToken, clientSecret, {
            algorithms: ['RS256', 'RS384', 'RS512'],
            audience: process.env.AZURE_APP_CLIENT_ID,
            complete: true,
        });

        if (typeof decodedToken !== 'object') {
            return false;
        }

        const kid = decodedToken.header.kid;

        if (!kid) {
            console.error('kid header was not provided');
            return false;
        }

        if (!(await verifySigningKey(kid))) {
            console.error('No matching signing key found');
            return false;
        }

        return true;
    } catch (e) {
        console.error(`Failed to verify access token - ${e}`);
        return false;
    }
};
