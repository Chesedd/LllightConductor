#pragma once
#include "master/desktop_transport.hpp"
#include <cstddef>
#include <cstdint>
#include <string>
namespace master {
struct DesktopTcpConfig {
  std::string ssid;
  std::string password;
  uint16_t port = 3333;
};
class EspDesktopTcp final : public DesktopTransport {
public:
  explicit EspDesktopTcp(DesktopTcpConfig config)
      : config_(std::move(config)) {}
  ~EspDesktopTcp();
  bool init();
  size_t receive(uint8_t *buffer, size_t capacity);
  bool send(const uint8_t *bytes, size_t count) override;
  bool recovery_mode() const { return recovery_; }

private:
  static void event_handler(void *arg, const char *base, int32_t id,
                            void *data);
  void on_event(const char *base, int32_t id, void *data);
  bool open_listener(uint16_t port, uint32_t address);
  bool start_recovery();
  void close_client();
  void close_listener();
  DesktopTcpConfig config_;
  int listener_ = -1;
  int client_ = -1;
  bool initialized_ = false, recovery_ = false, got_ip_ = false;
  int64_t started_us_ = 0;
};
} // namespace master
