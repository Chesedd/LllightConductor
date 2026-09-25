#include "pico_slave/command_processor.hpp"

#include <array>

namespace pico_slave {
CommandProcessor::CommandProcessor(uint8_t address, uint16_t firmware_id, OutputController& outputs)
    : slave_address_(address), firmware_id_(firmware_id), outputs_(outputs) {}

bool CommandProcessor::initialize() {
  if (!outputs_.initialize() || !outputs_.resetAll()) { error_flags_ |= kErrorOutput; return false; }
  return true;
}
void CommandProcessor::makeResponse(const Frame& r, MessageType type, Frame& out) {
  out = {}; out.message_type = static_cast<uint8_t>(type); out.slave_address = slave_address_;
  out.sequence = r.sequence; out.session_id = r.session_id;
}
void CommandProcessor::makeNack(const Frame& r, NackCode code, Frame& out) {
  makeResponse(r, MessageType::Nack, out); out.payload_length = 1; out.payload[0] = static_cast<uint8_t>(code);
}
void CommandProcessor::cache(uint16_t sequence, const Frame& response) {
  cache_valid_ = true; cached_sequence_ = sequence; cached_response_ = response;
}

bool CommandProcessor::process(const Frame& r, Frame& out) {
  if (r.slave_address != slave_address_ || r.slave_address == 255) return false;
  if (r.version != kProtocolVersion) { makeNack(r, NackCode::UnsupportedVersion, out); return true; }
  if (r.message_type == static_cast<uint8_t>(MessageType::Hello)) {
    if (r.payload_length != 0) { makeNack(r, NackCode::InvalidPayload, out); error_flags_ |= kErrorInvalidCommand; return true; }
    if (!session_active_ || r.session_id != session_id_) {
      if (!outputs_.resetAll()) { makeNack(r, NackCode::InternalError, out); error_flags_ |= kErrorOutput; return true; }
      session_active_ = true; session_id_ = r.session_id; cache_valid_ = false;
    } else if (cache_valid_ && r.sequence == cached_sequence_) { out = cached_response_; return true; }
    makeResponse(r, MessageType::HelloAck, out); out.payload_length = 5;
    out.payload[0] = uint8_t(firmware_id_); out.payload[1] = uint8_t(firmware_id_ >> 8);
    out.payload[2] = 1; out.payload[3] = 0; out.payload[4] = uint8_t(outputs_.configuredCount());
    cache(r.sequence, out); return true;
  }
  if (!session_active_ || r.session_id != session_id_) { makeNack(r, NackCode::BadSession, out); return true; }
  if (cache_valid_ && r.sequence == cached_sequence_) { out = cached_response_; return true; }
  const bool produced = handleCommand(r, out);
  if (produced) cache(r.sequence, out);
  return produced;
}

bool CommandProcessor::handleCommand(const Frame& r, Frame& out) {
  const auto type = static_cast<MessageType>(r.message_type);
  if (type == MessageType::Ping) {
    if (r.payload_length != 4) makeNack(r, NackCode::InvalidPayload, out);
    else { makeResponse(r, MessageType::Pong, out); out.payload_length = 4; for (int i=0;i<4;++i) out.payload[i]=r.payload[i]; }
    return true;
  }
  if (type == MessageType::ResetOutputs) {
    if (r.payload_length != 0) makeNack(r, NackCode::InvalidPayload, out);
    else if (!outputs_.resetAll()) { makeNack(r, NackCode::InternalError, out); error_flags_ |= kErrorOutput; }
    else makeResponse(r, MessageType::Ack, out);
    return true;
  }
  if (type == MessageType::SetOutputs) {
    if (r.payload_length < 3 || r.payload[0] == 0 || r.payload[0] > 31 || r.payload_length != 1 + 2 * r.payload[0]) {
      makeNack(r, NackCode::InvalidPayload, out); error_flags_ |= kErrorInvalidCommand; return true;
    }
    std::array<OutputUpdate, 31> updates{}; std::array<bool, 256> seen{};
    for (uint8_t i = 0; i < r.payload[0]; ++i) {
      const uint8_t id = r.payload[1 + i * 2], state = r.payload[2 + i * 2];
      if (seen[id]) { makeNack(r, NackCode::InvalidPayload, out); error_flags_ |= kErrorInvalidCommand; return true; }
      if (!outputs_.validateOutput(id)) { makeNack(r, NackCode::InvalidOutput, out); error_flags_ |= kErrorInvalidCommand; return true; }
      if (state > 1) { makeNack(r, NackCode::InvalidState, out); error_flags_ |= kErrorInvalidCommand; return true; }
      seen[id] = true; updates[i] = {id, state == 1};
    }
    if (!outputs_.applyBatch(updates.data(), r.payload[0])) { makeNack(r, NackCode::InternalError, out); error_flags_ |= kErrorOutput; }
    else makeResponse(r, MessageType::Ack, out);
    return true;
  }
  if (type == MessageType::GetStatus) {
    if (r.payload_length != 0) { makeNack(r, NackCode::InvalidPayload, out); return true; }
    makeResponse(r, MessageType::Status, out);
    uint8_t highest = 0; bool any = false;
    for (unsigned id = 0; id < 256; ++id) if (outputs_.validateOutput(uint8_t(id))) { highest = uint8_t(id); any = true; }
    const uint8_t bitmap_length = any ? uint8_t(highest / 8 + 1) : 0;
    out.payload_length = 7 + bitmap_length; out.payload[0] = kProtocolVersion; out.payload[1] = slave_address_;
    out.payload[2] = 1; out.payload[3] = uint8_t(outputs_.configuredCount());
    out.payload[4] = uint8_t(error_flags_); out.payload[5] = uint8_t(error_flags_ >> 8); out.payload[6] = bitmap_length;
    for (uint8_t i=0;i<bitmap_length;++i) out.payload[7+i]=0;
    for (unsigned id=0;id<256;++id) { bool on=false; if (outputs_.readState(uint8_t(id), on) && on) out.payload[7+id/8] |= uint8_t(1u << (id%8)); }
    return true;
  }
  makeNack(r, NackCode::UnknownMessage, out); error_flags_ |= kErrorInvalidCommand; return true;
}
}  // namespace pico_slave
