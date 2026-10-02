#include "pico_slave/protocol.hpp"

namespace pico_slave {
namespace {
uint16_t read16(const uint8_t* p) { return uint16_t(p[0]) | (uint16_t(p[1]) << 8); }
uint32_t read32(const uint8_t* p) {
  return uint32_t(p[0]) | (uint32_t(p[1]) << 8) | (uint32_t(p[2]) << 16) |
         (uint32_t(p[3]) << 24);
}
void write16(uint8_t* p, uint16_t v) { p[0] = uint8_t(v); p[1] = uint8_t(v >> 8); }
void write32(uint8_t* p, uint32_t v) {
  p[0] = uint8_t(v); p[1] = uint8_t(v >> 8); p[2] = uint8_t(v >> 16); p[3] = uint8_t(v >> 24);
}
}  // namespace

uint16_t crc16CcittFalse(const uint8_t* data, std::size_t length) {
  uint16_t crc = 0xFFFF;
  for (std::size_t i = 0; i < length; ++i) {
    crc ^= uint16_t(data[i]) << 8;
    for (int bit = 0; bit < 8; ++bit)
      crc = (crc & 0x8000) ? uint16_t((crc << 1) ^ 0x1021) : uint16_t(crc << 1);
  }
  return crc;
}

bool decodeFrame(const uint8_t* b, std::size_t length, Frame& f) {
  if (length < 15 || b[0] != kMagic0 || b[1] != kMagic1 || b[2] != kProtocolVersion || b[4] == 255) return false;
  const uint16_t payload_length = read16(b + 11);
  if (payload_length > kMaxPayload || length != kHeaderSize + payload_length + 2) return false;
  if (read16(b + kHeaderSize + payload_length) != crc16CcittFalse(b + 2, 11 + payload_length)) return false;
  f = {};
  f.version = b[2]; f.message_type = b[3]; f.slave_address = b[4];
  f.sequence = read16(b + 5); f.session_id = read32(b + 7); f.payload_length = payload_length;
  for (std::size_t i = 0; i < payload_length; ++i) f.payload[i] = b[kHeaderSize + i];
  return true;
}

std::size_t encodeFrame(const Frame& f, std::array<uint8_t, kMaxFrameSize>& b) {
  if (f.payload_length > kMaxPayload) return 0;
  b[0] = kMagic0; b[1] = kMagic1; b[2] = f.version; b[3] = f.message_type;
  b[4] = f.slave_address; write16(b.data() + 5, f.sequence); write32(b.data() + 7, f.session_id);
  write16(b.data() + 11, f.payload_length);
  for (std::size_t i = 0; i < f.payload_length; ++i) b[kHeaderSize + i] = f.payload[i];
  const auto crc = crc16CcittFalse(b.data() + 2, 11 + f.payload_length);
  write16(b.data() + kHeaderSize + f.payload_length, crc);
  return kHeaderSize + f.payload_length + 2;
}
}  // namespace pico_slave
