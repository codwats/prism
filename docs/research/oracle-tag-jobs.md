# Oracle-tag jobs for the Swap Planner

Resolves [Which oracle tags count as a similar job?](https://github.com/codwats/prism/issues/287). Source: Scryfall Oracle Tags bulk file (`jsonl_download_uri`), pulled 2026-09-26. Tags are a hidden ranking signal only (#278).

## Rules

- **Job** = one allowlisted tag plus its rolled-up subtree (`child_ids`), minus that job's pruned tags. Pin by UUID; the slug is a comment. A UUID missing from the day's file is skipped with a `console.warn`, never an error.
- **Same-type stage:** a candidate qualifies if it shares **any** job with the incoming card. Rank by job overlap (|A∩B| / |A∪B|), then by closest mana value. Same-type cards with no shared job collapse into "N more… doing a different job".
- **Look beyond <type>:** a candidate of another main type qualifies only if it carries **every** job of the incoming card. Rank by the same overlap.
- **No jobs on the incoming card:** fall back to type + mana value (prototype behaviour); "Look beyond" is hidden.
- **Deny list:** only prunes children out of an allowlisted job's subtree, per job. There is no global blocklist; unlisted tags (`meme`, `evasion`, cycle tags…) never enter.
- **Lands:** never matched by jobs. Land vs land, ranked by color identity overlap, then a shared land-family tag (shockland, fetchland, rainbow-land, utility-land…) as the tiebreaker. Lands never appear in "Look beyond".

## Allowlist (51 jobs)

### Ramp

| Job (slug) | UUID |
|---|---|
| `land-ramp` | `8e3bf407-28b7-49ab-83d5-5a9c46b1cd79` |
| `mana-rock` | `523a4f29-25ee-483c-8123-a8e62b62af5a` |
| `mana-dork` | `bb6c0ff7-302d-48ff-aee9-5cfefd44e351` |
| `ritual` | `e6ca4e8a-7261-4e96-afb0-9b07777b2481` |
| `cost-reducer` | `1a8e9788-b694-4330-a1a4-1aed6183bd57` |
| `extra-land` | `88e643b3-9fd4-4f46-9f36-cb1a72a7bc3c` |

### Tutors

| Job (slug) | UUID |
|---|---|
| `tutor-land` | `cc2644e4-57c6-46f7-a69c-0cd82dbf2e9d` |
| `tutor-card` | `f95a613c-8d77-42a9-ae4c-962ee0667f76` |
| `tutor-creature` | `23fd5e7c-3ddc-49b0-818f-bd5fabb04d8f` |
| `tutor-artifact` | `1c3fd051-4c17-4458-ba48-6171b1c968c2` |
| `tutor-enchantment` | `7754d888-a2b0-414a-9ab1-fde7f11d519f` |
| `tutor-instant` | `a8ff6096-c1cf-4947-8624-e880af7ba5ab` |
| `tutor-sorcery` | `f195348a-8bef-40fe-9ba2-0a88b264f756` |

### Interaction

| Job (slug) | UUID |
|---|---|
| `removal-creature` | `d91e421d-ff87-4aad-a4bf-5aefc51252b6` |
| `removal-artifact` | `ea1ae714-3500-481b-9bdd-f33c57db8678` |
| `removal-enchantment` | `ecee5d4b-f573-4ec8-b918-ad134873005e` |
| `removal-planeswalker` | `591fb358-e9d7-490e-8c15-24aecbbe697e` |
| `removal-land` | `d2a563f5-66f7-442c-91cd-3e8b6c0fc0c5` |
| `sweeper` | `3fb7e4fd-5304-4120-b7c4-8a89f70ad3f0` |
| `counterspell` | `690fc968-48ba-4854-a948-3db6bf19d3a9` |
| `hate-graveyard` | `486b89e1-bd1c-4cbc-8aaf-5e9249478650` |
| `theft` | `3404c16e-d708-492a-8c0f-27bb388e4cc8` |
| `threaten` | `5befdcad-c325-4c57-8e69-bf90a3fe19a8` |
| `tapper` | `486472f8-d4cd-4f88-ae7c-bb01e08cdd9d` |
| `tax` | `2ffad104-2092-410d-9a71-080c57b2e8c5` |
| `pillowfort` | `0387216a-0e23-47fb-a71d-7029f36dbf4e` |
| `fog` | `a99e6bbe-59cc-41a0-96a9-2b462e673c89` |

### Cards

| Job (slug) | UUID |
|---|---|
| `draw-engine` | `0e87cf9c-591e-4f2a-b4fd-675021f120ae` |
| `burst-draw` | `333eca4b-cd56-41b5-b250-b3a711e501c1` |
| `impulsive-draw` | `78844aa5-9575-4bed-81c1-3330b5c56299` |
| `loot` | `1c2215a5-d782-4f1b-a223-2bbd26c1f532` |
| `rummage` | `dd8b138e-0261-4f35-bac0-e2a931abd96f` |
| `wheel` | `6d7e2d11-3378-4972-a40f-0cfc34b1a806` |

### Recursion

| Job (slug) | UUID |
|---|---|
| `reanimate` | `524d7da0-9b4b-4567-bf38-a867673e21f3` |
| `regrowth` | `efbbede8-8f54-4392-82a7-62ad84528aeb` |

### Protection

| Job (slug) | UUID |
|---|---|
| `protects-creature` | `7d4c079e-5fb5-487c-bb38-769d06ce1e2b` |
| `flicker-creature` | `7dca665f-435d-49f2-8974-d225fa0a8a42` |

### Other

| Job (slug) | UUID |
|---|---|
| `sacrifice-outlet` | `c7bd55a7-1ea0-49da-b25e-0be470fbe8ec` |
| `lifegain` | `4caab3cc-1d60-44fb-a26a-cc833bc67c97` |
| `burn-player` | `081ebf89-e53b-47ff-88e8-1535068212b0` |
| `discard` | `fce2f2c1-bb65-45e8-8c0a-dd66093067d7` |
| `mill-self` | `bcae5f6a-f68b-4217-8f6c-0b4d31abd045` |
| `mill-opponent` | `514b336c-7e68-465e-874f-e3de89dbbb53` |
| `anthem` | `0454fcef-0118-4f10-b9d7-c071845bfbd4` |
| `untapper` | `524690dc-32c2-4b32-b94a-482585d087cd` |
| `clone` | `8873d737-51bf-416b-8124-9db521e00541` |
| `copy-spell` | `cd853464-fcf5-4328-8170-fd51d0dba1f1` |
| `extra-turn` | `03b17ebf-f5d3-4063-bfd4-1ae156a16a8f` |
| `extra-combat-phase` | `b0fb4bcb-d667-4799-9eee-7071c69bcd55` |
| `repeatable-token-generator` | `a9657a5d-e7f8-4000-a795-7a78b5fb8923` |
| `combat-trick` | `36f2a0d4-b689-4011-9750-472dd786f2de` |
| `gives-evasion` | `6cdeab4c-72a6-4f40-ab19-14284d6cf775` |
| `alternate-win-condition` | `67db1fb0-26bd-49a0-9766-84ed4069dbdd` |

### Deny list (per-job subtree pruning)

| Job | Pruned tag | Pruned UUID | Why |
|---|---|---|---|
| `tutor-land` | `take-the-initiative` | `f3cdad26-6def-42eb-80c7-1f15f130b111` | Undercity room, not a land tutor |
| `removal-creature` | `burn-self` | `ec095f01-e8cc-4d20-858d-d9057fc8cad3` | damages its own controller |
| `theft` | `reanimate-from-any` | `da769041-6c73-40c7-866f-92163e23ccc3` | reanimation, not theft (made Threaten comparable to Reanimate) |
| `theft` | `reanimate-from-opponent` | `54d0706a-a865-4c79-b8ba-12df4388c4c0` | same |
| `regrowth` | `pwdeck-tutor` | `bb7f3c65-306e-4bfe-8ceb-8e7795f87c81` | planeswalker-deck product quirk |
| `reanimate` | `crucible-of-worlds` | `9ef8a6a5-ebdc-4f81-9363-d5169c9225ac` | land recursion, not reanimation |
| `untapper` | `untaps-self` | `41950283-23da-4142-815c-8371cd718310` | self-untap, not an untapper |
| `gives-evasion` | `the-ring-tempts-you` | `076a51bc-9f68-43fa-af4c-696266e9001e` | its own mechanic, not granted evasion |

## Spot check

Staples pool of ~120 cards, rules above:

| Incoming | Same type (top) | Look beyond |
|---|---|---|
| Skyshroud Claim | Explosive Vegetation, Cultivate, Kodama's Reach, Rampant Growth… | Sakura-Tribe Elder, Wood Elves, Farhaven Elf, Harrow, Path to Exile, Settle the Wreckage |
| Ephemerate | Cloudshift, Heroic Intervention, Teferi's Protection… | Restoration Angel |
| Rhystic Study | Mystic Remora, Phyrexian Arena, Sylvan Library, Guardian Project, Smothering Tithe | Esper Sentinel |
| Swords to Plowshares | Doom Blade, Go for the Throat, Infernal Grasp… | — |
| Arcane Signet | Fellwar Stone, Mind Stone, Thought Vessel, Talisman… (altars last) | — |
| Beast Within | Generous Gift, Chaos Warp, Assassin's Trophy… | Vindicate |
| Reanimate | Victimize | Animate Dead, Necromancy |
| Toxic Deluge | Wrath of God, Damnation, Blasphemous Act… | Settle the Wreckage, Cyclonic Rift |
| Counterspell | Arcane Denial, Negate, Swan Song, Fierce Guardianship, Mana Drain | — |

Gamble and Season of the Bold no longer match Skyshroud Claim; Swiftfoot Boots and Lightning Greaves no longer match Ephemerate. Known leftover: Path to Exile and Settle the Wreckage stay in Skyshroud Claim's "Look beyond" (they are tagged land-ramp because they ramp the opponent), ranked last by overlap.
