#pragma once

#include <cstddef>
#include <cstdint>

namespace pico_slave {

struct OutputUpdate { uint8_t output_id; bool on; };

class OutputController {
 public:
  virtual ~OutputController() = default;
  virtual bool initialize() = 0;
  virtual bool resetAll() = 0;
  virtual bool validateOutput(uint8_t output_id) const = 0;
  virtual bool applyBatch(const OutputUpdate* updates, std::size_t count) = 0;
  virtual std::size_t configuredCount() const = 0;
  virtual bool readState(uint8_t output_id, bool& on) const = 0;
};

}  // namespace pico_slave
