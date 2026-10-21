# CDP operator policy

The operator account is a CDP server wallet named `certa-<env>-operator-<hash>`. It submits evidence and sends releases. It is not the client and it is not the consultant.

`packages/chain/src/accounts.ts` builds this account policy. `ensureOperatorPolicy` creates or updates it by the description below and attaches it with `evm.updateAccount`. Escrow clones do not exist when the policy is first written, so the allowlist has to be updated after each `createEscrow` (factory, USDC, and that escrow). If CDP rejects the policy, the call returns `applied: false` and no transaction is described as protected by it.

Network fees are sent by the treasury account (`purpose = treasury`), not by the operator. The operator rule rejects any transaction with ETH value above 0, so the operator cannot be the fee source.

```json
{
  "scope": "account",
  "description": "Certa operator may call the factory, project escrows, and USDC only",
  "rules": [
    {
      "action": "reject",
      "operation": "signEvmTransaction",
      "criteria": [{ "type": "ethValue", "ethValue": "0", "operator": ">" }]
    },
    {
      "action": "reject",
      "operation": "signEvmTransaction",
      "criteria": [{ "type": "evmAddress", "addresses": ["<factory>", "<usdc>", "<escrow clones>"], "operator": "not in" }]
    }
  ]
}
```

There is no per-transaction USDC maximum in this policy. CDP's account-policy criteria used here are `ethValue` and `evmAddress`. A token-amount cap would be a later policy once the engine exposes an ERC-20 value criterion for this account. The on-chain spending cap remains the cap on `releaseStage`.
