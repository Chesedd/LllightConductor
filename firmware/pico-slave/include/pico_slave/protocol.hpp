#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
namespace pico_slave {
constexpr uint8_t kMagic0=0xA5,kMagic1=0x5A,kProtocolVersion=2;constexpr std::size_t kMaxPayload=64,kHeaderSize=13,kMaxFrameSize=79;
enum class MessageType:uint8_t{ResetOutputs=0x05,SetOutputs=0x06};
struct Frame{uint8_t version{kProtocolVersion};uint8_t message_type{};uint8_t slave_address{};uint16_t sequence{};uint32_t session_id{};uint16_t payload_length{};std::array<uint8_t,kMaxPayload>payload{};};
uint16_t crc16CcittFalse(const uint8_t*,std::size_t);bool decodeFrame(const uint8_t*,std::size_t,Frame&);std::size_t encodeFrame(const Frame&,std::array<uint8_t,kMaxFrameSize>&);
}
