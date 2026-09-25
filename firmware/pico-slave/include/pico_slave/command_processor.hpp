#pragma once

#include "pico_slave/output_controller.hpp"
#include "pico_slave/protocol.hpp"

namespace pico_slave {

constexpr uint16_t kErrorParser = 1u << 0;
constexpr uint16_t kErrorInvalidCommand = 1u << 1;
constexpr uint16_t kErrorOutput = 1u << 2;

class CommandProcessor {
 public:
  CommandProcessor(uint8_t slave_address, uint16_t firmware_id,
                   OutputController& outputs);
  bool initialize();
  bool process(const Frame& request, Frame& response);
  void noteParserError() { error_flags_ |= kErrorParser; }
  bool sessionActive() const { return session_active_; }

 private:
  void makeResponse(const Frame& request, MessageType type, Frame& response);
  void makeNack(const Frame& request, NackCode code, Frame& response);
  void cache(uint16_t sequence, const Frame& response);
  bool handleCommand(const Frame& request, Frame& response);

  uint8_t slave_address_;
  uint16_t firmware_id_;
  OutputController& outputs_;
  bool session_active_{};
  uint32_t session_id_{};
  bool cache_valid_{};
  uint16_t cached_sequence_{};
  Frame cached_response_{};
  uint16_t error_flags_{};
};

}  // namespace pico_slave
