<!--
@file +page.svelte
@description Hosted log dashboard with auth, worker controls, and live logs.
@role Primary UI surface for Supabase log streaming and worker control.

@pseudocode
 1. Parse worker names from public config.
 2. Hydrate the Supabase auth session on mount.
 3. Load logs and worker statuses for signed-in users.
 4. Subscribe to realtime log and status changes.
 5. Render auth, worker controls, and log feed panels.
-->

<script>
  import { onMount } from 'svelte';
  import { PUBLIC_WORKER_NAMES } from '$env/static/public';
  import { fetchRecentLogs, subscribeToLogInserts } from '$lib/log-service';
  import { getSupabaseClient } from '$lib/supabase-client';
  import {
    fetchWorkerStatus,
    requestWorkerAction,
    subscribeToWorkerStatus
  } from '$lib/worker-service';

  const MAX_LOGS = 80;
  const supabase = getSupabaseClient();
  const workerNames = parseWorkerNames(PUBLIC_WORKER_NAMES);

  let logs = [];
  let logError = '';
  let isLive = false;
  let logUnsubscribe = null;

  let workerRows = workerNames.map(createWorkerRow);
  let workerError = '';
  let workerUnsubscribe = null;
  let workerBusy = {};

  let session = null;
  let userEmail = '';
  let authError = '';
  let authNotice = '';
  let isAuthBusy = false;
  let isAuthReady = false;
  let emailInput = '';
  let passwordInput = '';
  let authSubscription = null;
  let runningCount = 0;

  $: runningCount = workerRows.filter((row) => row.status === 'running').length;

  /**
   * @function parseWorkerNames
   * @description Parse PUBLIC_WORKER_NAMES into a list of worker identifiers.
   * @param {string | undefined} value - Comma-delimited worker names.
   * @returns {string[]} Normalized worker name list.
   * @throws {Error} Never throws.
   *
   * @behavior
   *  - Split the input on commas.
   *  - Trim whitespace around each entry.
   *  - Drop empty values.
   *
   * @context
   *  Used to build the worker control list for the dashboard.
   */
  function parseWorkerNames(value) {
    return (value ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  }

  /**
   * @function createWorkerRow
   * @description Create a default UI row for a worker.
   * @param {string} name - Worker identifier.
   * @returns {object} Default worker row state.
   * @throws {Error} Never throws.
   *
   * @behavior
   *  - Initialize status as offline.
   *  - Clear timestamps and messages.
   *  - Return a row object for rendering.
   *
   * @context
   *  Used to hydrate the worker list before realtime updates arrive.
   */
  function createWorkerRow(name) {
    return {
      name,
      status: 'offline',
      message: null,
      last_heartbeat: null,
      last_started_at: null,
      last_stopped_at: null,
      updated_at: null
    };
  }

  /**
   * @function formatTimestamp
   * @description Format timestamps for UI display.
   * @param {string | null | undefined} value - ISO timestamp string.
   * @returns {string} Human-friendly timestamp or placeholder.
   * @throws {Error} Never throws.
   *
   * @behavior
   *  - Return a placeholder for empty values.
   *  - Parse the timestamp into a Date.
   *  - Return a locale string or fallback.
   *
   * @context
   *  Used by worker status cards and log rows.
   */
  function formatTimestamp(value) {
    if (!value) {
      return '--';
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString();
  }

  /**
   * @function formatMetadata
   * @description Convert metadata JSON into a compact string.
   * @param {unknown} metadata - Metadata payload.
   * @returns {string} Prettified JSON or empty string.
   * @throws {Error} Never throws.
   *
   * @behavior
   *  - Return empty string for nullish values.
   *  - Serialize metadata with indentation.
   *  - Preserve primitive metadata values.
   *
   * @context
   *  Used by the log card to display metadata details.
   */
  function formatMetadata(metadata) {
    if (metadata === null || metadata === undefined) {
      return '';
    }

    if (typeof metadata === 'string') {
      return metadata;
    }

    return JSON.stringify(metadata, null, 2);
  }

  /**
   * @function statusClass
   * @description Map worker statuses to chip styling classes.
   * @param {string} status - Worker status string.
   * @returns {string} Tailwind class string for the chip.
   * @throws {Error} Never throws.
   *
   * @behavior
   *  - Normalize the status string to lowercase.
   *  - Return a class string for known statuses.
   *  - Fall back to a neutral chip style.
   *
   * @context
   *  Used to color-code worker status chips.
   */
  function statusClass(status) {
    const normalized = status.toLowerCase();

    if (normalized === 'running') {
      return 'bg-emerald-200/80 text-ink';
    }

    if (normalized === 'stopped') {
      return 'bg-black/5 text-muted';
    }

    if (normalized === 'sleeping') {
      return 'bg-amber-200/70 text-ink';
    }

    if (normalized === 'offline') {
      return 'bg-black/5 text-muted';
    }

    return 'bg-black/10 text-ink';
  }

  /**
   * @function levelClass
   * @description Map log levels to chip styling classes.
   * @param {string} level - Log level string.
   * @returns {string} Tailwind class string for the chip.
   * @throws {Error} Never throws.
   *
   * @behavior
   *  - Normalize the level string to lowercase.
   *  - Return a class string for known levels.
   *  - Fall back to a neutral chip style.
   *
   * @context
   *  Used by the log list to color-code level badges.
   */
  function levelClass(level) {
    const normalized = level.toLowerCase();

    if (normalized === 'error') {
      return 'bg-accent/20 text-ink';
    }

    if (normalized === 'warning') {
      return 'bg-amber-200/70 text-ink';
    }

    if (normalized === 'info') {
      return 'bg-accent2/20 text-ink';
    }

    return 'bg-black/10 text-ink';
  }

  /**
   * @function applyStatusUpdate
   * @description Merge a worker status row into UI state.
   * @param {object} status - Worker status payload.
   * @returns {void} No return value.
   * @throws {Error} Never throws.
   *
   * @behavior
   *  - Locate the matching worker row.
   *  - Merge new status data into the row.
   *  - Append unseen workers to the list.
   *
   * @context
   *  Used for Supabase fetches and realtime updates.
   */
  function applyStatusUpdate(status) {
    const index = workerRows.findIndex((row) => row.name === status.name);

    if (index === -1) {
      workerRows = [...workerRows, status];
      return;
    }

    workerRows = workerRows.map((row) =>
      row.name === status.name ? { ...row, ...status } : row
    );
  }

  /**
   * @function setWorkerBusy
   * @description Toggle busy state for a specific worker action.
   * @param {string} name - Worker identifier.
   * @param {boolean} isBusy - Busy state flag.
   * @returns {void} No return value.
   * @throws {Error} Never throws.
   *
   * @behavior
   *  - Merge the busy flag into the workerBusy map.
   *  - Trigger a reactive update for button states.
   *  - Preserve other worker busy flags.
   *
   * @context
   *  Used to disable Start/Stop buttons during API calls.
   */
  function setWorkerBusy(name, isBusy) {
    workerBusy = { ...workerBusy, [name]: isBusy };
  }

  /**
   * @function resetDashboard
   * @description Reset logs and worker state when auth changes.
   * @param {None} _ - No parameters.
   * @returns {void} No return value.
   * @throws {Error} Never throws.
   *
   * @behavior
   *  - Clear logs and error messages.
   *  - Reset worker rows to defaults.
   *  - Clear busy indicators.
   *
   * @context
   *  Invoked when the user signs out or switches sessions.
   */
  function resetDashboard() {
    logs = [];
    logError = '';
    isLive = false;
    workerRows = workerNames.map(createWorkerRow);
    workerError = '';
    workerBusy = {};
  }

  /**
   * @function clearSubscriptions
   * @description Remove realtime subscriptions for logs and workers.
   * @param {None} _ - No parameters.
   * @returns {void} No return value.
   * @throws {Error} Never throws.
   *
   * @behavior
   *  - Unsubscribe from the log channel if present.
   *  - Unsubscribe from the worker status channel if present.
   *  - Reset unsubscribe handlers.
   *
   * @context
   *  Called during cleanup and auth transitions.
   */
  function clearSubscriptions() {
    if (logUnsubscribe) {
      logUnsubscribe();
      logUnsubscribe = null;
    }

    if (workerUnsubscribe) {
      workerUnsubscribe();
      workerUnsubscribe = null;
    }
  }

  /**
   * @function initializeLogs
   * @description Load initial logs and start the realtime subscription.
   * @param {None} _ - No parameters.
   * @returns {Promise<void>} Resolves after initial setup.
   * @throws {Error} Does not throw; errors are captured for display.
   *
   * @behavior
   *  - Fetch recent logs from Supabase.
   *  - Store log data or an error message.
   *  - Subscribe to insert events for live updates.
   *
   * @context
   *  Called when the user is authenticated.
   */
  async function initializeLogs() {
    logError = '';
    isLive = false;

    const { data, errorMessage: fetchError } = await fetchRecentLogs(MAX_LOGS);

    if (fetchError) {
      logError = fetchError;
      return;
    }

    logs = data;

    const subscription = subscribeToLogInserts((log) => {
      logs = [log, ...logs].slice(0, MAX_LOGS);
    });

    if (subscription.errorMessage) {
      logError = subscription.errorMessage;
      return;
    }

    logUnsubscribe = subscription.unsubscribe;
    isLive = true;
  }

  /**
   * @function initializeWorkerStatus
   * @description Load worker statuses and subscribe to updates.
   * @param {None} _ - No parameters.
   * @returns {Promise<void>} Resolves after status setup.
   * @throws {Error} Does not throw; errors are captured for display.
   *
   * @behavior
   *  - Fetch worker status rows from Supabase.
   *  - Merge status data into the default worker list.
   *  - Subscribe to realtime updates.
   *
   * @context
   *  Called when the user is authenticated.
   */
  async function initializeWorkerStatus() {
    workerError = '';
    workerRows = workerNames.map(createWorkerRow);

    const { data, errorMessage } = await fetchWorkerStatus();

    if (errorMessage) {
      workerError = errorMessage;
      return;
    }

    data.forEach((status) => applyStatusUpdate(status));

    const subscription = subscribeToWorkerStatus((status) => {
      applyStatusUpdate(status);
    });

    if (subscription.errorMessage) {
      workerError = subscription.errorMessage;
      return;
    }

    workerUnsubscribe = subscription.unsubscribe;
  }

  /**
   * @function syncSession
   * @description Sync UI state with the current auth session.
   * @param {object | null} nextSession - Supabase session data.
   * @returns {Promise<void>} Resolves after state updates.
   * @throws {Error} Does not throw; errors are captured for display.
   *
   * @behavior
   *  - Clear existing subscriptions and state.
   *  - Update session and user email.
   *  - Load logs and worker status for active sessions.
   *
   * @context
   *  Called on initial load and auth state changes.
   */
  async function syncSession(nextSession) {
    clearSubscriptions();
    resetDashboard();

    session = nextSession;
    userEmail = nextSession?.user?.email ?? '';

    if (!session) {
      return;
    }

    await Promise.all([initializeLogs(), initializeWorkerStatus()]);
  }

  /**
   * @function handleSignIn
   * @description Sign in with email and password.
   * @param {None} _ - No parameters.
   * @returns {Promise<void>} Resolves after the sign-in attempt.
   * @throws {Error} Does not throw; errors are captured for display.
   *
   * @behavior
   *  - Validate the input fields.
   *  - Call Supabase signInWithPassword.
   *  - Store any returned error message.
   *
   * @context
   *  Triggered by the Sign In button.
   */
  async function handleSignIn() {
    authError = '';
    authNotice = '';

    if (!emailInput || !passwordInput) {
      authError = 'Email and password are required.';
      return;
    }

    isAuthBusy = true;

    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.trim(),
      password: passwordInput
    });

    if (error) {
      authError = error.message;
    } else {
      passwordInput = '';
    }

    isAuthBusy = false;
  }

  /**
   * @function handleSignUp
   * @description Create a new user account with Supabase auth.
   * @param {None} _ - No parameters.
   * @returns {Promise<void>} Resolves after the sign-up attempt.
   * @throws {Error} Does not throw; errors are captured for display.
   *
   * @behavior
   *  - Validate the input fields.
   *  - Call Supabase signUp.
   *  - Store any returned error message or notice.
   *
   * @context
   *  Triggered by the Create Account button.
   */
  async function handleSignUp() {
    authError = '';
    authNotice = '';

    if (!emailInput || !passwordInput) {
      authError = 'Email and password are required.';
      return;
    }

    isAuthBusy = true;

    const { error } = await supabase.auth.signUp({
      email: emailInput.trim(),
      password: passwordInput
    });

    if (error) {
      authError = error.message;
    } else {
      authNotice = 'Check your inbox if email confirmation is enabled.';
      passwordInput = '';
    }

    isAuthBusy = false;
  }

  /**
   * @function handleSignOut
   * @description Sign out the current user session.
   * @param {None} _ - No parameters.
   * @returns {Promise<void>} Resolves after sign-out.
   * @throws {Error} Does not throw; errors are captured for display.
   *
   * @behavior
   *  - Call Supabase signOut.
   *  - Surface any error in the auth error field.
   *  - Clear notices on success.
   *
   * @context
   *  Triggered by the Sign Out button.
   */
  async function handleSignOut() {
    authError = '';
    authNotice = '';

    const { error } = await supabase.auth.signOut();

    if (error) {
      authError = error.message;
    }
  }

  /**
   * @function handleWorkerAction
   * @description Start or stop a worker via the API.
   * @param {string} name - Worker identifier.
   * @param {string} action - "start" or "stop" action.
   * @returns {Promise<void>} Resolves after the action completes.
   * @throws {Error} Does not throw; errors are captured for display.
   *
   * @behavior
   *  - Guard against missing auth sessions.
   *  - Call the worker API with a bearer token.
   *  - Merge updated status into the UI state.
   *
   * @context
   *  Triggered by the Start/Stop buttons in the worker list.
   */
  async function handleWorkerAction(name, action) {
    workerError = '';

    if (!session?.access_token) {
      workerError = 'Sign in to control workers.';
      return;
    }

    setWorkerBusy(name, true);
    try {
      const { data, errorMessage } = await requestWorkerAction({
        workerName: name,
        action,
        accessToken: session.access_token
      });

      if (errorMessage) {
        workerError = errorMessage;
      }

      if (data) {
        applyStatusUpdate(data);
      }
    } catch (error) {
      workerError = error instanceof Error ? error.message : 'Unknown error.';
    } finally {
      setWorkerBusy(name, false);
    }
  }

  /**
   * @function initializeAuth
   * @description Load the current session and subscribe to auth changes.
   * @param {None} _ - No parameters.
   * @returns {Promise<void>} Resolves after initialization.
   * @throws {Error} Does not throw; errors are captured for display.
   *
   * @behavior
   *  - Fetch the current Supabase session.
   *  - Sync UI state with the session.
   *  - Subscribe to auth state changes.
   *
   * @context
   *  Called when the page mounts.
   */
  async function initializeAuth() {
    const { data } = await supabase.auth.getSession();
    await syncSession(data.session);
    isAuthReady = true;

    const { data: authData } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        void syncSession(nextSession);
      }
    );

    authSubscription = authData.subscription;
  }

  onMount(() => {
    void initializeAuth();

    return () => {
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
      clearSubscriptions();
    };
  });
</script>

<main class="min-h-screen px-4 py-10 sm:px-8">
  <div class="mx-auto flex max-w-6xl flex-col gap-8">
    <header class="panel animate-rise px-6 py-8 sm:px-10">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div class="space-y-4">
          <div class="badge text-ink">
            <span class="h-2 w-2 rounded-full bg-accent animate-pulse-soft"></span>
            Supabase + Render Control Deck
          </div>
          <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Start, stop, and watch your workers stream logs in real time.
          </h1>
          <p class="max-w-2xl text-base text-muted">
            This dashboard connects to a hosted Supabase database, shows live log
            inserts, and sends start/stop commands to your Render worker.
          </p>
        </div>
        <div class="flex flex-col gap-4 sm:flex-row">
          <div class="panel px-5 py-4">
            <p class="text-xs uppercase tracking-[0.2em] text-muted">Total logs</p>
            <p class="text-2xl font-semibold text-ink">{logs.length}</p>
          </div>
          <div class="panel px-5 py-4">
            <p class="text-xs uppercase tracking-[0.2em] text-muted">
              Running workers
            </p>
            <p class="text-2xl font-semibold text-ink">{runningCount}</p>
          </div>
          <div class="panel px-5 py-4">
            <p class="text-xs uppercase tracking-[0.2em] text-muted">Live</p>
            <div class="flex items-center gap-2">
              <span
                class={`h-2 w-2 rounded-full ${isLive ? 'bg-accent2' : 'bg-muted'}`}
              ></span>
              <p class="text-2xl font-semibold text-ink">
                {isLive ? 'Streaming' : 'Idle'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>

    {#if authError}
      <div class="panel border border-accent/40 px-6 py-4 text-ink" role="alert">
        <p class="text-sm font-semibold uppercase tracking-[0.2em]">Auth error</p>
        <p class="mt-2 text-base">{authError}</p>
      </div>
    {/if}

    {#if workerError}
      <div class="panel border border-accent/40 px-6 py-4 text-ink" role="alert">
        <p class="text-sm font-semibold uppercase tracking-[0.2em]">
          Worker error
        </p>
        <p class="mt-2 text-base">{workerError}</p>
      </div>
    {/if}

    {#if logError}
      <div class="panel border border-accent/40 px-6 py-4 text-ink" role="alert">
        <p class="text-sm font-semibold uppercase tracking-[0.2em]">Log error</p>
        <p class="mt-2 text-base">{logError}</p>
      </div>
    {/if}

    <section class="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside class="space-y-6">
        <div class="panel px-6 py-6 space-y-4 animate-rise">
          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.2em] text-muted">Account</p>
            {#if !isAuthReady}
              <p class="text-sm text-muted">Connecting to Supabase auth...</p>
            {:else if session}
              <div class="space-y-2">
                <p class="text-lg font-semibold text-ink">{userEmail}</p>
                <p class="text-xs text-muted">Signed in and ready.</p>
              </div>
              <button
                class="rounded-full border border-black/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink transition hover:bg-black/5 focus-ring"
                on:click={handleSignOut}
              >
                Sign out
              </button>
            {:else}
              <form class="space-y-3" on:submit|preventDefault={handleSignIn}>
                <div class="space-y-2">
                  <label class="text-xs uppercase tracking-[0.2em] text-muted" for="email"
                    >Email</label
                  >
                  <input
                    id="email"
                    class="w-full rounded-2xl border border-black/10 bg-white/80 px-4 py-2 text-sm text-ink focus-ring"
                    type="email"
                    autocomplete="email"
                    bind:value={emailInput}
                    required
                  />
                </div>
                <div class="space-y-2">
                  <label
                    class="text-xs uppercase tracking-[0.2em] text-muted"
                    for="password"
                    >Password</label
                  >
                  <input
                    id="password"
                    class="w-full rounded-2xl border border-black/10 bg-white/80 px-4 py-2 text-sm text-ink focus-ring"
                    type="password"
                    autocomplete="current-password"
                    bind:value={passwordInput}
                    required
                  />
                </div>
                <div class="flex flex-wrap gap-2 pt-2">
                  <button
                    class={`rounded-full border border-black/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition focus-ring ${
                      isAuthBusy
                        ? 'cursor-not-allowed bg-black/5 text-muted'
                        : 'bg-accent/15 text-ink hover:bg-accent/25'
                    }`}
                    type="submit"
                    disabled={isAuthBusy}
                  >
                    Sign in
                  </button>
                  <button
                    class={`rounded-full border border-black/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition focus-ring ${
                      isAuthBusy
                        ? 'cursor-not-allowed bg-black/5 text-muted'
                        : 'bg-accent2/15 text-ink hover:bg-accent2/25'
                    }`}
                    type="button"
                    on:click={handleSignUp}
                    disabled={isAuthBusy}
                  >
                    Create account
                  </button>
                </div>
                {#if authNotice}
                  <p class="text-xs text-muted">{authNotice}</p>
                {/if}
              </form>
            {/if}
          </div>
        </div>

        <div class="panel px-6 py-6 space-y-4 animate-rise">
          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.2em] text-muted">Workers</p>
            <h2 class="text-lg font-semibold text-ink">Command queue</h2>
            <p class="text-sm text-muted">
              Start or stop each named worker. Status updates stream in from
              Supabase.
            </p>
          </div>
          {#if !session}
            <p class="text-sm text-muted">Sign in to control workers.</p>
          {:else if workerRows.length === 0}
            <p class="text-sm text-muted">
              No workers configured. Set PUBLIC_WORKER_NAMES to list them.
            </p>
          {:else}
            <div class="space-y-4">
              {#each workerRows as worker (worker.name)}
                {@const isRunning = worker.status === 'running'}
                {@const isBusy = Boolean(workerBusy[worker.name])}
                <article class="rounded-2xl border border-black/10 bg-white/80 p-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-semibold text-ink">{worker.name}</p>
                      <p class="text-xs text-muted">{worker.message || 'Idle'}</p>
                    </div>
                    <span class={`log-chip ${statusClass(worker.status)}`}>
                      {worker.status}
                    </span>
                  </div>
                  <div class="mt-3 grid gap-2 text-xs text-muted">
                    <div class="flex items-center justify-between">
                      <span>Heartbeat</span>
                      <span class="text-ink">
                        {formatTimestamp(worker.last_heartbeat)}
                      </span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span>Last started</span>
                      <span class="text-ink">
                        {formatTimestamp(worker.last_started_at)}
                      </span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span>Last stopped</span>
                      <span class="text-ink">
                        {formatTimestamp(worker.last_stopped_at)}
                      </span>
                    </div>
                  </div>
                  <div class="mt-4 flex flex-wrap gap-2">
                    <button
                      class={`rounded-full border border-black/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition focus-ring ${
                        isRunning || isBusy
                          ? 'cursor-not-allowed bg-black/5 text-muted'
                          : 'bg-accent/15 text-ink hover:bg-accent/25'
                      }`}
                      disabled={isRunning || isBusy}
                      on:click={() => handleWorkerAction(worker.name, 'start')}
                    >
                      Start
                    </button>
                    <button
                      class={`rounded-full border border-black/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition focus-ring ${
                        !isRunning || isBusy
                          ? 'cursor-not-allowed bg-black/5 text-muted'
                          : 'bg-accent2/15 text-ink hover:bg-accent2/25'
                      }`}
                      disabled={!isRunning || isBusy}
                      on:click={() => handleWorkerAction(worker.name, 'stop')}
                    >
                      Stop
                    </button>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </div>

        <div class="panel px-6 py-6 space-y-3 animate-rise">
          <p class="text-xs uppercase tracking-[0.2em] text-muted">Notes</p>
          <p class="text-sm text-muted">
            Render free services may sleep when idle. The first start request can
            take a few seconds to wake the worker.
          </p>
          <p class="text-sm text-muted">
            Log visibility and worker status require an authenticated Supabase
            session.
          </p>
        </div>
      </aside>

      <div class="panel px-6 py-6">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-ink">Latest logs</h2>
          <span class="text-xs uppercase tracking-[0.2em] text-muted">
            showing {Math.min(logs.length, MAX_LOGS)} of {MAX_LOGS}
          </span>
        </div>

        {#if !session}
          <div class="mt-8 text-center text-sm text-muted">
            Sign in to load logs from Supabase.
          </div>
        {:else if logs.length === 0 && !logError}
          <div class="mt-8 text-center text-sm text-muted">
            No logs yet. Start a worker to populate the feed.
          </div>
        {:else}
          <div class="mt-6 space-y-4 stagger">
            {#each logs as log (log.id)}
              <article class="rounded-2xl border border-black/10 bg-white/80 p-4">
                <div class="flex flex-wrap items-center gap-3 text-xs">
                  <span class={`log-chip ${log.level ? levelClass(log.level) : ''}`}>
                    {log.level}
                  </span>
                  <span class="text-muted">{formatTimestamp(log.created_at)}</span>
                  <span class="text-muted">{log.script_name}</span>
                </div>
                <p class="mt-3 text-base font-medium text-ink">{log.message}</p>
                {#if formatMetadata(log.metadata)}
                  <pre
                    class="mt-3 whitespace-pre-wrap rounded-xl bg-black/5 p-3 font-mono text-xs text-ink"
                  >{formatMetadata(log.metadata)}</pre>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
</main>
