import jwt, {
    JwtHeader,
    SigningKeyCallback,
    VerifyCallback,
} from 'jsonwebtoken';
import jwks from 'jwks-rsa';
import { Request, Response } from 'express';
import { decodeBase64 } from './utils.js';
import HttpsProxyAgent from 'https-proxy-agent';

const oneHourInMs = 60 * 60 * 1000;

// @ts-ignore
const proxyAgent = new HttpsProxyAgent(process.env.HTTPS_PROXY as string);

const jwksClient = jwks({
    jwksUri: process.env.AZURE_OPENID_CONFIG_JWKS_URI as string,
    cache: true,
    cacheMaxAge: oneHourInMs,
    requestAgent: proxyAgent,
});

const getSigningKey = async (
    header: JwtHeader,
    callback: SigningKeyCallback
) => {
    try {
        const key = await jwksClient.getSigningKey(header.kid);
        callback(undefined, key.getPublicKey());
    } catch (e) {
        console.error(`Failed to get signing key - ${e}`);
        callback(e, undefined);
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
        callback
    );
};

const parseAccessToken = (req: Request) => {
    const { authorization } = req.headers;

    if (
        typeof authorization !== 'string' ||
        !authorization.startsWith('Bearer ')
    ) {
        return null;
    }

    return decodeBase64(authorization.replace('Bearer ', ''));
};

export const validateAndProcessRequest = (
    req: Request,
    res: Response,
    callback: (req: Request, res: Response) => any
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

        if (!!decodedToken) {
            return callback(req, res);
        }

        // The callback from jwt.verify should always include either the first
        // or second parameter. But just in case it does not...
        console.error('Invalid callback from jwt validator');
        return res.status(500);
    });
};
