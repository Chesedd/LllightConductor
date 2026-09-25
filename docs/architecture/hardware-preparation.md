# Hardware preparation

The desktop pipeline deliberately has two pure stages:

`Project / Score v1 → Runtime Compiler → CompiledShowV1 → Hardware Preparation → PreparedShowBundleV1`

Compilation remains transport-neutral. Its transitions retain stable channel and slave IDs, the slave logical address, the human/hardware-facing `hardwareOutputIdentifier`, and state. Preparation receives both the current `Project` and that compiled snapshot. It resolves each stable channel ID to the separately configured numeric `protocolOutputId`; it never parses or infers a number from `hardwareOutputIdentifier`.

## Project V3 mapping

Project schema V3 adds optional `protocolOutputId` to each output channel. The association therefore follows the channel's stable ID through rename and topology reorder and is naturally removed with the channel. It is persisted in `.lightshow`, is editable in the Channel Inspector, and is not device discovery or connection state.

An ID must be an integer from 0 through 255 and must be unique within one Pico. The same ID on different Picos is valid. **Auto Assign Output IDs** deliberately replaces every mapping on one Pico with `0, 1, 2, …` in current topology order as one history transaction. It does not inspect GPIO labels. More than 256 channels is rejected.

V1 projects still migrate through V2 semantics; V2 projects open as V3 aggregates with every mapping unset. Opening never writes the file. A subsequent Save writes schema V3, so users must explicitly configure old projects.

## Validation and stale snapshots

Preparation is all-or-nothing. It verifies current masters, costumes, slaves, addresses, channels, channel ownership, explicit mappings, states, timestamps, and Runtime Score versions. The transition's compiled slave address and `hardwareOutputIdentifier` must still match the current channel. A mismatch is reported instead of silently applying an old compiled artifact. UI domain edits invalidate both artifacts; compiling again invalidates the former prepared artifact. Save, playback, seek, and zoom do not.

Prepared frames are sorted by time, batches by slave address, and updates by output ID. Empty frames are omitted; empty masters retain the compiled duration and an empty frame list. Each batch maps to one Protocol v1 `SET_OUTPUTS`, so 1–31 updates are accepted and a larger simultaneous group is rejected rather than split. Address 255 remains reserved.

Preparation only creates an in-memory diagnostic artifact. Serial/USB discovery, upload framing, real execution, and synchronization remain outside this layer.

## Version boundary

The independently versioned layers are: Project schema **3**, authoring Score **1**, Runtime Score **1**, Prepared Show **1**, and Pico Protocol **1**.
