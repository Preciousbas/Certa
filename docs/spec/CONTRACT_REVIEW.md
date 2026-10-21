# Contract review — Ethereum Sepolia

Reviewed 21 Oct 2026 against `contracts/src/CertaEscrow.sol` and `contracts/src/EscrowFactory.sol`.

The factory at `0x4F4c6cc95465ceFe8a967E351EEdE69d40660423` is verified on Etherscan (Sepolia), solc `0.8.28+commit.7893614a`, optimizer 200, EVM Prague. The implementation argument is `0x7740796284Bf5eA67F30F123Ee28E5FFFA8CCa1c`. Etherscan's `getsourcecode` API returned "Missing/Invalid API Key", so the verified source was not downloaded into the repo. The public verified ABI matches `forge inspect` of the local source, including `InitParams` field order. Local source was not replaced and the factory was not redeployed.

Circle's Ethereum Sepolia USDC is `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (6 decimals). That is the address in `.env.example` (`USDC_ADDRESS`) and `packages/chain/src/abi.ts` (`USDC_SEPOLIA`).

The pilot escrow `0x5289dcc36EdC15AdC6314F75EcBFa745e70BD44d` sets client, consultant, and operator to the server wallet `0xa27b33393f461554500AADf575138544A3620615`. New escrows do not reuse that address for the client or the consultant. Four CDP accounts are required, and `assertRolesDistinct` throws `RolesNotDistinct` when any two match.

No finding below is a must-fix redeploy. Rounding, the missing signature nonce, and on-chain role collisions are recorded here and left on the deployed bytecode.

## InitParams

`createEscrow(CertaEscrow.InitParams)` on `EscrowFactory`. Field order:

| Field | Type |
|---|---|
| client | address |
| contractor | address |
| consultant | address |
| operator | address |
| admin | address |
| token | address |
| stageAmounts | uint256[] |
| retentionBps | uint16 |
| mobilisationAmount | uint256 |
| spendingCap | uint256 |
| termsHash | bytes32 |
| defectsPeriodSeconds | uint64 |
| projectId | bytes32 |

`admin` is the pause admin. The app sets it to the operator address. It is not one of the four role addresses checked for distinctness. `termsHash` is stored at initialize and is not an argument of `acceptTerms()`.

Stage indexes are 0-based. `fund(amount, upToStage)` with five stages uses `upToStage = 4`. Passing `5` reverts `StageOutOfRange`.

## Functions

State-changing:

| Function | Who |
|---|---|
| `initialize(InitParams)` | once, `initializer`. Factory calls it in the same transaction as `Clones.clone`. |
| `acceptTerms()` | client or contractor |
| `fund(uint256 amount, uint8 upToStage)` | client. `nonReentrant`, `whenNotPaused` |
| `releaseMobilisation()` | operator or client. `nonReentrant`, `whenNotPaused` |
| `submitStage(uint256 i, bytes32 evidenceHash)` | operator. `whenNotPaused` |
| `clientApprove(uint256 i)` | client. `whenNotPaused` |
| `clientApproveWithSig(uint256 i, uint256 deadline, bytes sig)` | operator or client, signature must be the client. `whenNotPaused` |
| `releaseStage(uint256 i)` | operator. `nonReentrant`, `whenNotPaused`. `CapExceeded` when `amount > spendingCap && !clientApproved` |
| `dispute(uint256 i, bytes32 reasonHash)` | client or contractor |
| `resolveDispute(uint256 i, uint16 payBps)` | consultant. `nonReentrant`, `whenNotPaused` |
| `resolveDisputeWithSigs(...)` | client or operator, both signatures. `nonReentrant`, `whenNotPaused` |
| `startDefectsPeriod()` | client or consultant |
| `releaseRetention()` | client or consultant. `nonReentrant`, `whenNotPaused` |
| `addVariation(...)` | anyone who presents both valid signatures. `whenNotPaused` |
| `refundUnfunded()` | client or operator. `nonReentrant`, `whenNotPaused` |
| `cancel()` | client. `nonReentrant`, `whenNotPaused` |
| `pause()` / `unpause()` | `PAUSER_ROLE` (the admin) |
| `receive()` | reverts `EthNotAccepted` |

Views and constants: `stageCount`, `expectedBalance`, `maxContractorReceivable`, `quoteFund`, `domainSeparator`, `hashClientApprove`, `hashVariation`, `hashResolve`, plus public getters for the state variables and `stages(uint256)`. `PAUSER_ROLE`, `BPS` (10000), `MAX_STAGES` (64).

Factory: `constructor(address implementation_)`, `createEscrow`, `escrowCount`, and public getters `implementation`, `allEscrows`, `escrowByProject`.

## Modifiers

`initializer` on `initialize`. `nonReentrant` on fund, releaseMobilisation, releaseStage, resolveDispute, resolveDisputeWithSigs, releaseRetention, refundUnfunded, cancel. `whenNotPaused` on those same functions plus submit, both client-approve paths, and addVariation. `dispute` is not paused. Access is `msg.sender` checks, not OpenZeppelin roles, except pause (`PAUSER_ROLE` / `DEFAULT_ADMIN_ROLE` granted to `admin`).

## Events

`Funded`, `StageSubmitted`, `StageReleased`, `StageDisputed`, `DisputeResolved`, `RetentionReleased`, `VariationAdded`, `MobilisationReleased`, `ClientApproved`, `TermsAccepted`, `Refunded`, `Cancelled`, `DefectsPeriodStarted`. Factory: `EscrowCreated`. Pause and unpause emit OpenZeppelin `Paused` / `Unpaused`.

## Errors

`ZeroAddress`, `ZeroAmount`, `BadBps`, `BadStageCount`, `EmptyTerms`, `SameParty`, `StageOutOfRange`, `AmountMismatch(uint256,uint256)`, `NotAuthorized`, `BadStatus`, `CapExceeded`, `AlreadyApproved`, `AlreadyMobilised`, `MobilisationNotFunded`, `TermsNotAccepted`, `BadSignature`, `SignatureExpired`, `DefectsPeriodActive`, `NothingToRelease`, `NothingToRefund`, `EvidenceRequired`, `EmptyReason`, `CancelledProject`, `FeeOnTransfer`, `EthNotAccepted`, `AlreadyStarted`. Factory adds `ProjectExists`.

## Checklist

- **Access control.** ✓ / note. Every state-changing function checks `msg.sender` or `PAUSER_ROLE`. `releaseStage` is operator-only and reverts `CapExceeded` when the gross stage amount is above the cap and that stage is not client-approved. The operator cannot release above the cap alone. At or under the cap the operator can release without an on-chain `clientApprove`. The product still requires the client's Approve tap before that call. `addVariation` has no caller role beyond the two signatures. Subcontractors are not a payee. `_pay` always sends to `contractor`. Direct subcontractor payment is a later contract change.
- **Re-entrancy.** ✓. Fund, release, refund, cancel, mobilisation, retention, and dispute resolution use `nonReentrant`. State is written before `SafeERC20` transfer. `submitStage` and `clientApprove` do not make external calls. `_pull` and `_pay` revert `FeeOnTransfer` if the balance change is not the amount.
- **Amount maths.** ✗ note, not redeployed. `_split` sets `retention = amount * bps / 10000` (rounds down) and pays the remainder to the contractor. The dust favours the contractor, not the escrow, by less than 1 unit per stage. Stage amounts are stored as given. There is no sum check against an off-chain contract sum. Mobilisation is a lump `releaseMobilisation`. It is not recovered from later stages. `advance_recovery` stays off-chain. No underflow: payout is `amount - retention` and retention is `<= amount` because bps is capped at 10000.
- **`fund(amount, upToStage)`.** ✓. `AmountMismatch` when `amount != quoteFund(upToStage)`. The quote is unpaid mobilisation (if any) plus `Pending` stages at indexes `0..upToStage`. A later fund skips stages that are no longer `Pending`. A quote of 0 reverts `ZeroAmount`, so funding cannot continue past the last pending stage in range.
- **`submitStage`.** ✓. Evidence hash must be non-zero (`EvidenceRequired`). Status must be `Funded` (`BadStatus`), so an unfunded stage cannot be submitted and a second submit fails.
- **Cap and approval.** ✓ / note. `releaseStage` reverts `CapExceeded` when `stage.amount > spendingCap && !stage.clientApproved`. Approval is per stage. `_approve` reverts `AlreadyApproved`, so it is single-use. `clientApproveWithSig` uses EIP-712 domain name `CertaEscrow`, version `1`, `chainId`, and `verifyingContract`. The type is `ClientApprove(bytes32 projectId, uint256 stage, uint256 deadline)`. There is no nonce. Replay on the same escrow hits `AlreadyApproved`. Replay on another clone hits `BadSignature` because the domain includes the verifying contract. A past deadline hits `SignatureExpired`.
- **Disputes.** ✓ / note. `dispute` is client or contractor, and only from `Funded` or `Submitted`. `releaseStage` then reverts `BadStatus`. `resolveDispute` is consultant-only. `resolveDisputeWithSigs` is client or operator and needs both signatures. The type is `ResolveDispute(bytes32 projectId, uint256 stage, uint16 payBps, uint256 deadline)`. No nonce. Resolution sets the stage to `Released`, so a replay hits `BadStatus`. `payBps` splits the stage between contractor payout and a refund to the client.
- **Variations.** ✓. Both signatures are required. The hash includes `variationNonce`, which increments. The call appends a new `Pending` stage. It does not edit `releasedAmount` on an earlier stage.
- **Retention and refunds.** ✓. `releaseRetention` reverts `DefectsPeriodActive` until `startDefectsPeriod` has run and `block.timestamp >= defectsPeriodEnd`. `refundUnfunded` returns `Funded` stages to the client and does not refund mobilisation. `cancel` (client) also refunds unreleased mobilisation. `Pending` stages were never pulled, so they have nothing to refund.
- **Events.** ✓. Each state change listed above emits. Reconciliation matches `StageReleased`, `Funded`, `EscrowCreated`, `StageDisputed`, `DisputeResolved`, and `RetentionReleased`.
- **Factory.** ✓ / note. The implementation constructor calls `_disableInitializers()`, so the implementation cannot be initialized. `createEscrow` clones and calls `initialize` in the same transaction, so the initializer cannot be front-run. A second `initialize` reverts. `projectId` must be non-zero and unique (`ProjectExists`). On-chain, only `client != contractor` is enforced (`SameParty`). Consultant, operator, and admin may collide with each other or with the client. Distinctness of the four product roles is enforced in `src/server/chain/wallets.ts` before `createEscrow`.
- **Pause.** ✓. `pause` and `unpause` exist and are limited to `PAUSER_ROLE`. No further emergency mechanism is proposed for this deploy.

## Slither

`slither . --exclude-dependencies` (slither-analyzer 0.11.6) analyzed 19 contracts with 102 detectors and reported 12 results. No high findings.

Medium:

- `locked-ether` on `CertaEscrow.receive`. The function reverts `EthNotAccepted`, so ether cannot be deposited and there is nothing to withdraw. Not a defect.
- `reentrancy-no-eth` on `EscrowFactory.createEscrow`. `initialize` is called on a fresh clone in the same transaction. `initialize` writes storage and grants roles. It does not call back into the factory, and the implementation constructor disables initializers. The registry write after `initialize` is not reachable from the clone. Not exploited. Not a redeploy.

Low, and not changed: `reentrancy-benign` and `reentrancy-events` on the same factory call (the array push and `EscrowCreated` follow `initialize`), and `timestamp` on signature deadlines and the defects period. Those timestamps are the deadline and the defects clock.

Informational or optimization: mixed pragmas are OpenZeppelin `^0.8.20` beside our `0.8.28`, and two loops read `stages.length` from storage. Neither is a defect.
