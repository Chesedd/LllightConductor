import {describe,expect,it} from 'vitest';
import {beginFirmwareUpdate,firmwareUpdateChunk,getNetworkConfig,setNetworkConfig} from './messages';
import {DesktopMessageType as M} from './protocol';

describe('remote maintenance messages',()=>{
 it('encodes GET and SET without exposing or requiring a password',()=>{expect(getNetworkConfig(1,2).messageType).toBe(M.GET_NETWORK_CONFIG);const keep=setNetworkConfig(2,2,'studio',undefined,4444).payload;expect([...keep.slice(0,2)]).toEqual([1,6]);expect(keep[8]).toBe(0);expect(keep[9]).toBe(0);expect(new DataView(keep.buffer).getUint16(10,true)).toBe(4444);const replace=setNetworkConfig(3,2,'studio','secret',3333).payload;expect(replace[8]).toBe(1);expect(replace[9]).toBe(6);});
 it('encodes firmware begin and ordered chunks',()=>{const hash=new Uint8Array(32).fill(7),begin=beginFirmwareUpdate(1,9,1234,hash),chunk=firmwareUpdateChunk(2,9,100,new Uint8Array([1,2]));expect(begin.messageType).toBe(M.BEGIN_FIRMWARE_UPDATE);expect(new DataView(begin.payload.buffer).getUint32(1,true)).toBe(1234);expect(chunk.messageType).toBe(M.FIRMWARE_UPDATE_CHUNK);expect(new DataView(chunk.payload.buffer).getUint32(0,true)).toBe(100);expect([...chunk.payload.slice(4)]).toEqual([1,2]);});
});
