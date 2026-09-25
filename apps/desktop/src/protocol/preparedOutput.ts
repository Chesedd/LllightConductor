import type { RuntimeState, RuntimeTransition } from '../runtime/runtimeScore';

/** A transport-ready target produced after explicit, device-specific output mapping. */
export interface PreparedOutputUpdate {
  slaveAddress: number;
  outputId: number;
  state: RuntimeState;
}

export interface PreparedMasterFrame {
  timeMs: number;
  updates: PreparedOutputUpdate[];
}

export type RuntimeOutputMapping = ReadonlyMap<string, number>;

/**
 * Resolves an authoring hardware identifier through an explicit mapping. Identifiers are
 * deliberately opaque: `"15"` is not implicitly converted to numeric output ID 15.
 */
export function prepareOutputUpdate(transition: RuntimeTransition, mapping: RuntimeOutputMapping): PreparedOutputUpdate {
  const outputId = mapping.get(transition.hardwareOutputIdentifier);
  if (outputId === undefined) throw new Error(`No protocol output mapping for '${transition.hardwareOutputIdentifier}'.`);
  if (!Number.isInteger(outputId) || outputId < 0 || outputId > 255) throw new Error(`Protocol output ID '${outputId}' is outside uint8 range.`);
  if (!Number.isInteger(transition.slaveLogicalAddress) || transition.slaveLogicalAddress < 0 || transition.slaveLogicalAddress > 254) throw new Error(`Slave address '${transition.slaveLogicalAddress}' is outside Protocol v1 range.`);
  return { slaveAddress: transition.slaveLogicalAddress, outputId, state: transition.state };
}
