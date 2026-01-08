/**
 * @file worker-server.js
 * @description Render-friendly worker service for emitting logs and status updates.
 * @role Backend control plane for start/stop commands and Supabase writes.
 *
 * @pseudocode
 *  1. Load environment configuration and create a Supabase admin client.
 *  2. Configure Express with JSON parsing and CORS rules.
 *  3. Authenticate requests with Supabase auth tokens.
 *  4. Maintain in-memory worker runtimes and timers.
 *  5. Emit log entries and upsert worker_status rows.
 *  6. Expose start/stop endpoints for named workers.
 */

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ALLOWED_EMAILS: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  WORKER_NAMES: z.string().min(1),
  LOG_INTERVAL_MS: z.string().optional(),
  HEARTBEAT_INTERVAL_MS: z.string().optional(),
  PORT: z.string().optional()
});

const env = envSchema.parse(process.env);
const workerNames = parseCsv(env.WORKER_NAMES);

if (workerNames.length === 0) {
  throw new Error('WORKER_NAMES must include at least one worker.');
}

const allowedWorkers = new Set(workerNames);
const allowedEmails = parseCsv(env.ALLOWED_EMAILS).map((email) => email.toLowerCase());
const allowedOrigins = parseCsv(env.ALLOWED_ORIGINS).map(normalizeOrigin);
const logIntervalMs = parseNumber(env.LOG_INTERVAL_MS, 6000);
const heartbeatIntervalMs = parseNumber(env.HEARTBEAT_INTERVAL_MS, 12000);
const port = parseNumber(env.PORT, 3333);

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors(buildCorsOptions(allowedOrigins)));

/**
 * @typedef {object} WorkerRuntime
 * @property {string} name
 * @property {string} status
 * @property {NodeJS.Timeout | null} logInterval
 * @property {NodeJS.Timeout | null} heartbeatInterval
 * @property {number} sequence
 * @property {boolean} isTicking
 * @property {string | null} lastStartedAt
 * @property {string | null} lastStoppedAt
 */

const workerRegistry = new Map();
const logLevels = ['info', 'warning', 'error'];

/**
 * @function parseCsv
 * @description Parse a comma-separated string into trimmed values.
 * @param {string | undefined} value - Raw comma-delimited input.
 * @returns {string[]} Parsed values.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Split the string on commas.
 *  - Trim whitespace from each entry.
 *  - Drop empty entries.
 *
 * @context
 *  Used to read env vars for workers, origins, and emails.
 */
function parseCsv(value) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * @function normalizeOrigin
 * @description Normalize origin strings for CORS comparisons.
 * @param {string} value - Origin value to normalize.
 * @returns {string} Normalized origin string.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Trim whitespace from the origin value.
 *  - Remove trailing slashes.
 *  - Preserve scheme and host casing.
 *
 * @context
 *  Used when matching request origins to the allowlist.
 */
function normalizeOrigin(value) {
  return value.trim().replace(/\/+$/g, '');
}

/**
 * @function parseNumber
 * @description Parse numeric environment values with defaults.
 * @param {string | undefined} value - Raw numeric string.
 * @param {number} fallback - Default value when parsing fails.
 * @returns {number} Parsed positive integer.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Parse the value as an integer.
 *  - Fall back when parsing fails or value is not positive.
 *  - Return a safe numeric default.
 *
 * @context
 *  Used for port and interval configuration.
 */
function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

/**
 * @function buildCorsOptions
 * @description Build CORS options for the worker API.
 * @param {string[]} origins - Allowed origin list.
 * @returns {object} CORS options object.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Allow requests without an Origin header.
 *  - Permit all origins when no list is provided.
 *  - Normalize origins before comparing.
 *  - Validate origins against the configured list.
 *
 * @context
 *  Used to secure the worker API for browser clients.
 */
function buildCorsOptions(origins) {
  if (origins.length === 0) {
    return { origin: true, credentials: true };
  }

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (origins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed'));
    },
    allowedHeaders: ['authorization', 'content-type'],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
  };
}

/**
 * @function logEvent
 * @description Emit structured log events for the worker service.
 * @param {string} level - Log severity label.
 * @param {string} message - Log message text.
 * @param {object} details - Additional structured data.
 * @returns {void} No return value.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Combine metadata into a single payload.
 *  - Include an ISO timestamp.
 *  - Write JSON to stdout.
 *
 * @context
 *  Used for startup, worker actions, and error reporting.
 */
function logEvent(level, message, details = {}) {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...details
  };

  console.log(JSON.stringify(entry));
}

/**
 * @function getBearerToken
 * @description Extract the bearer token from an Authorization header.
 * @param {import('express').Request} req - Express request instance.
 * @returns {string | null} Bearer token or null.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Read the Authorization header value.
 *  - Ensure the scheme is Bearer.
 *  - Return the token segment.
 *
 * @context
 *  Used by auth middleware to validate Supabase sessions.
 */
function getBearerToken(req) {
  const header = req.header('authorization');

  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');

  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

/**
 * @function requireAuth
 * @description Validate a Supabase user session for protected routes.
 * @param {import('express').Request} req - Express request instance.
 * @param {import('express').Response} res - Express response instance.
 * @param {import('express').NextFunction} next - Next middleware.
 * @returns {Promise<void>} Resolves after auth validation.
 * @throws {Error} Never throws; responds with 401/403 on failure.
 *
 * @behavior
 *  - Extract the bearer token.
 *  - Verify the token via Supabase auth.
 *  - Enforce allowed email list when configured.
 *
 * @context
 *  Applied to worker start/stop endpoints.
 */
async function requireAuth(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  const email = data.user.email?.toLowerCase() ?? '';

  if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
    res.status(403).json({ error: 'User is not authorized for worker control.' });
    return;
  }

  req.user = data.user;
  next();
}

/**
 * @function createWorkerRuntime
 * @description Initialize an in-memory worker runtime record.
 * @param {string} name - Worker identifier.
 * @returns {WorkerRuntime} Worker runtime object.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Initialize status to stopped.
 *  - Reset sequence counters and timers.
 *  - Return the runtime object.
 *
 * @context
 *  Used when a worker is referenced for the first time.
 */
function createWorkerRuntime(name) {
  return {
    name,
    status: 'stopped',
    logInterval: null,
    heartbeatInterval: null,
    sequence: 0,
    isTicking: false,
    lastStartedAt: null,
    lastStoppedAt: null
  };
}

/**
 * @function getWorkerRuntime
 * @description Get or create a runtime entry for a worker.
 * @param {string} name - Worker identifier.
 * @returns {WorkerRuntime} Worker runtime object.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Return existing runtime if available.
 *  - Create and store a runtime for new workers.
 *  - Ensure a consistent runtime object.
 *
 * @context
 *  Used by start/stop handlers.
 */
function getWorkerRuntime(name) {
  if (!workerRegistry.has(name)) {
    workerRegistry.set(name, createWorkerRuntime(name));
  }

  return workerRegistry.get(name);
}

/**
 * @function isWorkerAllowed
 * @description Check if a worker name is in the allowed list.
 * @param {string} name - Worker identifier.
 * @returns {boolean} True when the worker is configured.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Normalize the worker name.
 *  - Check membership against the allowed set.
 *  - Return a boolean flag.
 *
 * @context
 *  Used to guard start/stop requests.
 */
function isWorkerAllowed(name) {
  return allowedWorkers.has(name);
}

/**
 * @function buildLogEntry
 * @description Create a dummy log entry payload.
 * @param {string} name - Worker identifier.
 * @param {number} sequence - Sequence counter.
 * @returns {object} Log entry payload.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Rotate through sample log levels.
 *  - Include worker name and sequence metadata.
 *  - Return a payload ready for insert.
 *
 * @context
 *  Used by the worker tick loop.
 */
function buildLogEntry(name, sequence) {
  const level = logLevels[sequence % logLevels.length];
  const message = `Worker ${name} emitted log #${sequence}.`;

  return {
    script_name: name,
    level,
    message,
    metadata: {
      sequence,
      sample: true
    }
  };
}

/**
 * @function insertWorkerLog
 * @description Insert a log entry into the script_logs table.
 * @param {object} payload - Log payload data.
 * @returns {Promise<void>} Resolves after insert.
 * @throws {Error} If Supabase returns an insert error.
 *
 * @behavior
 *  - Insert a single row into script_logs.
 *  - Throw a descriptive error on failure.
 *  - Return after success.
 *
 * @context
 *  Used by worker ticks and start/stop events.
 */
async function insertWorkerLog(payload) {
  const { error } = await supabaseAdmin.from('script_logs').insert(payload);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * @function upsertWorkerStatus
 * @description Upsert a worker_status row and return the updated record.
 * @param {object} payload - Worker status payload.
 * @returns {Promise<object>} Updated worker status row.
 * @throws {Error} If Supabase returns an upsert error.
 *
 * @behavior
 *  - Upsert on the worker name.
 *  - Select the updated row.
 *  - Throw an error on failure.
 *
 * @context
 *  Used by start/stop handlers and heartbeat updates.
 */
async function upsertWorkerStatus(payload) {
  const { data, error } = await supabaseAdmin
    .from('worker_status')
    .upsert(payload, { onConflict: 'name' })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * @function updateWorkerHeartbeat
 * @description Update worker_status with a heartbeat timestamp.
 * @param {WorkerRuntime} runtime - Worker runtime state.
 * @returns {Promise<void>} Resolves after update.
 * @throws {Error} Never throws; errors are logged.
 *
 * @behavior
 *  - Skip updates when the worker is not running.
 *  - Update heartbeat and message fields.
 *  - Preserve start/stop timestamps.
 *
 * @context
 *  Called on heartbeat intervals while a worker runs.
 */
async function updateWorkerHeartbeat(runtime) {
  if (runtime.status !== 'running') {
    return;
  }

  const now = new Date().toISOString();

  try {
    await upsertWorkerStatus({
      name: runtime.name,
      status: runtime.status,
      message: `Heartbeat at ${now}`,
      last_heartbeat: now,
      last_started_at: runtime.lastStartedAt,
      last_stopped_at: runtime.lastStoppedAt,
      updated_at: now
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    logEvent('error', 'Worker heartbeat failed', { worker: runtime.name, error: message });
  }
}

/**
 * @function handleWorkerTick
 * @description Emit a log entry and update worker status.
 * @param {WorkerRuntime} runtime - Worker runtime state.
 * @returns {Promise<void>} Resolves after the tick completes.
 * @throws {Error} Never throws; errors are logged.
 *
 * @behavior
 *  - Guard against overlapping ticks.
 *  - Insert a log entry into Supabase.
 *  - Upsert worker_status with a heartbeat.
 *
 * @context
 *  Invoked by the worker log interval timer.
 */
async function handleWorkerTick(runtime) {
  if (runtime.isTicking) {
    return;
  }

  runtime.isTicking = true;
  runtime.sequence += 1;

  try {
    const entry = buildLogEntry(runtime.name, runtime.sequence);
    const now = new Date().toISOString();

    await insertWorkerLog(entry);
    await upsertWorkerStatus({
      name: runtime.name,
      status: runtime.status,
      message: entry.message,
      last_heartbeat: now,
      last_started_at: runtime.lastStartedAt,
      last_stopped_at: runtime.lastStoppedAt,
      updated_at: now
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    logEvent('error', 'Worker tick failed', { worker: runtime.name, error: message });
  } finally {
    runtime.isTicking = false;
  }
}

/**
 * @function startWorker
 * @description Start a worker runtime and emit a start log.
 * @param {string} name - Worker identifier.
 * @returns {Promise<object>} Updated worker status row.
 * @throws {Error} If Supabase writes fail.
 *
 * @behavior
 *  - Skip starting if already running.
 *  - Reset the log sequence counter.
 *  - Schedule log and heartbeat intervals.
 *  - Emit a start log and update status.
 *
 * @context
 *  Used by the /workers/:name/start endpoint.
 */
async function startWorker(name) {
  const runtime = getWorkerRuntime(name);
  const now = new Date().toISOString();

  if (runtime.status === 'running') {
    return upsertWorkerStatus({
      name,
      status: runtime.status,
      message: 'Already running.',
      last_heartbeat: now,
      last_started_at: runtime.lastStartedAt,
      last_stopped_at: runtime.lastStoppedAt,
      updated_at: now
    });
  }

  runtime.status = 'running';
  runtime.sequence = 0;
  runtime.lastStartedAt = now;
  runtime.lastStoppedAt = null;

  runtime.logInterval = setInterval(() => {
    void handleWorkerTick(runtime);
  }, logIntervalMs);

  runtime.heartbeatInterval = setInterval(() => {
    void updateWorkerHeartbeat(runtime);
  }, heartbeatIntervalMs);

  await insertWorkerLog({
    script_name: name,
    level: 'info',
    message: `Worker ${name} started.`,
    metadata: { event: 'started' }
  });

  return upsertWorkerStatus({
    name,
    status: runtime.status,
    message: 'Running',
    last_heartbeat: now,
    last_started_at: runtime.lastStartedAt,
    last_stopped_at: runtime.lastStoppedAt,
    updated_at: now
  });
}

/**
 * @function stopWorker
 * @description Stop a worker runtime and emit a stop log.
 * @param {string} name - Worker identifier.
 * @returns {Promise<object>} Updated worker status row.
 * @throws {Error} If Supabase writes fail.
 *
 * @behavior
 *  - Clear log and heartbeat intervals.
 *  - Emit a stop log and update status.
 *  - Return the updated status row.
 *
 * @context
 *  Used by the /workers/:name/stop endpoint.
 */
async function stopWorker(name) {
  const runtime = getWorkerRuntime(name);
  const now = new Date().toISOString();

  if (runtime.logInterval) {
    clearInterval(runtime.logInterval);
    runtime.logInterval = null;
  }

  if (runtime.heartbeatInterval) {
    clearInterval(runtime.heartbeatInterval);
    runtime.heartbeatInterval = null;
  }

  if (runtime.status !== 'running') {
    runtime.status = 'stopped';
    runtime.lastStoppedAt = now;

    return upsertWorkerStatus({
      name,
      status: runtime.status,
      message: 'Already stopped.',
      last_heartbeat: now,
      last_started_at: runtime.lastStartedAt,
      last_stopped_at: runtime.lastStoppedAt,
      updated_at: now
    });
  }

  runtime.status = 'stopped';
  runtime.lastStoppedAt = now;

  await insertWorkerLog({
    script_name: name,
    level: 'warning',
    message: `Worker ${name} stopped.`,
    metadata: { event: 'stopped' }
  });

  return upsertWorkerStatus({
    name,
    status: runtime.status,
    message: 'Stopped',
    last_heartbeat: now,
    last_started_at: runtime.lastStartedAt,
    last_stopped_at: runtime.lastStoppedAt,
    updated_at: now
  });
}

/**
 * @function handleStartWorker
 * @description Handle start requests for worker runtimes.
 * @param {import('express').Request} req - Express request instance.
 * @param {import('express').Response} res - Express response instance.
 * @returns {Promise<void>} Resolves after response is sent.
 * @throws {Error} Never throws; responds with error codes.
 *
 * @behavior
 *  - Validate worker name against allowed list.
 *  - Start the worker and return status.
 *  - Respond with errors on failure.
 *
 * @context
 *  Mounted on POST /workers/:name/start.
 */
async function handleStartWorker(req, res) {
  const name = req.params.name;

  if (!isWorkerAllowed(name)) {
    res.status(404).json({ error: 'Unknown worker name.' });
    return;
  }

  try {
    const status = await startWorker(name);
    logEvent('info', 'Worker started', { worker: name, actor: req.user?.email });
    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    logEvent('error', 'Worker start failed', { worker: name, error: message });
    res.status(500).json({ error: message });
  }
}

/**
 * @function handleStopWorker
 * @description Handle stop requests for worker runtimes.
 * @param {import('express').Request} req - Express request instance.
 * @param {import('express').Response} res - Express response instance.
 * @returns {Promise<void>} Resolves after response is sent.
 * @throws {Error} Never throws; responds with error codes.
 *
 * @behavior
 *  - Validate worker name against allowed list.
 *  - Stop the worker and return status.
 *  - Respond with errors on failure.
 *
 * @context
 *  Mounted on POST /workers/:name/stop.
 */
async function handleStopWorker(req, res) {
  const name = req.params.name;

  if (!isWorkerAllowed(name)) {
    res.status(404).json({ error: 'Unknown worker name.' });
    return;
  }

  try {
    const status = await stopWorker(name);
    logEvent('info', 'Worker stopped', { worker: name, actor: req.user?.email });
    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    logEvent('error', 'Worker stop failed', { worker: name, error: message });
    res.status(500).json({ error: message });
  }
}

/**
 * @function handleHealth
 * @description Respond with a basic service health payload.
 * @param {import('express').Request} _req - Express request instance.
 * @param {import('express').Response} res - Express response instance.
 * @returns {void} No return value.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Return a JSON payload with uptime context.
 *  - Include the configured worker names.
 *  - Provide an ISO timestamp.
 *
 * @context
 *  Mounted on GET /health for monitoring checks.
 */
function handleHealth(_req, res) {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    workers: workerNames
  });
}

app.get('/health', handleHealth);

app.post('/workers/:name/start', requireAuth, handleStartWorker);
app.post('/workers/:name/stop', requireAuth, handleStopWorker);

/**
 * @function handleError
 * @description Handle uncaught express errors with JSON output.
 * @param {Error} error - Error instance.
 * @param {import('express').Request} _req - Express request instance.
 * @param {import('express').Response} res - Express response instance.
 * @param {import('express').NextFunction} _next - Next middleware.
 * @returns {void} No return value.
 * @throws {Error} Never throws; sends a 500 response.
 *
 * @behavior
 *  - Log the error payload.
 *  - Respond with a generic error message.
 *  - Avoid leaking sensitive details.
 *
 * @context
 *  Registered as the final Express error handler.
 */
function handleError(error, _req, res, _next) {
  logEvent('error', 'Unhandled error', { error: error.message });
  res.status(500).json({ error: 'Unexpected server error.' });
}

app.use(handleError);

/**
 * @function handleListen
 * @description Log a startup message when the server is ready.
 * @param {None} _ - No parameters.
 * @returns {void} No return value.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Emit a structured startup log entry.
 *  - Include port and interval metadata.
 *  - Surface configured worker names.
 *
 * @context
 *  Passed to app.listen during startup.
 */
function handleListen() {
  logEvent('info', 'Worker service ready', {
    port,
    workers: workerNames,
    logIntervalMs,
    heartbeatIntervalMs
  });
}

app.listen(port, handleListen);
