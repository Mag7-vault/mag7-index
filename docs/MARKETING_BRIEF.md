# MAG7 Index Vault — Marketing and Communications Brief

**Document status:** Pre-launch working brief  
**Audience:** Founders, marketing, partnerships, community, and content teams  
**Product status:** Tested pre-production software. Not deployed for public deposits and not independently audited.

## 1. Executive summary

MAG7 Index Vault is an on-chain basket product being built for Robinhood Chain.
It is designed to let a user deposit USDG, receive ERC-4626 vault shares, and
gain exposure to a managed basket of tokenized US equities through one position.

The launch version currently targets five tokenized equities with compatible
Voxelithic v3 liquidity:

- NVIDIA (NVDA)
- Apple (AAPL)
- Tesla (TSLA)
- Alphabet (GOOGL)
- Amazon (AMZN)

The vault is designed to keep at least 20% of its net asset value in USDG after
rebalancing, while the remainder can be allocated across the basket. Prices and
trading routes are supplied through an off-chain keeper using Voxelithic's live
infrastructure, with on-chain limits and emergency controls.

This is not yet a live investment product. Marketing before external audit and
mainnet approval must use **waitlist, education, product-development, and
testnet-demo language only**.

## 2. Positioning

### One-line description

> One USDG deposit. One vault share. A managed basket of tokenized market leaders on Robinhood Chain.

### Short pitch

> MAG7 Index Vault is building a simpler way to access a diversified basket of
> tokenized US equities on-chain. Users deposit USDG into a transparent ERC-4626
> vault, receive vault shares, and let the protocol handle basket allocation and
> rebalancing through Voxelithic liquidity.

### Positioning statement

For on-chain users who want a simpler alternative to sourcing and managing
several tokenized equities individually, MAG7 Index Vault combines basket
exposure, transparent vault accounting, scheduled rebalancing, liquidity
reserves, and emergency exits in one Robinhood Chain product.

## 3. The customer problem

Managing a tokenized-equity portfolio on-chain can require a user to:

- discover which assets and pools are actually available;
- make several separate swaps;
- calculate allocations manually;
- monitor price and portfolio drift;
- rebalance multiple positions over time; and
- manage liquidity when exiting.

MAG7 Index Vault is designed to package those operations behind one vault share
while keeping the accounting and contract activity visible on-chain.

## 4. How the product works

1. A user deposits USDG into the vault.
2. The vault mints ERC-4626 shares representing the user's proportional claim.
3. A keeper posts current pricing data and constructs reviewed Voxelithic routes.
4. The vault allocates capital across the configured basket while retaining at
   least 20% of NAV in idle USDG after rebalancing.
5. A holder can redeem within available USDG liquidity or use the in-kind exit
   to receive their proportional USDG and basket tokens directly.

The default launch configuration is intentionally conservative:

- static equal weighting;
- permissionless rebalancing disabled;
- market-cap weighting disabled;
- deposits initially closed with a zero cap;
- Safe multisig governance behind a minimum 48-hour timelock; and
- a separate guardian able to pause deposits and rebalancing during incidents.

## 5. Product strengths

### Simpler basket access

One vault position replaces the operational burden of acquiring and maintaining
several individual tokenized-equity positions.

### Transparent accounting

Vault shares follow the ERC-4626 standard, and holdings, supply, governance
actions, and contract transactions can be inspected on-chain.

### Deliberate liquidity management

The vault enforces a 20% idle-USDG reserve after rebalancing. It also exposes
honest immediate-withdrawal limits instead of presenting the entire portfolio as
instantly redeemable in USDG.

### Multiple exit paths

Standard redemptions use available USDG. For larger exits, the keeper can sell
basket assets back into USDG. An in-kind redemption remains available without
depending on fresh prices or keeper availability.

### Staged governance

The production design separates deployment, oracle, and rebalance roles. Major
configuration changes are intended to pass through a Safe-controlled timelock,
with an immediate pause mechanism for incident response.

### Built for gradual launch

The deployment process begins with deposits closed, then uses a small canary cap
and staged increases only after operational checks and soak periods.

## 6. Important basket wording

The launch product must **not** be marketed as holding all seven "Magnificent
Seven" equities.

The current v1 basket contains five assets: NVDA, AAPL, TSLA, GOOGL, and AMZN.
MSFT is not currently available in the Voxelithic token list, and META currently
requires v4 routing that v1 does not support.

Approved wording:

- "A Mag7-style basket of five tokenized market leaders."
- "The launch basket targets NVDA, AAPL, TSLA, GOOGL, and AMZN."
- "Designed to expand as compatible assets and routes become available."

Avoid:

- "Own the Magnificent Seven in one token."
- "Full Mag7 exposure."
- "Tracks the official Magnificent Seven index."

## 7. Target audiences

### Primary

- Robinhood Chain users who already hold or transact in USDG;
- on-chain users interested in tokenized-equity exposure;
- users who prefer a basket position over managing individual assets; and
- early adopters comfortable participating in a controlled canary launch.

### Secondary

- Robinhood Chain ecosystem partners;
- tokenized-asset communities;
- DeFi analysts and educators;
- wallet, dashboard, and infrastructure partners; and
- builders interested in ERC-4626 composability.

## 8. Core messaging pillars

### One deposit, diversified basket

Communicate simplicity: users interact with one vault instead of manually
building and maintaining several positions.

### Visible on-chain

Communicate verifiability: assets, shares, governance actions, and vault state
are inspectable on-chain.

### Liquidity claims that match reality

Communicate that the vault reserves USDG for ordinary redemptions and publishes
only the amount immediately available. Never describe all NAV as instantly
liquid.

### Designed with escape routes

Communicate the standard, keeper-assisted, and in-kind exit options without
calling any exit guaranteed or risk-free.

### Controlled launch

Communicate the audit-first, zero-cap, Safe/timelock, canary, monitoring, and
staged-cap process as the launch plan—not as work already completed.

## 9. Approved pre-launch claims

Marketing may currently say:

- "MAG7 Index Vault is being built on Robinhood Chain."
- "The contracts use the ERC-4626 tokenized-vault standard."
- "The current launch basket targets five tokenized US equities."
- "The code includes a 20% post-rebalance USDG reserve requirement."
- "The design includes standard and in-kind redemption paths."
- "Mainnet deployment is designed to start with deposits closed."
- "The codebase has automated contract, invariant, keeper, and live-fork tests."
- "The project is preparing for independent review and a staged canary launch."

Every public status statement should include a nearby qualifier such as:

> Pre-launch software. Not yet independently audited or open for public deposits.

## 10. Claims that are not approved yet

Do not currently claim:

- the vault is live or available for deposits;
- the product is audited, audit-approved, safe, secure, or risk-free;
- returns, yield, profit, price appreciation, or capital protection;
- guaranteed liquidity or guaranteed redemption into USDG;
- exact tracking of an official stock index;
- ownership of the underlying public-company shares;
- regulatory approval, licensing, or legal availability in any jurisdiction;
- an official partnership with Robinhood, Voxelithic, any listed company, or any
  token issuer unless there is written authorization; or
- that historical tests predict future performance.

Any language involving "investment," "fund," "ETF," "shares," "stock
ownership," expected returns, or jurisdictional availability must be reviewed by
qualified legal counsel before publication.

## 11. Ready-to-use website copy

### Hero

**A simpler route to an on-chain basket of market leaders.**

Deposit USDG, receive one transparent vault share, and access a managed basket
of tokenized US equities on Robinhood Chain.

**Primary CTA:** Join the waitlist  
**Secondary CTA:** Explore how it works

Pre-launch software. Not yet independently audited or open for public deposits.

### Three feature cards

**One vault position**  
Access five tokenized market leaders without manually building and maintaining
each allocation.

**Transparent by design**  
ERC-4626 accounting and on-chain holdings make the vault's state independently
inspectable.

**Multiple exit options**  
Use available USDG liquidity, keeper-assisted liquidity restoration, or a
proportional in-kind redemption.

### How-it-works section

**Deposit USDG** → **Receive vault shares** → **Basket is rebalanced** →
**Monitor or redeem your position**

### Basket section

The planned v1 basket targets equal exposure to NVDA, AAPL, TSLA, GOOGL, and
AMZN tokenized assets, subject to route availability and final launch approval.

## 12. Ready-to-use social copy

### Launch teaser

> One deposit. One vault share. Five tokenized market leaders.
>
> MAG7 Index Vault is building a simpler basket experience for Robinhood Chain—
> with transparent ERC-4626 accounting, controlled rebalancing, a USDG liquidity
> reserve, and multiple exit paths.
>
> Pre-launch. Waitlist and technical preview coming soon.

### Product explainer

> Building a tokenized-equity basket manually means finding routes, making
> multiple swaps, calculating weights, and rebalancing over time.
>
> MAG7 Index Vault is designed to package that workflow into one on-chain vault
> share backed by a planned five-asset launch basket.
>
> Pre-launch software—not yet open for public deposits.

### Safety-process post

> We are taking a staged path to launch: independent review, deposits closed by
> default, Safe + timelock governance, a small canary cap, live monitoring, and
> gradual cap increases.
>
> Tests are one layer of preparation—not a guarantee and not a substitute for an
> independent audit.

## 13. Frequently asked questions

### Is MAG7 Index Vault live?

No. It is currently pre-launch and is not open for public deposits.

### Does the launch basket contain all seven Magnificent Seven companies?

No. The planned v1 basket currently contains five compatible tokenized assets:
NVDA, AAPL, TSLA, GOOGL, and AMZN. Expansion depends on compatible asset and
routing availability.

### What do users receive after depositing?

Users receive ERC-4626 vault shares representing a proportional claim on the
vault's assets.

### Is the entire position instantly redeemable into USDG?

Not necessarily. The design keeps at least 20% of NAV in idle USDG after
rebalancing for ordinary exits. Larger USDG redemptions can require the keeper
to sell basket assets first. Holders can also use the proportional in-kind exit.

### How are prices determined?

A separate keeper reads Voxelithic quotes off-chain and posts prices to the
vault's PriceOracle. Price reads have staleness limits. This keeper-posted oracle
is an important trust assumption and should be disclosed clearly.

### Who controls the vault?

The production plan uses a Safe multisig behind a minimum 48-hour timelock for
governance changes, separate keeper roles for prices and rebalancing, and an
incident-response guardian that can pause deposits and rebalancing.

### Has it been audited?

Not yet by an independent professional auditor. The repository includes an
audit handoff package and internal remediation work, but that must not be
described as independent audit approval.

### What are the main risks?

Risks include smart-contract defects, keeper or oracle failure, incorrect or
stale prices, external router or pool failure, liquidity shortfalls, tokenized-
asset issuer risk, blockchain risk, governance/key compromise, and regulatory
uncertainty. The product can lose value.

## 14. Suggested launch communications sequence

### Phase 1 — Build in public

- Publish the product thesis and waitlist.
- Explain the planned five-asset basket accurately.
- Share educational content about ERC-4626, tokenized assets, and basket
  rebalancing.
- Demonstrate testnet mechanics without implying real-market execution.

### Phase 2 — Independent review

- Announce that the review has started only after engagement is confirmed.
- Publish findings and remediation status when appropriate.
- Do not use "audited" until the final report is delivered and its scope is
  disclosed.

### Phase 3 — Mainnet canary

- Publish verified contract addresses.
- Clearly label the initial deposit cap and canary status.
- Share observable health metrics and incident channels.
- Avoid broad launch language while access remains limited.

### Phase 4 — Public availability

- Announce wider access only after governance handover, monitoring, redemption
  tests, canary soak, and explicit internal go/no-go approval.
- Keep risk disclosures and supported-jurisdiction restrictions visible.

## 15. Marketing assets still needed

- Final brand name, visual identity, and approved logo system
- Landing page and waitlist
- Product diagram and short explainer animation
- Testnet demo recording
- Public risk-disclosure page reviewed by counsel
- Terms of use and privacy policy
- Independent audit report and remediation links
- Verified mainnet contract-address page
- Live vault dashboard for NAV, holdings, prices, liquidity buffer, and status
- Incident/status page and official support channels
- Partnership permissions before using third-party logos

## 16. Marketing readiness checklist

Before publishing any campaign, confirm:

- [ ] The stated basket matches the current contract configuration.
- [ ] Product status says pre-launch, canary, or live accurately.
- [ ] No copy promises returns, safety, liquidity, or capital protection.
- [ ] No unapproved partnership or trademark implication appears.
- [ ] Risk disclosure is visible and understandable.
- [ ] Any contract addresses are checksummed and independently verified.
- [ ] Audit language names the auditor, scope, commit, and final status exactly.
- [ ] Legal counsel has approved financial-product and jurisdictional language.
- [ ] The CTA matches availability: waitlist before launch, not "Deposit now."

---

This brief is a communications document, not legal, investment, tax, or
regulatory advice. Final public materials require legal review for each intended
market and distribution channel.
