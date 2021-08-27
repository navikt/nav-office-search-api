import jwt, {
    JwtHeader,
    SigningKeyCallback,
    VerifyCallback,
} from 'jsonwebtoken';
import jwks from 'jwks-rsa';
import { decodeBase64 } from './utils';
import { Request, Response } from 'express';

const oneHourInMs = 60 * 60 * 1000;

const jwksClient = jwks({
    jwksUri: process.env.AZURE_OPENID_CONFIG_JWKS_URI as string,
    cache: false,
    // cacheMaxAge: oneHourInMs,
});

const getSigningKey = async (
    header: JwtHeader,
    callback: SigningKeyCallback
) => {
    const key = await jwksClient.getSigningKey(header.kid);
    callback(undefined, key.getPublicKey());
};

export const validateAccessToken = (
    accessToken: string,
    callback: VerifyCallback
) => {
    jwt.verify(
        accessToken,
        getSigningKey,
        {
            algorithms: ['RS256', 'RS384', 'RS512'],
            audience: process.env.API_CLIENT_ID,
        },
        callback
    );
};

export const validateAndProcessRequest = (
    req: Request,
    res: Response,
    callback: (req: Request, res: Response) => any
) => {
    const { Authorization } = req.headers;

    console.log(req.headers, Authorization);

    if (typeof Authorization !== 'string') {
        return res
            .status(401)
            .json({ message: 'Missing authorization header' });
    }

    const accessToken = decodeBase64(Authorization);

    validateAccessToken(accessToken, (error, decodedToken) => {
        if (error) {
            console.log(`Failed to validate an access token - ${error}`);
            return res
                .status(401)
                .json({ message: `Not authorized - ${error}` });
        }

        if (!!decodedToken) {
            return callback(req, res);
        }

        console.error('Invalid callback response from jwt validator');
        return res.status(500);
    });
};
