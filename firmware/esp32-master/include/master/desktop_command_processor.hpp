#pragma once
#include "master/desktop_protocol.hpp"
#include "master/desktop_transport.hpp"
#include "master/prepared_binary.hpp"
#include "master/remote_maintenance.hpp"
#include "master/show_controller.hpp"
#include <array>
#include <memory>
#include <vector>
namespace master {
class DesktopCommandProcessor {
public:
  static constexpr size_t kMaxArtifactSize = 512 * 1024;
  DesktopCommandProcessor(DesktopTransport &, const DeviceIdentityProvider &,
                          ShowController &, PicoCommandSender &,
                          ShowScheduler *, NetworkConfigStore * = nullptr,
                          FirmwareUpdater * = nullptr,
                          SystemControl * = nullptr, bool recovery = false);
  void ingest(const uint8_t *, size_t);
  void tick();
  void set_recovery_mode(bool value) { recovery_ = value; }
  bool has_active() const { return bool(active_); }
  bool has_candidate() const { return bool(candidate_); }

private:
  struct Artifact {
    std::vector<uint8_t> bytes;
    std::array<uint8_t, 32> hash{};
    OwnedPreparedMasterShow show;
  };
  struct Upload {
    uint32_t expected{};
    std::array<uint8_t, 32> hash{};
    std::vector<uint8_t> bytes;
  };
  struct Replay {
    bool used{};
    uint16_t sequence{};
    uint32_t fingerprint{};
    desktop_protocol::Bytes response{};
  };
  struct Firmware {
    uint32_t expected{}, offset{}, last_offset{};
    std::array<uint8_t, 32> hash{};
    std::vector<uint8_t> last;
  };
  DesktopTransport &transport_;
  const DeviceIdentityProvider &identity_;
  ShowController &controller_;
  PicoCommandSender &sender_;
  ShowScheduler *scheduler_;
  NetworkConfigStore *net_;
  FirmwareUpdater *firmware_;
  SystemControl *system_;
  bool recovery_;
  bool reboot_pending_{};
  desktop_protocol::Parser parser_;
  uint32_t session_{};
  bool session_valid_{};
  bool start_pending_{};
  std::unique_ptr<Upload> upload_;
  std::unique_ptr<Firmware> firmware_upload_;
  std::unique_ptr<Artifact> candidate_, active_;
  std::array<Replay, 16> replay_{};
  size_t replay_next_{};
  static void parsed(void *, const desktop_protocol::Frame &);
  static void parse_error(void *, desktop_protocol::ParseError) {};
  void handle(const desktop_protocol::Frame &);
  desktop_protocol::Frame dispatch(const desktop_protocol::Frame &);
  desktop_protocol::Frame response(const desktop_protocol::Frame &,
                                   desktop_protocol::Type,
                                   const uint8_t * = nullptr, size_t = 0);
  desktop_protocol::Frame nack(const desktop_protocol::Frame &,
                               desktop_protocol::Nack);
  void send(const desktop_protocol::Frame &,
            desktop_protocol::Bytes *save = nullptr);
  uint8_t state() const;
  void status(const desktop_protocol::Frame &, desktop_protocol::Frame &);
  void abort_upload();
};
} // namespace master
