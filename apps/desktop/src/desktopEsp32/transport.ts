import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
export const DESKTOP_SERIAL_BAUD=460_800;
export interface SerialPortDescriptor{portName:string;portType:string;vid?:number;pid?:number;manufacturer?:string;product?:string;serialNumber?:string}
export type DesktopEndpoint={kind:'serial';portName:string}|{kind:'tcp';host:string;port:number};
export const endpointLabel=(e:DesktopEndpoint)=>e.kind==='serial'?e.portName:`${e.host}:${e.port}`;
export type TransportErrorCode='PortNotFound'|'PortBusy'|'PermissionDenied'|'OpenFailed'|'ReadFailed'|'WriteFailed'|'Disconnected';
export class DesktopTransportError extends Error{constructor(readonly code:TransportErrorCode,message:string){super(message);this.name='DesktopTransportError';}}
export interface DesktopEsp32Transport{open(endpoint:DesktopEndpoint):Promise<void>;close():Promise<void>;write(bytes:Uint8Array):Promise<void>;onBytes(listener:(bytes:Uint8Array)=>void):()=>void;onDisconnect(listener:(error:DesktopTransportError)=>void):()=>void}
export interface SerialPortDiscovery{listPorts():Promise<SerialPortDescriptor[]>}
type NativeError={code?:TransportErrorCode;message?:string};type NativeBytesEvent={generation:number;bytes:number[]};type NativeDisconnectEvent={generation:number;error:NativeError};
const nativeError=(cause:unknown,fallback:TransportErrorCode)=>{if(cause instanceof DesktopTransportError)return cause;const e=cause as NativeError;return new DesktopTransportError(e?.code??fallback,e?.message??String(cause));};
export const nativeBytes=(payload:NativeBytesEvent)=>Uint8Array.from(payload.bytes);
abstract class TauriByteGateway implements DesktopEsp32Transport{
 protected generation?:number;private bytes=new Set<(bytes:Uint8Array)=>void>();private disconnects=new Set<(error:DesktopTransportError)=>void>();private unlisten:UnlistenFn[]=[];
 protected abstract readonly eventPrefix:string;protected abstract openNative(e:DesktopEndpoint):Promise<number>;protected abstract closeCommand(g:number):Promise<unknown>;protected abstract writeCommand(g:number,b:number[]):Promise<unknown>;
 async open(e:DesktopEndpoint){await this.installListeners();try{this.generation=await this.openNative(e);}catch(cause){this.removeListeners();throw nativeError(cause,'OpenFailed');}}
 async close(){const g=this.generation;this.generation=undefined;try{if(g!==undefined)await this.closeCommand(g);}catch(e){throw nativeError(e,'Disconnected');}finally{this.removeListeners();}}
 async write(bytes:Uint8Array){try{if(this.generation===undefined)throw new DesktopTransportError('Disconnected','no connection is open');await this.writeCommand(this.generation,[...bytes]);}catch(e){throw nativeError(e,'WriteFailed');}}
 onBytes(fn:(b:Uint8Array)=>void){this.bytes.add(fn);return()=>this.bytes.delete(fn);}onDisconnect(fn:(e:DesktopTransportError)=>void){this.disconnects.add(fn);return()=>this.disconnects.delete(fn);}
 private async installListeners(){if(this.unlisten.length)return;this.unlisten.push(await listen<NativeBytesEvent>(`${this.eventPrefix}://bytes`,e=>{if(e.payload.generation===this.generation)this.bytes.forEach(fn=>fn(nativeBytes(e.payload)));}));this.unlisten.push(await listen<NativeDisconnectEvent>(`${this.eventPrefix}://disconnect`,e=>{if(e.payload.generation===this.generation)this.disconnects.forEach(fn=>fn(nativeError(e.payload.error,'Disconnected')));}));}
 private removeListeners(){this.unlisten.splice(0).forEach(fn=>fn());}
}
export class TauriSerialPortGateway extends TauriByteGateway implements SerialPortDiscovery{
 protected readonly eventPrefix='serial';async listPorts(){try{return await invoke<SerialPortDescriptor[]>('list_serial_ports');}catch(e){throw nativeError(e,'OpenFailed');}}
 protected openNative(e:DesktopEndpoint){return e.kind==='serial'?invoke<number>('open_serial_port',{portName:e.portName}):Promise.reject(new DesktopTransportError('OpenFailed','serial endpoint required'));}protected closeCommand(g:number){return invoke('close_serial_port',{generation:g});}protected writeCommand(g:number,b:number[]){return invoke('write_serial',{generation:g,bytes:b});}
}
export class TauriTcpGateway extends TauriByteGateway{
 protected readonly eventPrefix='tcp';protected openNative(e:DesktopEndpoint){return e.kind==='tcp'?invoke<number>('open_tcp_connection',{host:e.host,port:e.port}):Promise.reject(new DesktopTransportError('OpenFailed','network endpoint required'));}protected closeCommand(g:number){return invoke('close_tcp_connection',{generation:g});}protected writeCommand(g:number,b:number[]){return invoke('write_tcp',{generation:g,bytes:b});}
}
export class SelectableDesktopEsp32Transport implements DesktopEsp32Transport{
 private active?:DesktopEsp32Transport;constructor(readonly serial:TauriSerialPortGateway,readonly tcp:TauriTcpGateway){}async open(e:DesktopEndpoint){this.active=e.kind==='serial'?this.serial:this.tcp;await this.active.open(e);}async close(){const a=this.active;this.active=undefined;if(a)await a.close();}async write(b:Uint8Array){if(!this.active)throw new DesktopTransportError('Disconnected','no connection is open');await this.active.write(b);}onBytes(fn:(b:Uint8Array)=>void){const a=this.serial.onBytes(fn),b=this.tcp.onBytes(fn);return()=>{a();b();};}onDisconnect(fn:(e:DesktopTransportError)=>void){const a=this.serial.onDisconnect(fn),b=this.tcp.onDisconnect(fn);return()=>{a();b();};}
}
export class FakeDesktopEsp32Transport implements DesktopEsp32Transport{
 readonly writes:Uint8Array[]=[];isOpen=false;endpoint?:DesktopEndpoint;private bytes=new Set<(b:Uint8Array)=>void>();private disconnects=new Set<(e:DesktopTransportError)=>void>();async open(e:DesktopEndpoint){this.endpoint=e;this.isOpen=true;}async close(){this.isOpen=false;}async write(b:Uint8Array){if(!this.isOpen)throw new DesktopTransportError('Disconnected','closed');this.writes.push(b.slice());}onBytes(fn:(b:Uint8Array)=>void){this.bytes.add(fn);return()=>this.bytes.delete(fn);}onDisconnect(fn:(e:DesktopTransportError)=>void){this.disconnects.add(fn);return()=>this.disconnects.delete(fn);}inject(b:Uint8Array,chunks:number[]=[b.length]){let at=0;for(const size of chunks){const p=b.slice(at,at+size);at+=size;if(p.length)this.bytes.forEach(fn=>fn(p));}if(at<b.length)this.bytes.forEach(fn=>fn(b.slice(at)));}disconnect(e=new DesktopTransportError('Disconnected','device removed')){this.isOpen=false;this.disconnects.forEach(fn=>fn(e));}
}
