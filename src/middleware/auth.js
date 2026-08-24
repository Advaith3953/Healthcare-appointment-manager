const crypto = require('crypto');

// In-memory session store: token -> { userId, role }
// Simple and readable for a demo project. Swap for signed JWTs or a
// session store (Redis, DB table) for production use.
const sessions = new Map();

function issueToken(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: user.id, role: user.role });
  return token;
}

function revokeToken(token) {
  sessions.delete(token);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token && sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  }
  req.user = session;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `This action requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { sessions, issueToken, revokeToken, requireAuth, requireRole };
