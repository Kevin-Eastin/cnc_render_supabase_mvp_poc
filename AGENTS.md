# AGENTS.md — (cteam) Repository Guide for AI Agents

---
Project Name: CTEAM Devflow
Project URL: https://github.com/orgs/STANDARD-11/projects/1
Board Name: Devflow board
---

## test login
  if you need to log into cteam, use these test credentials:
  email: kevin-codex1@test.com
  password: pw

## init prime

  If the user says **"init prime"**, the agent executes this sequence:

  1. **Scan** the linked GitHub Project board for Issues labeled `status:ready-for-dev` using: 
    gh project item-list 1 --owner STANDARD-11 --limit 100 --format json --jq '.items[] | select(.status=="Ready for Dev") | {number: .content.number, title: .content.title}'

  2. **Display** a numbered list of available Issues.

  3. **Prompt** the user to select one:
    ```Which issue should I begin? (enter number)```

  4. **Fetch** the selected Issue's body and parent issue, if any, for context:
    gh project item-list 1 --owner STANDARD-11 --limit 100 --format json | jq -r '.items[] | select(.content.number==<issue_number>) | .content.body'

    gh api graphql \
      -f query='query($owner:String!,$name:String!,$number:Int!){
        repository(owner:$owner, name:$name){
          issue(number:$number){
            number
            title
            parent { number title url }
            trackedIssues(first:20){ nodes{ number title url } }
          }
        }
      }' \
      -f owner=STANDARD-11 -f name=cteam -F number=<issue_number>

  5. **Analyze** issue body and requirements. Focus on the issue, but read the parent, if any, for context
    
  6. **Create** a new branch and link it to the issue.  
    gh issue develop <issue_id> -- base <current_branch> --name [feature|design|documentation|bugfix]/<issue-number>-<short-slug> --checkout

  7. **Set** the issue's status to "in progress".
      gh project item-edit --project-id PVT_kwDOA6tm9s4BHv_w --id <issue_id> --field-id PVTSSF_lADOA6tm9s4BHv_wzg4aaT4 --single-select-option-id 47fc9ee4

  8. **Ask** clarifying questions IF/WHEN requirements are ambiguous.
  
  9. **Propose** a plan of implementation for user approval:
      - Print out a high level implementation plan and **WAIT** for explicit user approval before implementing. 

  10. **Implement** according to Issue details and acceptance criteria:
    - Try to focus edits on files listed in *Relevant Files*, but allow flexibility where changes clearly add value or maintain consistency.
    - Follow Acceptance Criteria closely, using best judgment for gray areas.

  11. **Pause** when implementation appears complete and say:
    ```Please review changes locally and confirm whether to proceed.```

---

## create preview

  If the user says **"create preview"**:
    - Assume $NETLIFY_AUTH_TOKEN and $CTEAM_SITE_ID are available and valid.
    - Note the command may take some time, adjust your timeout accordingly.
    - You have the necessary permissions to run this, I approve.
  
  netlify deploy 
    --build
    --context deploy-preview
    --alias "<some valid name based on current branch name with 'kde-' prepended>" 
    --auth "$NETLIFY_AUTH_TOKEN" 
    --site "$CTEAM_SITE_ID" 
    --message "Codex manual deploy for: <current_branch>"
    --json
  
  If successful only display the preview url.

---

## destroy previews

  If the user says **"destroy previews"**:

  Grab any deployment id(s) made in this session
    NETLIFY_AUTH_TOKEN="$NETLIFY_AUTH_TOKEN" netlify api listSiteDeploys --data '{"site_id":"'"$CTEAM_SITE_ID"'"}' --auth "$NETLIFY_AUTH_TOKEN" | tee netlify-deploys.json

  Print the urls you're considering deleting and prompt user for approval.  

  delete the deploy-preview(s)
    NETLIFY_AUTH_TOKEN="$NETLIFY_AUTH_TOKEN" netlify api deleteDeploy --auth "$NETLIFY_AUTH_TOKEN" --data
        '{"deploy_id":"<deploy_id>"}'
  
  List remaining deployments (url only)

---

## Export Transcript
  - If the user says **"export transcript"**:
    export a transcript of this conversation to a file named "<short-blurb>-<simple-file-friendly-date>-transcript.txt". Make it clear when it's me, (Kevin) speaking, and when its you, (Codex), responding. Cut out all the in between filler and diffs. Add newlines between responses. Keep my words, and your closing summary statements from your responses, verbatim.

---

## Message Discord
  - use this: DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1451113162274246666/-cHGcUWU0Oo10HbtVZTscpBak149VUrHZYaUj2Nx3Y2TpZ5PEQ_z8oODdg6nObmAiWdo"
  - If the user says **"msg dc: <message>"**
    curl -fS -H 'Content-Type: application/json' \
    -d '{"content":"<message>"}' "$DISCORD_WEBHOOK_URL" -o /dev/null

---

## Behavioral Principles

- Ask before assuming; clarify intent when uncertain.
- Stay intentional, not mechanical; follow patterns but adapt to context.
- Transparency over automation; always state what you're doing and why.
- Humans decide final outcomes; the agent never merges or deploys autonomously.

---

## Unclear Requirements

- **Unclear requirements** → Agent should ask for clarifications if necessary.

---

## Testing and Linting

No automated tests, linting, or build checks are required at this time.  
Focus entirely on correctness, clarity, and meeting acceptance criteria.

---

## Mantra (Five-Step Rhythm)

```
1. Query    → find ready-for-codex issues
2. Present  → show options and await selection
3. Analyze → The chosen issue carefully
4. Propose → a plan of implementation
5. Execute  → branch, implement, pause for review
```
---

## Code Organization (SvelteKit)
- Organize by **feature** (e.g., `apps/members/src/routes/(secured)/tickets/...`).  
- Within a slice, use SvelteKit norms: UI under `lib/components`, routes in `routes`, shared client utilities/stores in `lib/`, server‑only helpers in `lib/server/`.  
- **One component/module per file** where practical; filename aligns with primary export.  
- **Interfaces/Types** live near usage.  
- Avoid mixing unrelated features in a folder.

---

## Coding Standards (TypeScript/Svelte)
- **Async‑first**; cancel long fetches via `AbortController` where applicable.
- **Type safety:** `strict` TS; avoid `any` unless justified with a comment; model domain with types/zod.
- **Components:** small, focused; props typed; a11y first (real inputs, aria, focus).
- **State management:** prefer local component state; extract pure helpers to `lib/`.
- **Styling:** Tailwind; shared tokens/components via `packages/ui` (shadcn-svelte).
- **Data layer:** migrations committed; **never** leak secrets to the client.
- **Logging:** server uses structured logs; client console logs allowed in dev, banned in prod paths.
- **No dead code:** remove unused exports/usings/stubs in the same PR that obsoletes them.
- **Naming:** PascalCase for components/classes, camelCase for functions/vars, `CONSTANT_CASE` for constants; file/dir names kebab‑case.

---

## Comments & Documentation Standard (for AI agents)
**Goal:** High‑signal, durable comments. Brief and accurate. Use the following rules in every change.

---

  ## 1) FILE HEADER DOCBLOCK
  ```ts
  /** 
   * @file tickets.ts
   * @description Handles ticket creation, validation, and reporting.
   * @role Backend logic layer — connects form input, schema validation, and database writes.
   *
   * @pseudocode
   *  1. Receive validated form data.
   *  2. Normalize input and enrich with derived fields.
   *  3. Validate via TicketSchema.
   *  4. Insert record into Supabase.
   *  5. Trigger notification events.
   *  6. Return ticket object.
   *
   * @dependencies Supabase client, EmailService
   */
  ```

  **Rules**
  - Required tags: `@file`, `@description`, `@role`, `@pseudocode`.
  - Pseudocode = 4 to 10 steps summarizing logic (not syntax).
  - Optional: `@dependencies` for external or critical modules.
  - Always line 1 of the file.

  ---

  ## 2) FUNCTION / CLASS DOCBLOCKS
  ```ts
  /**
   * @function createTicket
   * @description Validates input, computes derived fields, and writes a ticket record.
   * @param {TicketData} data - Normalized ticket payload.
   * @returns {Promise<Ticket>} The persisted record.
   * @throws {ValidationError} If schema validation fails.
   *
   * @behavior
   *  - Validate data with TicketSchema.
   *  - Compute total hours and shift bounds.
   *  - Write to database and return result.
   *
   * @context
   *  Called from /submit_ticket; must maintain schema parity with client form.
   */
  ```

  **Rules**
  - Always include: `@function`, `@description`, `@param`, `@returns`, `@throws`.
  - Always include: `@behavior` (logic summary) and `@context` (rationale).
  - Write in imperative tense (“Validate”, “Insert”, “Return”).

  ---

  ## 3) INLINE COMMENTS

  **Rules**
  - Max one line, ≤ 80 characters.
  - Explain reasoning, and behavior.
  - Place directly above the relevant line/block.

  ---

  ## 4) EXECUTION SEQUENCE
  When generating or editing code:
  1. **Analyze** the file — determine purpose and logical role.
  2. **Generate/update** header docblock (include pseudocode).
  3. **Add/refresh** all function/class docblocks.
  4. **Insert** inline reasoning comments for complex logic.
  5. **Run self-audit checklist** before finalizing.

  ---

  ## SELF-AUDIT CHECKLIST
  Before saving output, confirm the following:

  | # | Verification Item | Status |
  |---|--------------------|--------|
  | 1 | File starts with one header docblock containing `@file`, `@description`, `@role`, `@pseudocode` | ☐ |
  | 2 | Pseudocode includes 4–10 ordered steps | ☐ |
  | 3 | All exported or major internal functions/classes have docblocks | ☐ |
  | 4 | Inline comments explain reasoning, not syntax | ☐ |
  | 5 | No redundant or outdated comments remain | ☐ |
  | 6 | Formatting and tags are syntactically valid | ☐ |
  | 7 | File aligns fully with this AGENTS.md protocol | ☐ |

  ---

  ## 5) COMPLETE STRUCTURE EXAMPLE
  ```ts
  /** 
   * @file invoices.ts
   * @description Aggregates invoice data, formats for Excel export, and returns file buffer.
   * @role Data layer node — bridges database reads and Excel generation.
   *
   * @pseudocode
   *  1. Fetch invoice rows for a given date range.
   *  2. Group results by client and store.
   *  3. Format each group into a structured worksheet.
   *  4. Generate XLSX buffer.
   *  5. Return buffer to calling service.
   *
   * @dependencies Supabase client, XLSX
   */

  import { db } from '$lib/server/db';

  /**
   * @function exportInvoices
   * @description Retrieves and formats invoice data within the provided date range.
   * @param {DateRange} range - Start and end boundaries for invoices.
   * @returns {Promise<Buffer>} XLSX file buffer.
   *
   * @behavior
   *  - Validate date range.
   *  - Query database for matching invoices.
   *  - Format results per client/store.
   *  - Generate and return XLSX file.
   *
   * @context
   *  Invoked by the admin dashboard’s export feature.
   */
  export async function exportInvoices(range) {
    // Validate range boundaries before querying
    if (!range?.start || !range?.end) throw new Error('Missing date range');
    const data = await db.getInvoices(range);
    return formatInvoice(data);
  }

  ```

  **Do not** include sensitive info; keep it high‑level and descriptive.

---

## Security & Privacy
- Never commit or log secrets; use `.env.local` and secret managers.  
- Redact tokens/emails/IDs at log source.  
- Validate and sanitize all input at boundaries (zod/valibot); encode outputs.  
- Enforce least‑privilege Supabase policies (RLS); service‑role keys only on server.

---

## Ambiguity
- Prefer the simplest design that satisfies **current** requirements.  
- If multiple options exist, note a brief rationale.  
- **Product/user instructions** take precedence over this doc.
