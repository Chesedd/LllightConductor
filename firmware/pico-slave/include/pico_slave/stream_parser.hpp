#pragma once

#include "pico_slave/protocol.hpp"

namespace pico_slave {

class StreamParser {
 public:
  enum class Result { None, FrameReady, Error };
  Result feed(uint8_t byte, Frame& frame);
  void reset();

 private:
  void discardPrefix(std::size_t count);
  std::array<uint8_t, kMaxFrameSize> buffer_{};
  std::size_t size_{};
};

}  // namespace pico_slave
