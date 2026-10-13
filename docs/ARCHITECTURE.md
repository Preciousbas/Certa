# Architecture

Certa is a Telegram site engineer. A subcontractor photographs the work. The app checks the photo, an assessor recommends a contract stage, and USDC moves out of that project's escrow only after the checks in the contract pass.

## System

```mermaid
flowchart LR
  subgraph telegram [Telegram]
    Bot[grammY bot]
    Mini[Next.js Mini App]
  end
  subgraph web [apps/web on Vercel]
    Hook["/api/telegram"]
    Paid["/api/paid/*"]
    Jobs[Inngest crons]
  end
  subgraph data [packages]
    DB[(Postgres or PGlite)]
    AI[packages/ai]
    PDF[packages/pdf]
    Chain[packages/chain]
  end
  Escrow[CertaEscrow clone on Base Sepolia]
  USDC[Circle test USDC]

  Bot --> Hook
  Mini --> web
  Hook --> DB
  Mini --> DB
  web --> AI
  web --> PDF
  Chain --> Escrow
  Escrow --> USDC
  Jobs --> DB
  Paid --> USDC
```

Money is stored as integers. Naira is kobo. USDC is 6-decimal base units. The locked rate lives on the project. The contract only sees USDC.

## Submit, assess, release

```mermaid
sequenceDiagram
  participant Sub as Subcontractor
  participant App as Mini App
  participant DB as Postgres
  participant AI as Assessor
  participant Op as Operator
  participant Escrow as CertaEscrow

  Sub->>App: Live camera capture plus nonce and GPS
  App->>DB: Photo checks and stamped copy
  App->>AI: Photos, stage list, prior submissions
  AI-->>DB: stage_index, confidence, decision
  Note over AI,Escrow: The model never sends a transaction
  alt confidence at least 0.85 and amount at or under the cap
    Op->>Escrow: submitStage then releaseStage
  else amount over the cap
    Op->>Escrow: releaseStage only after clientApprove
  else confidence under 0.85
    DB-->>Sub: Held for the consultant or more photos
  end
  Escrow-->>DB: StageReleased event is the payment status
```

The indexer that reconciles those events is specified and not running yet. Payment rows are written with a unique idempotency key. A demo fund records the row without broadcasting a transaction.

## Contract state machine

Each stage starts `Pending`. `fund` moves the quoted stages to `Funded`. `submitStage` moves one to `Submitted` and stores the evidence hash. `releaseStage` pays `amount - retention` to the contractor and leaves the stage `Released`. `dispute` locks a submitted stage. `resolveDispute` splits that stage by basis points. `cancel` refunds funded stages that are not submitted or disputed.

```mermaid
stateDiagram-v2
  [*] --> Pending
  Pending --> Funded: fund exact quote
  Funded --> Submitted: operator submitStage
  Submitted --> Released: releaseStage
  Submitted --> Disputed: client or contractor
  Disputed --> Released: resolveDispute
  Funded --> Cancelled: cancel or refundUnfunded
  Pending --> Cancelled: cancel
```

`releaseStage` reverts unless the stage is `Submitted`, the project is not paused, and an above-cap stage has `clientApproved`. A failed inspection leaves the USDC locked.

## Tenancy

Every tenant table carries `workspace_id`. Requests set `app.current_user_id` and `app.current_workspace_id`, then `SET LOCAL ROLE certa_app`. Row level security is forced for that role. `authorize()` in `packages/db` is the application gate and runs even when the database role could bypass RLS. A subcontractor sees their own stages. A main contractor sees subcontractors only when `can_view_subs` is set.
