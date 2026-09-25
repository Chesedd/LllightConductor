import { crc16CcittFalse } from './crc16';

export const PROTOCOL_VERSION = 1 as const;
export const FRAME_MAGIC = new Uint8Array([0xa5, 0x5a]);
export const FRAME_HEADER_SIZE = 13;
export const FRAME_CRC_SIZE = 2;
export const MAX_PAYLOAD_SIZE = 64;
/** One count byte plus two bytes per SET_OUTPUTS update. */
export const MAX_SET_OUTPUT_UPDATES = Math.floor((MAX_PAYLOAD_SIZE - 1) / 2);
export const BROADCAST_ADDRESS = 255;

export enum MessageType { HELLO = 0x01, HELLO_ACK = 0x02, PING = 0x03, PONG = 0x04, RESET_OUTPUTS = 0x05, SET_OUTPUTS = 0x06, ACK = 0x07, NACK = 0x08, GET_STATUS = 0x09, STATUS = 0x0a }
export enum NackCode { UNKNOWN_MESSAGE = 0x01, INVALID_PAYLOAD = 0x02, INVALID_OUTPUT = 0x03, INVALID_STATE = 0x04, BAD_SESSION = 0x05, UNSUPPORTED_VERSION = 0x06, BUSY = 0x07, INTERNAL_ERROR = 0x08 }

export interface ProtocolFrame { version: number; messageType: number; slaveAddress: number; sequence: number; sessionId: number; payload: Uint8Array }
export type OutputState = 0 | 1;
export interface OutputUpdate { outputId: number; state: OutputState }

const uint8 = (value: number, name: string) => { if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new ProtocolCodecError('invalid-field', `${name} must be a uint8.`); return value; };
const uint16 = (value: number, name: string) => { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new ProtocolCodecError('invalid-field', `${name} must be a uint16.`); return value; };
const uint32 = (value: number, name: string) => { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new ProtocolCodecError('invalid-field', `${name} must be a uint32.`); return value; };

export class ProtocolCodecError extends Error {
  constructor(readonly code: 'invalid-field' | 'oversized-payload' | 'invalid-frame' | 'bad-crc' | 'unsupported-version' | 'unknown-message' | 'invalid-payload', message: string) { super(message); this.name = 'ProtocolCodecError'; }
}

export function encodeFrame(frame: ProtocolFrame): Uint8Array {
  uint8(frame.version, 'version'); uint8(frame.messageType, 'messageType'); uint8(frame.slaveAddress, 'slaveAddress'); uint16(frame.sequence, 'sequence'); uint32(frame.sessionId, 'sessionId');
  if (frame.slaveAddress === BROADCAST_ADDRESS) throw new ProtocolCodecError('invalid-field', 'Address 255 is reserved and unsupported in Protocol v1.');
  if (frame.payload.length > MAX_PAYLOAD_SIZE) throw new ProtocolCodecError('oversized-payload', `Payload exceeds ${MAX_PAYLOAD_SIZE} bytes.`);
  const bytes = new Uint8Array(FRAME_HEADER_SIZE + frame.payload.length + FRAME_CRC_SIZE); const view = new DataView(bytes.buffer);
  bytes.set(FRAME_MAGIC); view.setUint8(2, frame.version); view.setUint8(3, frame.messageType); view.setUint8(4, frame.slaveAddress); view.setUint16(5, frame.sequence, true); view.setUint32(7, frame.sessionId, true); view.setUint16(11, frame.payload.length, true); bytes.set(frame.payload, FRAME_HEADER_SIZE);
  view.setUint16(bytes.length - 2, crc16CcittFalse(bytes.subarray(2, bytes.length - 2)), true);
  return bytes;
}

export function decodeFrame(bytes: Uint8Array): ProtocolFrame {
  if (bytes.length < FRAME_HEADER_SIZE + FRAME_CRC_SIZE || bytes[0] !== FRAME_MAGIC[0] || bytes[1] !== FRAME_MAGIC[1]) throw new ProtocolCodecError('invalid-frame', 'Frame header or magic is invalid.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const length = view.getUint16(11, true);
  if (length > MAX_PAYLOAD_SIZE) throw new ProtocolCodecError('oversized-payload', `Payload exceeds ${MAX_PAYLOAD_SIZE} bytes.`);
  if (bytes.length !== FRAME_HEADER_SIZE + length + FRAME_CRC_SIZE) throw new ProtocolCodecError('invalid-frame', 'Frame length does not match payload length.');
  if (view.getUint16(bytes.length - 2, true) !== crc16CcittFalse(bytes.subarray(2, bytes.length - 2))) throw new ProtocolCodecError('bad-crc', 'Frame CRC does not match.');
  const frame = { version: bytes[2], messageType: bytes[3], slaveAddress: bytes[4], sequence: view.getUint16(5, true), sessionId: view.getUint32(7, true), payload: bytes.slice(FRAME_HEADER_SIZE, -2) };
  if (frame.version !== PROTOCOL_VERSION) throw new ProtocolCodecError('unsupported-version', `Unsupported protocol version ${frame.version}.`);
  return frame;
}

const payloadView = (size: number) => { const payload = new Uint8Array(size); return { payload, view: new DataView(payload.buffer) }; };
export const frame = (messageType: number, slaveAddress: number, sequence: number, sessionId: number, payload = new Uint8Array()): ProtocolFrame => ({ version: PROTOCOL_VERSION, messageType, slaveAddress, sequence, sessionId, payload });
export const hello = (slaveAddress: number, sequence: number, sessionId: number) => frame(MessageType.HELLO, slaveAddress, sequence, sessionId);
export function helloAck(slaveAddress: number, sequence: number, sessionId: number, firmwareId: number, capabilities: number, configuredOutputs: number): ProtocolFrame { const { payload, view } = payloadView(5); view.setUint16(0, uint16(firmwareId, 'firmwareId'), true); view.setUint16(2, uint16(capabilities, 'capabilities'), true); view.setUint8(4, uint8(configuredOutputs, 'configuredOutputs')); return frame(MessageType.HELLO_ACK, slaveAddress, sequence, sessionId, payload); }
export function ping(slaveAddress: number, sequence: number, sessionId: number, token: number, response = false): ProtocolFrame { const { payload, view } = payloadView(4); view.setUint32(0, uint32(token, 'token'), true); return frame(response ? MessageType.PONG : MessageType.PING, slaveAddress, sequence, sessionId, payload); }
export const resetOutputs = (slaveAddress: number, sequence: number, sessionId: number) => frame(MessageType.RESET_OUTPUTS, slaveAddress, sequence, sessionId);
export function setOutputs(slaveAddress: number, sequence: number, sessionId: number, updates: readonly OutputUpdate[]): ProtocolFrame { if (updates.length < 1 || updates.length > MAX_SET_OUTPUT_UPDATES) throw new ProtocolCodecError('invalid-payload', `SET_OUTPUTS requires 1..${MAX_SET_OUTPUT_UPDATES} updates.`); const payload = new Uint8Array(1 + updates.length * 2); payload[0] = updates.length; updates.forEach((update, index) => { payload[1 + index * 2] = uint8(update.outputId, 'outputId'); if (update.state !== 0 && update.state !== 1) throw new ProtocolCodecError('invalid-payload', 'Output state must be 0 or 1.'); payload[2 + index * 2] = update.state; }); return frame(MessageType.SET_OUTPUTS, slaveAddress, sequence, sessionId, payload); }
export const ack = (request: ProtocolFrame) => frame(MessageType.ACK, request.slaveAddress, request.sequence, request.sessionId);
export const nack = (request: ProtocolFrame, code: NackCode) => frame(MessageType.NACK, request.slaveAddress, request.sequence, request.sessionId, new Uint8Array([code]));
export const getStatus = (slaveAddress: number, sequence: number, sessionId: number) => frame(MessageType.GET_STATUS, slaveAddress, sequence, sessionId);
export function status(slaveAddress: number, sequence: number, sessionId: number, sessionActive: boolean, configuredOutputs: number, errorFlags: number, outputStates: Uint8Array): ProtocolFrame { if (outputStates.length > 32) throw new ProtocolCodecError('invalid-payload', 'STATUS bitmap exceeds 256 outputs.'); const { payload, view } = payloadView(7 + outputStates.length); payload[0] = PROTOCOL_VERSION; payload[1] = uint8(slaveAddress, 'slaveAddress'); payload[2] = sessionActive ? 1 : 0; payload[3] = uint8(configuredOutputs, 'configuredOutputs'); view.setUint16(4, uint16(errorFlags, 'errorFlags'), true); payload[6] = outputStates.length; payload.set(outputStates, 7); return frame(MessageType.STATUS, slaveAddress, sequence, sessionId, payload); }
export const incrementSequence = (sequence: number) => (uint16(sequence, 'sequence') + 1) & 0xffff;

export function parseOutputUpdates(payload: Uint8Array): OutputUpdate[] {
  if (payload.length < 3 || payload[0] < 1 || payload[0] > MAX_SET_OUTPUT_UPDATES || payload.length !== 1 + payload[0] * 2) throw new ProtocolCodecError('invalid-payload', 'Malformed SET_OUTPUTS payload.');
  const seen = new Set<number>(); const result: OutputUpdate[] = [];
  for (let offset = 1; offset < payload.length; offset += 2) { const outputId = payload[offset]; const state = payload[offset + 1]; if (state !== 0 && state !== 1) throw new ProtocolCodecError('invalid-payload', 'Output state must be 0 or 1.'); if (seen.has(outputId)) throw new ProtocolCodecError('invalid-payload', 'A batch cannot contain an output twice.'); seen.add(outputId); result.push({ outputId, state }); }
  return result;
}
