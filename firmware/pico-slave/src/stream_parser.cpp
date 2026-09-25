#include "pico_slave/stream_parser.hpp"

namespace pico_slave {
void StreamParser::reset() { size_ = 0; }
void StreamParser::discardPrefix(std::size_t n) {
  for (std::size_t i = n; i < size_; ++i) buffer_[i - n] = buffer_[i];
  size_ -= n;
}

StreamParser::Result StreamParser::feed(uint8_t byte, Frame& frame) {
  if (size_ == buffer_.size()) discardPrefix(1);
  buffer_[size_++] = byte;
  while (size_ >= 2 && (buffer_[0] != kMagic0 || buffer_[1] != kMagic1)) discardPrefix(1);
  if (size_ == 1 && buffer_[0] != kMagic0) { size_ = 0; return Result::None; }
  if (size_ < kHeaderSize) return Result::None;
  const std::size_t payload_length = std::size_t(buffer_[11]) | (std::size_t(buffer_[12]) << 8);
  if (payload_length > kMaxPayload) { discardPrefix(1); return Result::Error; }
  const std::size_t total = kHeaderSize + payload_length + 2;
  if (size_ < total) return Result::None;
  if (!decodeFrame(buffer_.data(), total, frame)) { discardPrefix(1); return Result::Error; }
  discardPrefix(total);
  return Result::FrameReady;
}
}  // namespace pico_slave
