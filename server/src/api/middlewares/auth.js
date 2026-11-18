const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authorization = req.get('Authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);

  if (!match) {
    return res.status(401).json({ error: 'Bearer token required' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.startsWith('replace-with-') || Buffer.byteLength(secret, 'utf8') < 32) {
    return next(new Error('JWT_SECRET is not configured with a random value of at least 32 bytes'));
  }

  try {
    req.user = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
    return next();
  } catch (error) {
    if (
      error instanceof jwt.TokenExpiredError
      || error instanceof jwt.JsonWebTokenError
      || error instanceof jwt.NotBeforeError
    ) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    return next(error);
  }
}

module.exports = authenticateToken;
