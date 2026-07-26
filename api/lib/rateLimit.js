/**
 * Simple in-memory rate limiter for serverless functions.
 * Limits requests per IP per time window.
 * 
 * Note: In serverless, each cold start resets the map.
 * For production at scale, use Vercel KV or Upstash Redis.
 * This is sufficient for preventing basic brute-force attacks.
 */

const attempts = new Map();

/**
 * Check if request should be rate limited.
 * @param {string} key - Unique key (usually IP + endpoint)
 * @param {number} maxAttempts - Max allowed attempts in window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {{ limited: boolean, remaining: number, resetIn: number }}
 */
function checkRateLimit(key, maxAttempts = 10, windowMs = 60000) {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now - record.firstAttempt > windowMs) {
    // New window
    attempts.set(key, { count: 1, firstAttempt: now });
    return { limited: false, remaining: maxAttempts - 1, resetIn: windowMs };
  }

  record.count++;

  if (record.count > maxAttempts) {
    const resetIn = windowMs - (now - record.firstAttempt);
    return { limited: true, remaining: 0, resetIn };
  }

  return { limited: false, remaining: maxAttempts - record.count, resetIn: windowMs - (now - record.firstAttempt) };
}

/**
 * Express/Vercel middleware-style rate limiter.
 * Returns true if rate limited (already sent 429 response).
 */
function rateLimit(req, res, { maxAttempts = 10, windowMs = 60000, keyPrefix = '' } = {}) {
  const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown');
  const cleanIp = typeof ip === 'string' ? ip.split(',')[0].trim() : 'unknown';
  const key = `${keyPrefix}:${cleanIp}`;

  const result = checkRateLimit(key, maxAttempts, windowMs);

  if (result.limited) {
    res.setHeader('Retry-After', Math.ceil(result.resetIn / 1000));
    res.status(429).json({
      error: 'Demasiados intentos. Espera un momento antes de reintentar.',
      retry_after_seconds: Math.ceil(result.resetIn / 1000),
    });
    return true;
  }

  return false;
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts.entries()) {
    if (now - record.firstAttempt > 300000) { // 5 min
      attempts.delete(key);
    }
  }
}, 300000);

module.exports = { rateLimit, checkRateLimit };
