#include "master/esp_remote_maintenance.hpp"
#include "esp_system.h"
#include "nvs.h"
#include <vector>
namespace master {
bool EspNetworkConfigStore::load(NetworkConfig &out) {
  nvs_handle_t h;
  if (nvs_open("lllight_net", NVS_READONLY, &h) != ESP_OK) {
    out = defaults_;
    return true;
  }
  size_t a = 0, b = 0;
  uint16_t port = 0;
  bool ok = nvs_get_str(h, "ssid", nullptr, &a) == ESP_OK &&
            nvs_get_str(h, "password", nullptr, &b) == ESP_OK &&
            nvs_get_u16(h, "tcp_port", &port) == ESP_OK;
  if (ok) {
    std::vector<char> s(a), p(b);
    ok = nvs_get_str(h, "ssid", s.data(), &a) == ESP_OK &&
         nvs_get_str(h, "password", p.data(), &b) == ESP_OK;
    if (ok)
      out = {s.data(), p.data(), port};
  }
  nvs_close(h);
  if (!ok)
    out = defaults_;
  return true;
}
bool EspNetworkConfigStore::save(const NetworkConfig &v) {
  if (!valid_network_config(v))
    return false;
  nvs_handle_t h;
  if (nvs_open("lllight_net", NVS_READWRITE, &h) != ESP_OK)
    return false;
  bool ok = nvs_set_str(h, "ssid", v.ssid.c_str()) == ESP_OK &&
            nvs_set_str(h, "password", v.password.c_str()) == ESP_OK &&
            nvs_set_u16(h, "tcp_port", v.tcp_port) == ESP_OK &&
            nvs_commit(h) == ESP_OK;
  nvs_close(h);
  return ok;
}
bool EspFirmwareUpdater::begin(uint32_t size,
                               const std::array<uint8_t, 32> &expected,
                               uint16_t &maximum) {
  cancel();
  partition_ = esp_ota_get_next_update_partition(nullptr);
  if (!partition_ || size > partition_->size ||
      esp_ota_begin(partition_, size, &handle_) != ESP_OK)
    return false;
  mbedtls_sha256_init(&sha_);
  if (mbedtls_sha256_starts(&sha_, 0) != 0) {
    esp_ota_abort(handle_);
    mbedtls_sha256_free(&sha_);
    handle_ = 0;
    partition_ = nullptr;
    active_ = false;
    return false;
  }
  active_ = true;
  expected_ = expected;
  maximum = 1020;
  return true;
}
bool EspFirmwareUpdater::write(uint32_t, const uint8_t *b, size_t n) {
  return active_ && esp_ota_write(handle_, b, n) == ESP_OK &&
         mbedtls_sha256_update(&sha_, b, n) == 0;
}
bool EspFirmwareUpdater::finish(std::array<uint8_t, 32> &actual) {
  if (!active_ || mbedtls_sha256_finish(&sha_, actual.data()) != 0)
    return false;
  mbedtls_sha256_free(&sha_);
  if (actual != expected_) {
    esp_ota_abort(handle_);
    active_ = false;
    handle_ = 0;
    partition_ = nullptr;
    return false;
  }
  if (esp_ota_end(handle_) != ESP_OK) {
    active_ = false;
    handle_ = 0;
    partition_ = nullptr;
    return false;
  }
  active_ = false;
  const auto *partition = partition_;
  handle_ = 0;
  partition_ = nullptr;
  return esp_ota_set_boot_partition(partition) == ESP_OK;
}
void EspFirmwareUpdater::cancel() {
  if (active_) {
    esp_ota_abort(handle_);
    mbedtls_sha256_free(&sha_);
  }
  active_ = false;
  handle_ = 0;
  partition_ = nullptr;
}
void EspSystemControl::restart() { esp_restart(); }
} // namespace master
