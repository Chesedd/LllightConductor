import { describe, expect, it } from 'vitest';
import { crc16CcittFalse } from './crc16';
import { prepareOutputUpdate } from './preparedOutput';
import { ProtocolSessionState } from './sessionState';
import { ProtocolStreamParser } from './streamParser';
import { ack, decodeFrame, encodeFrame, frame, getStatus, hello, helloAck, incrementSequence, MAX_PAYLOAD_SIZE, MessageType, nack, NackCode, ping, ProtocolCodecError, PROTOCOL_VERSION, resetOutputs, setOutputs, status, type ProtocolFrame } from './protocolV1';

const address = 7; const session = 0x89abcdef;
const hex = (bytes: Uint8Array) => [...bytes].map(value => value.toString(16).padStart(2, '0')).join(' ');
const vectors: [string, ProtocolFrame, string][] = [
  ['HELLO', hello(address, 0x1234, session), 'a5 5a 01 01 07 34 12 ef cd ab 89 00 00 da c1'],
  ['HELLO_ACK', helloAck(address, 0x1234, session, 0x0102, 1, 8), 'a5 5a 01 02 07 34 12 ef cd ab 89 05 00 02 01 01 00 08 cc 47'],
  ['PING', ping(address, 0x1235, session, 0x10203040), 'a5 5a 01 03 07 35 12 ef cd ab 89 04 00 40 30 20 10 bd 2b'],
  ['PONG', ping(address, 0x1235, session, 0x10203040, true), 'a5 5a 01 04 07 35 12 ef cd ab 89 04 00 40 30 20 10 bb 5b'],
  ['RESET_OUTPUTS', resetOutputs(address, 0x1236, session), 'a5 5a 01 05 07 36 12 ef cd ab 89 00 00 49 e3'],
  ['SET_OUTPUTS one', setOutputs(address, 0x1237, session, [{ outputId: 3, state: 1 }]), 'a5 5a 01 06 07 37 12 ef cd ab 89 03 00 01 03 01 49 c5'],
  ['SET_OUTPUTS batch', setOutputs(address, 0x1238, session, [{ outputId: 1, state: 1 }, { outputId: 2, state: 0 }, { outputId: 7, state: 1 }]), 'a5 5a 01 06 07 38 12 ef cd ab 89 07 00 03 01 01 02 00 07 01 9d c0'],
  ['ACK', ack(setOutputs(address, 0x1237, session, [{ outputId: 3, state: 1 }])), 'a5 5a 01 07 07 37 12 ef cd ab 89 00 00 10 7a'],
  ['NACK', nack(frame(MessageType.SET_OUTPUTS, address, 0x1239, session), NackCode.INVALID_OUTPUT), 'a5 5a 01 08 07 39 12 ef cd ab 89 01 00 03 ca 30'],
  ['GET_STATUS', getStatus(address, 0x123a, session), 'a5 5a 01 09 07 3a 12 ef cd ab 89 00 00 80 15'],
  ['STATUS', status(address, 0x123a, session, true, 8, 0x0102, new Uint8Array([0x89])), 'a5 5a 01 0a 07 3a 12 ef cd ab 89 08 00 01 07 01 08 02 01 01 89 18 64'],
];

describe('Protocol v1 codec and golden vectors', () => {
  it.each(vectors)('encodes and decodes exact %s bytes', (_name, value, expected) => { const encoded = encodeFrame(value); expect(hex(encoded)).toBe(expected); expect(decodeFrame(encoded)).toEqual(value); });
  it('uses the independent CRC-16/CCITT-FALSE check vector', () => expect(crc16CcittFalse(new TextEncoder().encode('123456789'))).toBe(0x29b1));
  it('encodes multibyte header and payload fields little-endian', () => { const bytes = encodeFrame(helloAck(address, 0x1234, 0x89abcdef, 0x0102, 0x0304, 5)); expect([...bytes.slice(5, 13)]).toEqual([0x34, 0x12, 0xef, 0xcd, 0xab, 0x89, 5, 0]); expect([...bytes.slice(13, 17)]).toEqual([2, 1, 4, 3]); });
  it('accepts the maximum payload and rejects an oversized payload', () => { expect(decodeFrame(encodeFrame(frame(MessageType.STATUS, 1, 1, 1, new Uint8Array(MAX_PAYLOAD_SIZE)))).payload).toHaveLength(MAX_PAYLOAD_SIZE); expect(() => encodeFrame(frame(MessageType.STATUS, 1, 1, 1, new Uint8Array(MAX_PAYLOAD_SIZE + 1)))).toThrowError(expect.objectContaining({ code: 'oversized-payload' })); });
  it('validates states, batch shape, and numeric fields', () => { expect(() => setOutputs(1, 1, 1, [{ outputId: 2, state: 2 as 1 }])).toThrow(ProtocolCodecError); expect(() => setOutputs(1, 1, 1, [])).toThrow(ProtocolCodecError); expect(() => setOutputs(1, 1, 1, [{ outputId: 256, state: 1 }])).toThrow(ProtocolCodecError); });
  it('reserves address 255 rather than silently defining broadcast', () => expect(() => encodeFrame(hello(255, 1, 1))).toThrowError(expect.objectContaining({ code: 'invalid-field' })));
  it('wraps uint16 sequence numbers modulo 65536', () => expect(incrementSequence(0xffff)).toBe(0));
  it('rejects an otherwise valid unknown version rather than interpreting it as v1', () => { const bytes = encodeFrame({ ...hello(1, 1, 1), version: 2 }); expect(() => decodeFrame(bytes)).toThrowError(expect.objectContaining({ code: 'unsupported-version' })); });
  it('keeps hardware identifiers opaque at the explicit preparation boundary', () => { const transition = { slaveId: 's', slaveLogicalAddress: 2, channelId: 'c', hardwareOutputIdentifier: '15', state: 'ON' as const }; expect(() => prepareOutputUpdate(transition, new Map())).toThrow(/mapping/); expect(prepareOutputUpdate(transition, new Map([['15', 4]]))).toEqual({ slaveAddress: 2, outputId: 4, state: 'ON' }); });
});

describe('stream parser and recovery', () => {
  const first = encodeFrame(hello(address, 1, session)); const second = encodeFrame(getStatus(address, 2, session));
  it('holds partial magic, header, and payload across arbitrary one-byte chunks', () => { const parser = new ProtocolStreamParser(); const events = [...first].flatMap(byte => parser.push(new Uint8Array([byte]))); expect(events).toEqual([{ kind: 'frame', frame: hello(address, 1, session) }]); });
  it('returns multiple frames from one chunk', () => { const parser = new ProtocolStreamParser(); const joined = new Uint8Array(first.length + second.length); joined.set(first); joined.set(second, first.length); expect(parser.push(joined).filter(event => event.kind === 'frame')).toHaveLength(2); });
  it('skips garbage and preserves a partial magic prefix', () => { const parser = new ProtocolStreamParser(); expect(parser.push(new Uint8Array([9, 8, 0xa5]))).toEqual([]); expect(parser.push(first.slice(1))).toEqual([{ kind: 'frame', frame: hello(address, 1, session) }]); });
  it('recovers a valid frame after bad CRC or an oversized header', () => { const bad = first.slice(); bad[bad.length - 1] ^= 1; const oversized = first.slice(0, 13); oversized[11] = 65; const joined = new Uint8Array(bad.length + oversized.length + second.length); joined.set(bad); joined.set(oversized, bad.length); joined.set(second, bad.length + oversized.length); expect(parserKinds(joined)).toEqual(['bad-crc', 'oversized-payload', 'frame']); });
  it('reports a CRC-valid unknown version and continues', () => { const parser = new ProtocolStreamParser(); const unknown = encodeFrame({ ...hello(address, 1, session), version: 2 }); const joined = new Uint8Array(unknown.length + second.length); joined.set(unknown); joined.set(second, unknown.length); expect(parser.push(joined).map(event => event.kind === 'error' ? event.code : event.kind)).toEqual(['unsupported-version', 'frame']); });
  const parserKinds = (bytes: Uint8Array) => new ProtocolStreamParser().push(bytes).map(event => event.kind === 'error' ? event.code : event.kind);
});

describe('Pico reference session semantics', () => {
  it('starts a session with outputs off, applies a valid batch, and replays a duplicate response', () => { const pico = new ProtocolSessionState({ slaveAddress: address, configuredOutputIds: [1, 2] }); pico.outputs.set(1, 1); pico.handle(hello(address, 10, session)); expect([...pico.outputs.values()]).toEqual([0, 0]); const command = setOutputs(address, 11, session, [{ outputId: 1, state: 1 }, { outputId: 2, state: 1 }]); const response = pico.handle(command); expect(response?.messageType).toBe(MessageType.ACK); expect(pico.handle(command)).toBe(response); expect([...pico.outputs.values()]).toEqual([1, 1]); });
  it('resets duplicate cache and outputs for a new session', () => { const pico = new ProtocolSessionState({ slaveAddress: address, configuredOutputIds: [1] }); pico.handle(hello(address, 1, 1)); pico.handle(setOutputs(address, 2, 1, [{ outputId: 1, state: 1 }])); pico.handle(hello(address, 1, 2)); expect(pico.sessionId).toBe(2); expect(pico.outputs.get(1)).toBe(0); });
  it('validates a batch atomically and rejects invalid output, state, session, and message', () => { const pico = new ProtocolSessionState({ slaveAddress: address, configuredOutputIds: [1, 2] }); pico.handle(hello(address, 1, session)); const invalidOutput = pico.handle(setOutputs(address, 2, session, [{ outputId: 1, state: 1 }, { outputId: 3, state: 1 }])); expect(invalidOutput?.payload[0]).toBe(NackCode.INVALID_OUTPUT); expect([...pico.outputs.values()]).toEqual([0, 0]); const badState = frame(MessageType.SET_OUTPUTS, address, 3, session, new Uint8Array([1, 1, 2])); expect(pico.handle(badState)?.payload[0]).toBe(NackCode.INVALID_STATE); expect(pico.handle(resetOutputs(address, 4, session + 1))?.payload[0]).toBe(NackCode.BAD_SESSION); expect(pico.handle(frame(0xfe, address, 5, session))?.payload[0]).toBe(NackCode.UNKNOWN_MESSAGE); });
  it('distinguishes malformed batches from invalid states', () => { const pico = new ProtocolSessionState({ slaveAddress: address, configuredOutputIds: [1] }); pico.handle(hello(address, 1, session)); expect(pico.handle(frame(MessageType.SET_OUTPUTS, address, 2, session, new Uint8Array([2, 1, 1])))?.payload[0]).toBe(NackCode.INVALID_PAYLOAD); });
  it('RESET_OUTPUTS turns every output off and is acknowledged', () => { const pico = new ProtocolSessionState({ slaveAddress: address, configuredOutputIds: [1, 2] }); pico.handle(hello(address, 1, session)); pico.handle(setOutputs(address, 2, session, [{ outputId: 1, state: 1 }])); expect(pico.handle(resetOutputs(address, 3, session))?.messageType).toBe(MessageType.ACK); expect([...pico.outputs.values()]).toEqual([0, 0]); });
  it('ignores frames addressed to another slave', () => expect(new ProtocolSessionState({ slaveAddress: address, configuredOutputIds: [] }).handle(hello(8, 1, session))).toBeNull());
});

it('exports Protocol v1 as version one', () => expect(PROTOCOL_VERSION).toBe(1));
