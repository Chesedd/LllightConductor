#pragma once

#include "pico_slave/config.hpp"
#include "pico_slave/output_controller.hpp"

#include <array>

namespace pico_slave {
class PicoOutputController final : public OutputController {
 public:
  bool initialize() override;
  bool resetAll() override;
  bool validateOutput(uint8_t output_id) const override;
  bool applyBatch(const OutputUpdate* updates, std::size_t count) override;
  std::size_t configuredCount() const override { return config::kOutputs.size(); }
  bool readState(uint8_t output_id, bool& on) const override;
 private:
  const config::OutputDefinition* find(uint8_t id) const;
  std::array<bool, config::kOutputs.size()> states_{};
};
}  // namespace pico_slave
