#pragma once
#include "master/prepared_show.hpp"
#include <cstddef>
#include <cstdint>
#include <vector>
namespace master {
class OwnedPreparedMasterShow {
 public:
  struct Batch { uint8_t address{};std::vector<PreparedOutputUpdate> updates; };
  struct Frame { uint32_t time_ms{};std::vector<Batch> batches; };
  uint32_t duration_ms{};std::vector<Frame> frames;
  OwnedPreparedMasterShow()=default;OwnedPreparedMasterShow(const OwnedPreparedMasterShow&);OwnedPreparedMasterShow& operator=(const OwnedPreparedMasterShow&);
  OwnedPreparedMasterShow(OwnedPreparedMasterShow&&) noexcept;OwnedPreparedMasterShow& operator=(OwnedPreparedMasterShow&&) noexcept;
  const PreparedMasterShow& view() const;
 private:mutable std::vector<std::vector<PreparedSlaveBatch>> batch_views_;mutable std::vector<PreparedFrame> frame_views_;mutable PreparedMasterShow view_{};void rebuild()const;
};
bool decode_prepared_master_binary(const uint8_t*,size_t,OwnedPreparedMasterShow&);
}
