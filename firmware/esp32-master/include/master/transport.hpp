#pragma once
#include <cstddef>
#include <cstdint>
namespace master {
class PicoTransport { public: virtual ~PicoTransport()=default;
  virtual bool send(uint8_t address, const uint8_t* bytes, size_t size)=0;
  virtual size_t receive(uint8_t* bytes, size_t capacity)=0; };
class MonotonicClock { public: virtual ~MonotonicClock()=default; virtual int64_t now_us() const=0; };
}  // namespace master
