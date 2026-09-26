import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export const DESKTOP_SERIAL_BAUD = 460_800;
export interface SerialPortDescriptor { portName:string; portType:string; vid?:number; pid?:number; manufacturer?:string; product?:string; serialNumber?:string }
export type TransportErrorCode='PortNotFound'|'PortBusy'|'PermissionDenied'|'OpenFailed'|'ReadFailed'|'WriteFailed'|'Disconnected';
export class DesktopTransportError extends Error { constructor(readonly code:TransportErrorCode,message:string){super(message);this.name='DesktopTransportError';} }
export interface DesktopEsp32Transport { listPorts():Promise<SerialPortDescriptor[]>; open(portName:string):Promise<void>; close():Promise<void>; write(bytes:Uint8Array):Promise<void>; onBytes(listener:(bytes:Uint8Array)=>void):()=>void; onDisconnect(listener:(error:DesktopTransportError)=>void):()=>void }
type NativeError={code?:TransportErrorCode;message?:string};
const nativeError=(cause:unknown,fallback:TransportErrorCode)=>{const e=cause as NativeError;return new DesktopTransportError(e?.code??fallback,e?.message??String(cause));};

/** Tauri IPC sends bounded read chunks as JSON byte arrays; no hex expansion or protocol work crosses the native boundary. */
export class TauriSerialPortGateway implements DesktopEsp32Transport {
 private bytes=new Set<(bytes:Uint8Array)=>void>(); private disconnects=new Set<(error:DesktopTransportError)=>void>(); private unlisten:UnlistenFn[]=[];
 async listPorts(){try{return await invoke<SerialPortDescriptor[]>('list_serial_ports');}catch(e){throw nativeError(e,'OpenFailed');}}
 async open(portName:string){await this.installListeners();try{await invoke('open_serial_port',{portName});}catch(e){throw nativeError(e,'OpenFailed');}}
 async close(){try{await invoke('close_serial_port');}catch(e){throw nativeError(e,'Disconnected');}finally{this.removeListeners();}}
 async write(bytes:Uint8Array){try{await invoke('write_serial',{bytes:Array.from(bytes)});}catch(e){throw nativeError(e,'WriteFailed');}}
 onBytes(listener:(bytes:Uint8Array)=>void){this.bytes.add(listener);return()=>this.bytes.delete(listener);}
 onDisconnect(listener:(error:DesktopTransportError)=>void){this.disconnects.add(listener);return()=>this.disconnects.delete(listener);}
 private async installListeners(){if(this.unlisten.length)return;this.unlisten.push(await listen<number[]>('serial://bytes',e=>this.bytes.forEach(fn=>fn(Uint8Array.from(e.payload)))));this.unlisten.push(await listen<NativeError>('serial://disconnect',e=>{const error=nativeError(e.payload,'Disconnected');this.disconnects.forEach(fn=>fn(error));}));}
 private removeListeners(){this.unlisten.splice(0).forEach(fn=>fn());}
}

export class FakeDesktopEsp32Transport implements DesktopEsp32Transport {
 readonly writes:Uint8Array[]=[]; ports:SerialPortDescriptor[]=[{portName:'COM7',portType:'usb'}]; isOpen=false; private bytes=new Set<(b:Uint8Array)=>void>();private disconnects=new Set<(e:DesktopTransportError)=>void>();
 async listPorts(){return structuredClone(this.ports);} async open(portName:string){if(!this.ports.some(p=>p.portName===portName))throw new DesktopTransportError('PortNotFound',portName);this.isOpen=true;} async close(){this.isOpen=false;} async write(bytes:Uint8Array){if(!this.isOpen)throw new DesktopTransportError('Disconnected','closed');this.writes.push(bytes.slice());}
 onBytes(fn:(b:Uint8Array)=>void){this.bytes.add(fn);return()=>this.bytes.delete(fn);}onDisconnect(fn:(e:DesktopTransportError)=>void){this.disconnects.add(fn);return()=>this.disconnects.delete(fn);}
 inject(bytes:Uint8Array,chunks:number[]=[bytes.length]){let at=0;for(const size of chunks){const part=bytes.slice(at,at+size);at+=size;if(part.length)this.bytes.forEach(fn=>fn(part));}if(at<bytes.length)this.bytes.forEach(fn=>fn(bytes.slice(at)));}
 disconnect(error=new DesktopTransportError('Disconnected','device removed')){this.isOpen=false;this.disconnects.forEach(fn=>fn(error));}
}
