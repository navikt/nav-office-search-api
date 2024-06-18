import jwt, { GetPublicKeyOrSecret, VerifyCallback } from 'jsonwebtoken';
import jwks from 'jwks-rsa';
import { Request, Response } from 'express';

const bearerPrefix = 'Bearer';

const jwksClient = jwks({
    jwksUri: process.env.AZURE_OPENID_CONFIG_JWKS_URI,
    cache: true,
    cacheMaxAge: 3600 * 1000,
});

const getSigningKey: GetPublicKeyOrSecret = async (header, callback) => {
    try {
        const key = await jwksClient.getSigningKey(header.kid);
        callback(null, key.getPublicKey());
    } catch (e) {
        console.error(`Failed to get signing key - ${e}`);
        callback(e as Error, undefined);
    }
};

const validateAccessToken = (accessToken: string, callback: VerifyCallback) => {
    jwt.verify(
        accessToken,
        getSigningKey,
        {
            algorithms: ['RS256', 'RS384', 'RS512'],
            audience: process.env.AZURE_APP_CLIENT_ID,
        },
        callback,
    );
};

const decodeBase64 = (b64Str: string) =>
    Buffer.from(b64Str, 'base64').toString();

const parseAccessToken = (req: Request) => {
    const { authorization } = req.headers;

    if (
        typeof authorization !== 'string' ||
        !authorization.startsWith(bearerPrefix)
    ) {
        return null;
    }

    return decodeBase64(authorization.replace(bearerPrefix, '').trim());
};

export const validateAndHandleRequest = (
    req: Request,
    res: Response,
    requestHandler: (req: Request, res: Response) => any,
) => {
    const accessToken = parseAccessToken(req);

    if (!accessToken) {
        return res
            .status(401)
            .json({ message: 'Missing or malformed authorization header' });
    }

    validateAccessToken(accessToken, (error, decodedToken) => {
        if (error) {
            console.log(`Failed to validate an access token - ${error}`);
            return res.status(401).json({ message: `Not authorized` });
        }

        if (decodedToken) {
            return requestHandler(req, res);
        }

        // The callback from jwt.verify should always include either the first
        // or second parameter. But just in case it does not...
        console.error('Invalid callback from jwt validator');
        return res.status(500).json({ message: 'Unknown validation error' });
    });
};
