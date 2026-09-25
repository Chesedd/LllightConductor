import { ack, helloAck, MessageType, nack, NackCode, ping, status, type OutputState, type OutputUpdate, type ProtocolFrame } from './protocolV1';

export interface ProtocolSessionOptions { slaveAddress: number; configuredOutputIds: readonly number[]; firmwareId?: number; capabilities?: number }

/** Small, pure Pico-side behavioral reference; it deliberately performs no GPIO or transport I/O. */
export class ProtocolSessionState {
  readonly outputs = new Map<number, OutputState>();
  sessionId: number | null = null;
  errorFlags = 0;
  private previousSequence: number | null = null;
  private previousResponse: ProtocolFrame | null = null;

  constructor(private readonly options: ProtocolSessionOptions) { if (!Number.isInteger(options.slaveAddress) || options.slaveAddress < 0 || options.slaveAddress > 254) throw new Error('Invalid slave address.'); for (const id of options.configuredOutputIds) { if (!Number.isInteger(id) || id < 0 || id > 255 || this.outputs.has(id)) throw new Error('Invalid or duplicate configured output ID.'); this.outputs.set(id, 0); } }

  handle(request: ProtocolFrame): ProtocolFrame | null {
    if (request.slaveAddress !== this.options.slaveAddress) return null;
    if (request.messageType === MessageType.HELLO) return this.handleHello(request);
    if (this.sessionId === null || request.sessionId !== this.sessionId) return nack(request, NackCode.BAD_SESSION);
    if (request.sequence === this.previousSequence) return this.previousResponse;
    let response: ProtocolFrame;
    switch (request.messageType) {
      case MessageType.PING: response = request.payload.length === 4 ? ping(request.slaveAddress, request.sequence, request.sessionId, new DataView(request.payload.buffer, request.payload.byteOffset).getUint32(0, true), true) : nack(request, NackCode.INVALID_PAYLOAD); break;
      case MessageType.RESET_OUTPUTS: if (request.payload.length) response = nack(request, NackCode.INVALID_PAYLOAD); else { this.resetAll(); response = ack(request); } break;
      case MessageType.SET_OUTPUTS: response = this.applyBatch(request); break;
      case MessageType.GET_STATUS: response = request.payload.length ? nack(request, NackCode.INVALID_PAYLOAD) : this.makeStatus(request); break;
      default: response = nack(request, NackCode.UNKNOWN_MESSAGE);
    }
    this.previousSequence = request.sequence; this.previousResponse = response; return response;
  }

  private handleHello(request: ProtocolFrame): ProtocolFrame {
    if (request.payload.length) return nack(request, NackCode.INVALID_PAYLOAD);
    if (request.sessionId === this.sessionId && request.sequence === this.previousSequence && this.previousResponse) return this.previousResponse;
    if (request.sessionId !== this.sessionId) { this.resetAll(); this.previousSequence = null; this.previousResponse = null; this.sessionId = request.sessionId; }
    const response = helloAck(this.options.slaveAddress, request.sequence, request.sessionId, this.options.firmwareId ?? 1, this.options.capabilities ?? 1, this.outputs.size);
    this.previousSequence = request.sequence; this.previousResponse = response; return response;
  }

  private applyBatch(request: ProtocolFrame): ProtocolFrame {
    const count = request.payload[0];
    if (request.payload.length < 3 || count < 1 || count > 31 || request.payload.length !== 1 + count * 2) return nack(request, NackCode.INVALID_PAYLOAD);
    const updates: OutputUpdate[] = []; const seen = new Set<number>();
    for (let offset = 1; offset < request.payload.length; offset += 2) {
      const outputId = request.payload[offset]; const state = request.payload[offset + 1];
      if (state !== 0 && state !== 1) return nack(request, NackCode.INVALID_STATE);
      if (seen.has(outputId)) return nack(request, NackCode.INVALID_PAYLOAD);
      seen.add(outputId); updates.push({ outputId, state });
    }
    if (updates.some(update => !this.outputs.has(update.outputId))) return nack(request, NackCode.INVALID_OUTPUT);
    for (const update of updates) this.outputs.set(update.outputId, update.state);
    return ack(request);
  }
  private resetAll(): void { for (const id of this.outputs.keys()) this.outputs.set(id, 0); }
  private makeStatus(request: ProtocolFrame): ProtocolFrame { const highest = Math.max(-1, ...this.outputs.keys()); const bitmap = new Uint8Array(highest < 0 ? 0 : Math.floor(highest / 8) + 1); for (const [id, state] of this.outputs) if (state) bitmap[Math.floor(id / 8)] |= 1 << (id % 8); return status(this.options.slaveAddress, request.sequence, request.sessionId, true, this.outputs.size, this.errorFlags, bitmap); }
}
