#pragma once
#include <array>
#include <cstddef>
#include <cstdint>

namespace master::desktop_protocol {
constexpr size_t kMaxPayload=1024, kMaxFrame=1040;
enum class Type:uint8_t { Hello=0x01,HelloAck=0x02,Ack=0x03,Nack=0x04,GetStatus=0x10,Status=0x11,BeginUpload=0x20,UploadReady=0x21,UploadChunk=0x22,EndUpload=0x23,UploadComplete=0x24,ActivateShow=0x30,StartShow=0x31,StopShow=0x32,GetNetworkConfig=0x40,NetworkConfig=0x41,SetNetworkConfig=0x42,RebootDevice=0x43,BeginFirmwareUpdate=0x50,FirmwareUpdateReady=0x51,FirmwareUpdateChunk=0x52,EndFirmwareUpdate=0x53,FirmwareUpdateComplete=0x54,CancelFirmwareUpdate=0x55 };
enum class Nack:uint8_t { UnknownMessage=1,InvalidPayload=2,BadSession=3,InvalidState=4,UnsupportedVersion=5,UploadTooLarge=6,UploadOffset=7,UploadConflict=8,HashMismatch=9,InvalidShow=10,NoShow=11,Busy=12,InternalError=13 };
struct Frame { Type type{};uint16_t sequence{};uint32_t session_id{};std::array<uint8_t,kMaxPayload> payload{};size_t payload_size{}; };
struct Bytes { std::array<uint8_t,kMaxFrame> data{};size_t size{}; };
uint32_t crc32(const uint8_t*,size_t);
bool encode(const Frame&,Bytes&); bool decode(const uint8_t*,size_t,Frame&);
enum class ParseError:uint8_t { BadCrc,OversizedPayload,UnsupportedVersion };
class Parser { public: using FrameCallback=void(*)(void*,const Frame&);using ErrorCallback=void(*)(void*,ParseError);
 void push(const uint8_t*,size_t,FrameCallback,ErrorCallback,void*);void reset(){size_=0;}
 private:std::array<uint8_t,kMaxFrame> buffer_{};size_t size_{};void discard(size_t);
};
inline uint16_t read16(const uint8_t*p){return uint16_t(p[0])|uint16_t(p[1])<<8;} inline uint32_t read32(const uint8_t*p){return uint32_t(p[0])|uint32_t(p[1])<<8|uint32_t(p[2])<<16|uint32_t(p[3])<<24;}
inline void write16(uint8_t*p,uint16_t v){p[0]=uint8_t(v);p[1]=uint8_t(v>>8);} inline void write32(uint8_t*p,uint32_t v){p[0]=uint8_t(v);p[1]=uint8_t(v>>8);p[2]=uint8_t(v>>16);p[3]=uint8_t(v>>24);}
}
