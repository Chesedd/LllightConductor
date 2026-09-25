import { crc32IsoHdlc } from './crc32';

export const DESKTOP_PROTOCOL_VERSION = 1 as const;
export const DESKTOP_FRAME_MAGIC = new Uint8Array([0xd3, 0x32]);
export const DESKTOP_FRAME_HEADER_SIZE = 12;
export const DESKTOP_FRAME_CRC_SIZE = 4;
export const DESKTOP_MAX_PAYLOAD_SIZE = 1024;
export const MAX_PREPARED_SHOW_SIZE = 512 * 1024;

export enum DesktopMessageType { HELLO=0x01, HELLO_ACK=0x02, ACK=0x03, NACK=0x04, GET_STATUS=0x10, STATUS=0x11, BEGIN_UPLOAD=0x20, UPLOAD_READY=0x21, UPLOAD_CHUNK=0x22, END_UPLOAD=0x23, UPLOAD_COMPLETE=0x24, ACTIVATE_SHOW=0x30, START_SHOW=0x31, STOP_SHOW=0x32 }
export enum DeviceState { IDLE=0, UPLOADING=1, READY=2, RUNNING=3, FAULT=4 }
export enum FaultCategory { NONE=0, PROTOCOL=1, UPLOAD=2, INVALID_SHOW=3, PICO_UNAVAILABLE=4, PICO_PROTOCOL=5, SCHEDULER=6, INTERNAL=7 }
export enum DesktopNackCode { UNKNOWN_MESSAGE=1, INVALID_PAYLOAD=2, BAD_SESSION=3, INVALID_STATE=4, UNSUPPORTED_VERSION=5, UPLOAD_TOO_LARGE=6, UPLOAD_OFFSET=7, UPLOAD_CONFLICT=8, HASH_MISMATCH=9, INVALID_SHOW=10, NO_SHOW=11, BUSY=12, INTERNAL_ERROR=13 }
export interface DesktopFrame { version:number; messageType:number; sequence:number; sessionId:number; payload:Uint8Array }
export class DesktopProtocolError extends Error { constructor(readonly code:'invalid-frame'|'bad-crc'|'oversized-payload'|'unsupported-version'|'invalid-payload', message:string){ super(message); this.name='DesktopProtocolError'; } }
const u16=(n:number)=>Number.isInteger(n)&&n>=0&&n<=0xffff; const u32=(n:number)=>Number.isInteger(n)&&n>=0&&n<=0xffffffff;
export const requestFrame=(messageType:number,sequence:number,sessionId:number,payload:Uint8Array=new Uint8Array()):DesktopFrame=>({version:1,messageType,sequence,sessionId,payload});
export function encodeDesktopFrame(frame:DesktopFrame):Uint8Array {
  if (!u16(frame.sequence)||!u32(frame.sessionId)||!Number.isInteger(frame.messageType)||frame.messageType<0||frame.messageType>255) throw new DesktopProtocolError('invalid-payload','Invalid frame field.');
  if(frame.payload.length>DESKTOP_MAX_PAYLOAD_SIZE) throw new DesktopProtocolError('oversized-payload','Payload exceeds 1024 bytes.');
  const out=new Uint8Array(DESKTOP_FRAME_HEADER_SIZE+frame.payload.length+4),v=new DataView(out.buffer); out.set(DESKTOP_FRAME_MAGIC); v.setUint8(2,frame.version);v.setUint8(3,frame.messageType);v.setUint16(4,frame.sequence,true);v.setUint32(6,frame.sessionId,true);v.setUint16(10,frame.payload.length,true);out.set(frame.payload,12);v.setUint32(out.length-4,crc32IsoHdlc(out.subarray(2,-4)),true);return out;
}
export function decodeDesktopFrame(bytes:Uint8Array):DesktopFrame {
  if(bytes.length<16||bytes[0]!==0xd3||bytes[1]!==0x32)throw new DesktopProtocolError('invalid-frame','Bad magic or truncated frame.'); const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),len=v.getUint16(10,true);
  if(len>1024)throw new DesktopProtocolError('oversized-payload','Payload exceeds 1024 bytes.');if(bytes.length!==16+len)throw new DesktopProtocolError('invalid-frame','Frame length mismatch.');if(v.getUint32(bytes.length-4,true)!==crc32IsoHdlc(bytes.subarray(2,-4)))throw new DesktopProtocolError('bad-crc','CRC mismatch.');if(bytes[2]!==1)throw new DesktopProtocolError('unsupported-version',`Unsupported version ${bytes[2]}.`);return{version:bytes[2],messageType:bytes[3],sequence:v.getUint16(4,true),sessionId:v.getUint32(6,true),payload:bytes.slice(12,-4)};
}
export const incrementDesktopSequence=(n:number)=>(n+1)&0xffff;
export class DesktopFrameParser {
 private buffer=new Uint8Array();
 push(chunk:Uint8Array):Array<{kind:'frame';frame:DesktopFrame}|{kind:'error';code:'bad-crc'|'oversized-payload'|'unsupported-version'}>{const joined=new Uint8Array(this.buffer.length+chunk.length);joined.set(this.buffer);joined.set(chunk,this.buffer.length);this.buffer=joined;const events:Array<{kind:'frame';frame:DesktopFrame}|{kind:'error';code:'bad-crc'|'oversized-payload'|'unsupported-version'}>=[];while(true){let at=-1;for(let i=0;i+1<this.buffer.length;i++)if(this.buffer[i]===0xd3&&this.buffer[i+1]===0x32){at=i;break;}if(at<0){this.buffer=this.buffer.at(-1)===0xd3?this.buffer.slice(-1):new Uint8Array();break;}this.buffer=this.buffer.slice(at);if(this.buffer.length<12)break;const len=new DataView(this.buffer.buffer,this.buffer.byteOffset).getUint16(10,true);if(len>1024){events.push({kind:'error',code:'oversized-payload'});this.buffer=this.buffer.slice(1);continue;}const total=16+len;if(this.buffer.length<total)break;const candidate=this.buffer.slice(0,total),v=new DataView(candidate.buffer);if(v.getUint32(total-4,true)!==crc32IsoHdlc(candidate.subarray(2,-4))){events.push({kind:'error',code:'bad-crc'});this.buffer=this.buffer.slice(1);continue;}this.buffer=this.buffer.slice(total);if(candidate[2]!==1){events.push({kind:'error',code:'unsupported-version'});continue;}events.push({kind:'frame',frame:decodeDesktopFrame(candidate)});}return events;}
 reset(){this.buffer=new Uint8Array();}
}
export const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export const fromHex=(s:string)=>new Uint8Array((s.match(/../g)??[]).map(x=>Number.parseInt(x,16)));
