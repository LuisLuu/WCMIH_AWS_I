
const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Token required"
    });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        algorithms: ["HS256"],
        issuer: "project-v",
        audience: "project-v-api"
      }
    );

    if (!decoded.sub) {
      return res.status(401).json({
        error: "Invalid token"
      });
    }

    req.user = { sub: decoded.sub };
    next();
  } catch {
    res.status(401).json({
      error: "Invalid or expired token"
    });
  }
}

module.exports = { verifyToken };
