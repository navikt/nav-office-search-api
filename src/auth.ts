import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import Cache from 'node-cache';

const jwksClientInstance = jwksClient({
    jwksUri: process.env.AZURE_OPENID_CONFIG_JWKS_URI as string,
    cacheMaxAge: 3600,
});

const verifyKid = (kid: string) => {};

export const validateAuthorizationHeader = (authorizationHeader?: string) => {
    if (!authorizationHeader) {
        console.error('Authorization header was not provided');
        return false;
    }

    const clientSecret = process.env.AZURE_APP_CLIENT_SECRET;
    if (!clientSecret) {
        console.error('Client secret not available');
        return false;
    }

    const accessToken = Buffer.from(authorizationHeader, 'base64').toString();

    try {
        const decodedToken = jwt.verify(accessToken, clientSecret, {
            algorithms: ['RS256', 'RS384', 'RS512'],
            audience: process.env.AZURE_APP_CLIENT_ID,
            complete: true,
        });

        if (typeof decodedToken !== 'object') {
            return false;
        }

        decodedToken.header.kid;
    } catch (e) {
        console.error(`Failed to verify access token - ${e}`);
        return false;
    }
};
