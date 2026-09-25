#pragma once
#include <cstddef>
#include <cstdint>

namespace master {
enum class OutputState : uint8_t { Off=0, On=1 };
struct PreparedOutputUpdate { uint8_t output_id; OutputState state; };
struct PreparedSlaveBatch { uint8_t slave_address; const PreparedOutputUpdate* updates; size_t update_count; };
struct PreparedFrame { uint32_t time_ms; const PreparedSlaveBatch* batches; size_t batch_count; };
struct PreparedMasterShow { uint32_t duration_ms; const PreparedFrame* frames; size_t frame_count; };
bool validate_show(const PreparedMasterShow& show);
const PreparedMasterShow& demo_show();
}  // namespace master
