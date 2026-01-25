# Creator Royalty & Revenue Split Engine

A Clarity smart contract for automated, trustless revenue splitting on the Stacks blockchain.

## Overview

No NFTs — just better revenue management. Content creators define revenue splits, payments are auto-distributed, and there are no middleman disputes.

**Perfect for:**
- ✔ Music labels & artist collaborations
- ✔ Film & video production projects
- ✔ Digital publishers & content platforms

## Features

- **Trustless Splitting** - No intermediaries, payments split automatically on-chain
- **Flexible Configuration** - Up to 10 recipients per project
- **Precision Shares** - Basis-point accuracy (100 = 1%, 10000 = 100%)
- **Pull Withdrawals** - Recipients claim earnings on their own schedule
- **Full Transparency** - All splits and earnings visible on-chain

## Contract Functions

### Public Functions

| Function | Description |
|----------|-------------|
| `create-project` | Create a new revenue-sharing project |
| `add-recipient` | Add a collaborator with their percentage share |
| `pay-project` | Pay into a project (automatically splits to all recipients) |
| `withdraw` | Claim your pending earnings |
| `update-recipient-share` | Modify a recipient's share percentage |
| `deactivate-project` | Disable a project (owner only) |

### Read-Only Functions

| Function | Description |
|----------|-------------|
| `get-project` | Get project details |
| `get-recipient` | Get recipient info at index |
| `get-recipient-count` | Get number of recipients in a project |
| `get-pending-withdrawal` | Check claimable amount for a recipient |
| `get-project-count` | Get total number of projects created |
| `calculate-split` | Calculate split amount for a given payment |
| `validate-splits` | Verify all shares sum correctly |

## Usage Example

```clarity
;; 1. Create a new project
(contract-call? .royalty create-project "Summer Album 2024" "Collaborative EP with 3 artists")

;; 2. Add recipients with their shares (in basis points: 5000 = 50%)
(contract-call? .royalty add-recipient u1 'SP1ARTIST... u5000 "Lead Artist")
(contract-call? .royalty add-recipient u1 'SP2PRODUCER... u3000 "Producer")
(contract-call? .royalty add-recipient u1 'SP3LABEL... u2000 "Record Label")

;; 3. Anyone can pay into the project (streaming platforms, fans, etc.)
(contract-call? .royalty pay-project u1 u1000000) ;; 1 STX

;; 4. Each recipient withdraws their share when ready
(contract-call? .royalty withdraw u1)
```

## How It Works

1. **Project Creation** - A creator sets up a project with a name and description
2. **Add Recipients** - The project owner adds collaborators with their percentage shares
3. **Receive Payments** - Anyone can pay into the project (platforms, fans, clients)
4. **Auto-Distribution** - Payments are automatically credited to each recipient based on their share
5. **Withdraw Earnings** - Recipients withdraw their accumulated earnings whenever they want

## Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| u100 | `ERR-NOT-AUTHORIZED` | Caller is not authorized for this action |
| u101 | `ERR-PROJECT-NOT-FOUND` | Project does not exist |
| u102 | `ERR-INVALID-SPLITS` | Invalid share percentage |
| u103 | `ERR-PROJECT-EXISTS` | Project already exists |
| u104 | `ERR-NO-RECIPIENTS` | Project has no recipients configured |
| u105 | `ERR-INVALID-AMOUNT` | Invalid payment amount |
| u106 | `ERR-RECIPIENT-NOT-FOUND` | Recipient not found |
| u107 | `ERR-MAX-RECIPIENTS` | Maximum recipients (10) reached |

## Development

### Prerequisites
- [Clarinet](https://github.com/hirosystems/clarinet) for local development and testing

### Testing
```bash
clarinet test
```

### Deployment
```bash
clarinet deploy --network testnet
```

