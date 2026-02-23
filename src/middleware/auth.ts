import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: process.env.JWKS_URI || 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

export interface AuthRequest extends Request {
  user?: jwt.JwtPayload | string;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  // If JWT verification is enabled
  if (process.env.ENABLE_JWT_VERIFICATION === 'true') {
    jwt.verify(token, getKey, {
      algorithms: ['RS256'],
    }, (err, user) => {
      if (err) {
        res.status(403).json({ error: 'Invalid or expired token' });
        return;
      }
      req.user = user;
      next();
    });
  } else {
    // For development - skip verification
    try {
      const decoded = jwt.decode(token);
      if (decoded) {
        req.user = decoded;
        next();
      } else {
        res.status(403).json({ error: 'Invalid token format' });
      }
    } catch (err) {
      res.status(403).json({ error: 'Invalid token format' });
    }
  }
}


