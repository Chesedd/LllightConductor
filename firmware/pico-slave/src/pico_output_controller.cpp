#include "pico_output_controller.hpp"

#include "hardware/gpio.h"

namespace pico_slave {
const config::OutputDefinition* PicoOutputController::find(uint8_t id) const {
  for (const auto& output : config::kOutputs) if (output.output_id == id) return &output;
  return nullptr;
}
bool PicoOutputController::initialize() {
  // Preload each pad's safe level before enabling its output driver.
  for (const auto& output : config::kOutputs) {
    gpio_init(output.gpio);
    gpio_put(output.gpio, output.active_high ? 0 : 1);
    gpio_set_dir(output.gpio, GPIO_OUT);
  }
  states_.fill(false); return true;
}
bool PicoOutputController::resetAll() {
  for (std::size_t i=0;i<config::kOutputs.size();++i) {
    const auto& output=config::kOutputs[i]; gpio_put(output.gpio, output.active_high ? 0 : 1); states_[i]=false;
  }
  return true;
}
bool PicoOutputController::validateOutput(uint8_t id) const { return find(id) != nullptr; }
bool PicoOutputController::applyBatch(const OutputUpdate* updates, std::size_t count) {
  std::array<const config::OutputDefinition*, 31> definitions{};
  for (std::size_t i=0;i<count;++i) definitions[i]=find(updates[i].output_id);
  // Callers validate first. Keep the physical switching loop intentionally tight.
  for (std::size_t i=0;i<count;++i) {
    const auto* output=definitions[i];
    gpio_put(output->gpio, updates[i].on == output->active_high);
  }
  for (std::size_t i=0;i<count;++i)
    for (std::size_t j=0;j<config::kOutputs.size();++j)
      if (config::kOutputs[j].output_id==updates[i].output_id) states_[j]=updates[i].on;
  return true;
}
bool PicoOutputController::readState(uint8_t id, bool& on) const {
  for (std::size_t i=0;i<config::kOutputs.size();++i) if (config::kOutputs[i].output_id==id) { on=states_[i]; return true; }
  return false;
}
}  // namespace pico_slave
