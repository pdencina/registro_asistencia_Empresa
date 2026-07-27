const { getDb } = require('./lib/db');

/**
 * GET /api/health
 * Health check endpoint for monitoring.
 * Verifies: database connectivity, response time.
 * Returns HTTP 200 if healthy, 503 if unhealthy.
 * 
 * Use with: Vercel Monitoring, UptimeRobot, Better Uptime, etc.
 */
module.exports = async function handler(req, res) {
  // No CORS needed for health checks (usually internal)
  res.setHeader('Cache-Control', 'no-cache, no-store');

  const start = Date.now();
  const checks = {};

  // Check 1: Database connectivity
  try {
    const sql = getDb();
    const [result] = await sql('SELECT NOW() as time, current_database() as db');
    checks.database = {
      status: 'ok',
      latency_ms: Date.now() - start,
      server_time: result.time,
      database: result.db,
    };
  } catch (err) {
    checks.database = { status: 'error', error: err.message };
  }

  // Check 2: Memory usage
  const mem = process.memoryUsage();
  checks.memory = {
    rss_mb: Math.round(mem.rss / 1024 / 1024),
    heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
  };

  // Check 3: Environment
  checks.environment = {
    resend_configured: !!process.env.RESEND_API_KEY,
    google_maps_configured: !!process.env.GOOGLE_MAPS_API_KEY,
    admin_secret_configured: !!process.env.GLOBAL_ADMIN_SECRET,
    node_version: process.version,
  };

  // Overall status
  const healthy = checks.database.status === 'ok';
  const totalLatency = Date.now() - start;

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    version: '2.0.0',
    uptime: 'serverless',
    response_time_ms: totalLatency,
    timestamp: new Date().toISOString(),
    checks,
  });
};
