#pragma once
#include <array>
#include <cstddef>
#include <cstdint>

namespace master::protocol {
constexpr uint8_t kVersion = 2;
constexpr size_t kMaxPayload = 64;
constexpr size_t kMaxFrame = 15 + kMaxPayload;
enum class Type : uint8_t { ResetOutputs=5, SetOutputs=6 };
struct Frame { Type type{}; uint8_t address{}; uint16_t sequence{}; uint32_t session{};
  std::array<uint8_t,kMaxPayload> payload{}; uint16_t payload_size{}; };
struct Bytes { std::array<uint8_t,kMaxFrame> data{}; size_t size{}; };
uint16_t crc16(const uint8_t* data, size_t size);
bool encode(const Frame& frame, Bytes& out);
bool decode(const uint8_t* bytes, size_t size, Frame& out);

class Parser {
 public:
  using Handler = void (*)(void*, const Frame&);
  void push(const uint8_t* data, size_t size, Handler handler, void* context);
 private:
  std::array<uint8_t,kMaxFrame> buffer_{}; size_t size_{};
};
}  // namespace master::protocol
