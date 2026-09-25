#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace pico_slave {

constexpr uint8_t kMagic0 = 0xA5;
constexpr uint8_t kMagic1 = 0x5A;
constexpr uint8_t kProtocolVersion = 1;
constexpr std::size_t kMaxPayload = 64;
constexpr std::size_t kHeaderSize = 13;
constexpr std::size_t kMaxFrameSize = kHeaderSize + kMaxPayload + 2;

enum class MessageType : uint8_t {
  Hello = 0x01, HelloAck = 0x02, Ping = 0x03, Pong = 0x04,
  ResetOutputs = 0x05, SetOutputs = 0x06, Ack = 0x07,
  Nack = 0x08, GetStatus = 0x09, Status = 0x0A,
};

enum class NackCode : uint8_t {
  UnknownMessage = 0x01, InvalidPayload = 0x02, InvalidOutput = 0x03,
  InvalidState = 0x04, BadSession = 0x05, UnsupportedVersion = 0x06,
  Busy = 0x07, InternalError = 0x08,
};

struct Frame {
  uint8_t version{kProtocolVersion};
  uint8_t message_type{};
  uint8_t slave_address{};
  uint16_t sequence{};
  uint32_t session_id{};
  uint16_t payload_length{};
  std::array<uint8_t, kMaxPayload> payload{};
};

uint16_t crc16CcittFalse(const uint8_t* data, std::size_t length);
bool decodeFrame(const uint8_t* bytes, std::size_t length, Frame& frame);
std::size_t encodeFrame(const Frame& frame,
                        std::array<uint8_t, kMaxFrameSize>& bytes);

}  // namespace pico_slave
