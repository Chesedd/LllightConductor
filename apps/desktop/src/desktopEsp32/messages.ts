import { DesktopMessageType, type DesktopFrame, requestFrame } from './protocol';
export const HELLO_PAYLOAD_VERSION=1;
const payload=(n:number)=>{const b=new Uint8Array(n);return{b,v:new DataView(b.buffer)}};
export const hello=(sequence:number,sessionId:number)=>requestFrame(DesktopMessageType.HELLO,sequence,sessionId,new Uint8Array([HELLO_PAYLOAD_VERSION]));
export function beginUpload(sequence:number,sessionId:number,totalLength:number,hash:Uint8Array){if(hash.length!==32)throw new Error('SHA-256 must be 32 bytes.');const{b,v}=payload(37);b[0]=1;v.setUint32(1,totalLength,true);b.set(hash,5);return requestFrame(DesktopMessageType.BEGIN_UPLOAD,sequence,sessionId,b);}
export function uploadChunk(sequence:number,sessionId:number,offset:number,data:Uint8Array){const{b,v}=payload(4+data.length);v.setUint32(0,offset,true);b.set(data,4);return requestFrame(DesktopMessageType.UPLOAD_CHUNK,sequence,sessionId,b);}
export const endUpload=(sequence:number,sessionId:number)=>requestFrame(DesktopMessageType.END_UPLOAD,sequence,sessionId);
export const activateShow=(sequence:number,sessionId:number,hash:Uint8Array)=>requestFrame(DesktopMessageType.ACTIVATE_SHOW,sequence,sessionId,hash);
export const startShow=(sequence:number,sessionId:number)=>requestFrame(DesktopMessageType.START_SHOW,sequence,sessionId);
export const stopShow=(sequence:number,sessionId:number)=>requestFrame(DesktopMessageType.STOP_SHOW,sequence,sessionId);
export const getStatus=(sequence:number,sessionId:number)=>requestFrame(DesktopMessageType.GET_STATUS,sequence,sessionId);
export function response(request:DesktopFrame,type:number,payload:Uint8Array=new Uint8Array()):DesktopFrame{return requestFrame(type,request.sequence,request.sessionId,payload);}
