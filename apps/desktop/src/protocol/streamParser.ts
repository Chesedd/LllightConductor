import { crc16CcittFalse } from './crc16';
import { decodeFrame, FRAME_CRC_SIZE, FRAME_HEADER_SIZE, FRAME_MAGIC, MAX_PAYLOAD_SIZE, type ProtocolFrame } from './protocolV1';

export type ParserEvent = { kind: 'frame'; frame: ProtocolFrame } | { kind: 'error'; code: 'bad-crc' | 'oversized-payload' | 'unsupported-version' };

/** Stateful byte-stream parser. It bounds retained data and never treats a transport read as a frame. */
export class ProtocolStreamParser {
  private buffer = new Uint8Array();

  push(chunk: Uint8Array): ParserEvent[] {
    const joined = new Uint8Array(this.buffer.length + chunk.length); joined.set(this.buffer); joined.set(chunk, this.buffer.length); this.buffer = joined;
    const events: ParserEvent[] = [];
    while (true) {
      const magic = this.findMagic();
      if (magic < 0) { this.buffer = this.buffer.length && this.buffer[this.buffer.length - 1] === FRAME_MAGIC[0] ? this.buffer.slice(-1) : new Uint8Array(); break; }
      if (magic > 0) this.buffer = this.buffer.slice(magic);
      if (this.buffer.length < FRAME_HEADER_SIZE) break;
      const length = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength).getUint16(11, true);
      if (length > MAX_PAYLOAD_SIZE) { events.push({ kind: 'error', code: 'oversized-payload' }); this.buffer = this.buffer.slice(1); continue; }
      const total = FRAME_HEADER_SIZE + length + FRAME_CRC_SIZE;
      if (this.buffer.length < total) break;
      const candidate = this.buffer.slice(0, total); const view = new DataView(candidate.buffer);
      if (view.getUint16(total - 2, true) !== crc16CcittFalse(candidate.subarray(2, total - 2))) { events.push({ kind: 'error', code: 'bad-crc' }); this.buffer = this.buffer.slice(1); continue; }
      this.buffer = this.buffer.slice(total);
      if (candidate[2] !== 1) { events.push({ kind: 'error', code: 'unsupported-version' }); continue; }
      events.push({ kind: 'frame', frame: decodeFrame(candidate) });
    }
    return events;
  }

  reset(): void { this.buffer = new Uint8Array(); }
  private findMagic(): number { for (let index = 0; index + 1 < this.buffer.length; index += 1) if (this.buffer[index] === FRAME_MAGIC[0] && this.buffer[index + 1] === FRAME_MAGIC[1]) return index; return -1; }
}
