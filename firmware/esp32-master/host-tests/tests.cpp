#include "master/desktop_command_processor.hpp"
#include "master/pico_command_sender.hpp"
#include "master/prepared_show.hpp"
#include "master/protocol.hpp"
#include "master/scheduler.hpp"
#include "master/sha256.hpp"
#include "master/show_controller.hpp"
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <vector>
using namespace master;
#define CHECK(x)                                                               \
  do {                                                                         \
    if (!(x)) {                                                                \
      std::fprintf(stderr, "FAIL %d: %s\n", __LINE__, #x);                     \
      std::exit(1);                                                            \
    }                                                                          \
  } while (0)
struct Clock : MonotonicClock {
  int64_t us{};
  int64_t now_us() const override { return us; }
};
struct Wire : PicoTransport {
  std::vector<uint8_t> addresses;
  std::vector<std::vector<uint8_t>> sent;
  bool fail{};
  bool send(uint8_t address, const uint8_t *p, size_t n) override {
    addresses.push_back(address);
    sent.emplace_back(p, p + n);
    return !fail;
  }
  size_t receive(uint8_t *, size_t) override { return 0; }
};
protocol::Frame decode(const std::vector<uint8_t> &b) {
  protocol::Frame f;
  CHECK(protocol::decode(b.data(), b.size(), f));
  return f;
}

struct DesktopWire : DesktopTransport {
  std::vector<uint8_t> last;
  bool send(const uint8_t *p, size_t n) override {
    last.assign(p, p + n);
    return true;
  }
};
struct Identity : DeviceIdentityProvider {
  void device_id(uint8_t out[16]) const override {
    for (int i = 0; i < 16; i++)
      out[i] = uint8_t(i);
  }
};
struct Store : NetworkConfigStore {
  NetworkConfig value{"old", "secret", 3333};
  int saves{};
  bool load(NetworkConfig &o) override {
    o = value;
    return true;
  }
  bool save(const NetworkConfig &v) override {
    value = v;
    saves++;
    return true;
  }
};
struct Updater : FirmwareUpdater {
  std::vector<uint8_t> bytes;
  std::array<uint8_t, 32> expected{};
  bool cancelled{}, staged{};
  bool begin(uint32_t, const std::array<uint8_t, 32> &h, uint16_t &m) override {
    bytes.clear();
    expected = h;
    m = 16;
    return true;
  }
  bool write(uint32_t off, const uint8_t *p, size_t n) override {
    if (off != bytes.size())
      return false;
    bytes.insert(bytes.end(), p, p + n);
    return true;
  }
  bool finish(std::array<uint8_t, 32> &actual) override {
    actual = sha256(bytes.data(), bytes.size());
    staged = actual == expected;
    return staged;
  }
  void cancel() override {
    cancelled = true;
    bytes.clear();
  }
};
struct System : SystemControl {
  int restarts{};
  void restart() override { restarts++; }
};
static desktop_protocol::Frame transact(DesktopCommandProcessor &p,
                                        DesktopWire &w,
                                        desktop_protocol::Frame f) {
  desktop_protocol::Bytes b;
  CHECK(desktop_protocol::encode(f, b));
  p.ingest(b.data.data(), b.size);
  desktop_protocol::Frame out;
  CHECK(desktop_protocol::decode(w.last.data(), w.last.size(), out));
  return out;
}
struct Sink : FrameSink {
  bool dispatch(const PreparedFrame &) override { return true; }
};
int main() {
  const uint8_t check[] = {'1', '2', '3', '4', '5', '6', '7', '8', '9'};
  CHECK(protocol::crc16(check, 9) == 0x29b1);
  Wire w;
  PicoCommandSender sender(w, 0x89abcdef);
  CHECK(sender.add_slave(7));
  CHECK(sender.send_reset(7));
  auto reset = decode(w.sent.back());
  CHECK(reset.type == protocol::Type::ResetOutputs && reset.sequence == 0 &&
        reset.session == 0x89abcdef);
  const std::vector<uint8_t> resetGolden = {
      0xA5, 0x5A, 2, 5, 7, 0, 0, 0xEF, 0xCD, 0xAB, 0x89, 0, 0, 0x3C, 0x0A};
  CHECK(w.sent.back() == resetGolden);
  PreparedOutputUpdate updates[] = {{1, OutputState::On},
                                    {2, OutputState::Off}};
  PreparedSlaveBatch batch{7, updates, 2};
  CHECK(sender.send_updates(batch));
  auto set = decode(w.sent.back());
  CHECK(set.type == protocol::Type::SetOutputs && set.payload[0] == 2 &&
        set.sequence == 1);
  CHECK(sender.online_count() == 0 && sender.configured_count() == 1);
  Clock c;
  ShowScheduler *slot = nullptr;
  ShowController controller(sender, slot);
  ShowScheduler scheduler(c, controller);
  slot = &scheduler;
  PreparedSlaveBatch batches[] = {{7, updates, 2}};
  PreparedFrame frames[] = {{0, batches, 1}, {100, batches, 1}};
  PreparedMasterShow show{100, frames, 2};
  CHECK(controller.load(show));
  auto n = w.sent.size();
  CHECK(controller.prepare());
  CHECK(controller.state() == ShowState::Ready && w.sent.size() == n + 1);
  CHECK(controller.start());
  CHECK(controller.state() == ShowState::Running);
  controller.tick();
  CHECK(decode(w.sent.back()).type == protocol::Type::SetOutputs);
  c.us = 100000;
  controller.tick();
  CHECK(controller.state() == ShowState::Ready);
  n = w.sent.size();
  controller.stop();
  CHECK(controller.state() == ShowState::Idle && w.sent.size() == n + 1 &&
        decode(w.sent.back()).type == protocol::Type::ResetOutputs);
  controller.stop();
  CHECK(controller.state() == ShowState::Idle);
  CHECK(sender.online_count() == 0);

  // Replacing a prepared show resets its old target before removing it.
  // Preparing the replacement registers only its previously unseen Pico
  // address.
  CHECK(controller.load(show));
  CHECK(controller.prepare());
  CHECK(sender.configured_count() == 1 && sender.find(7));
  n = w.sent.size();
  CHECK(controller.unload());
  CHECK(controller.state() == ShowState::Idle);
  CHECK(w.sent.size() == n + 1);
  CHECK(w.addresses.back() == 7);
  CHECK(decode(w.sent.back()).type == protocol::Type::ResetOutputs);
  CHECK(sender.configured_count() == 0 && !sender.find(7));
  PreparedOutputUpdate update_b[] = {{3, OutputState::On}};
  PreparedSlaveBatch batch_b[] = {{19, update_b, 1}};
  PreparedFrame frame_b[] = {{0, batch_b, 1}};
  PreparedMasterShow show_b{10, frame_b, 1};
  CHECK(controller.load(show_b));
  CHECK(controller.prepare());
  CHECK(sender.configured_count() == 1 && !sender.find(7) && sender.find(19));
  CHECK(controller.start());
  controller.tick();
  CHECK(w.addresses.back() == 19);
  CHECK(decode(w.sent.back()).type == protocol::Type::SetOutputs);
  controller.stop();
  CHECK(controller.state() == ShowState::Idle);
  CHECK(controller.load(show_b));
  CHECK(controller.prepare());
  CHECK(controller.start());
  CHECK(controller.state() == ShowState::Running);
  controller.stop();
  CHECK(controller.unload());
  CHECK(sender.configured_count() == 0);
  PreparedSlaveBatch batch_c[] = {{23, update_b, 1}};
  PreparedFrame frame_c[] = {{0, batch_c, 1}};
  PreparedMasterShow show_c{10, frame_c, 1};
  CHECK(controller.load(show_c));
  CHECK(controller.prepare());
  CHECK(sender.configured_count() == 1 && sender.find(23) && !sender.find(19));
  CHECK(controller.unload());
  CHECK(sender.configured_count() == 0);

  // A failed mandatory reset is surfaced and still leaves no stale targets or
  // show.
  CHECK(controller.load(show));
  CHECK(controller.prepare());
  w.fail = true;
  CHECK(!controller.unload());
  CHECK(controller.state() == ShowState::Fault);
  CHECK(sender.configured_count() == 0);
  w.fail = false;

  // Remote-maintenance protocol is isolated behind fakes and preserves secrets.
  Wire mw;
  PicoCommandSender ms(mw, 1);
  ShowScheduler *mslot = nullptr;
  ShowController mc(ms, mslot);
  Clock mclock;
  ShowScheduler msch(mclock, mc);
  mslot = &msch;
  DesktopWire dw;
  Identity ident;
  Store store;
  Updater updater;
  System system;
  DesktopCommandProcessor cp(dw, ident, mc, ms, &msch, &store, &updater,
                             &system, true);
  desktop_protocol::Frame req;
  req.type = desktop_protocol::Type::Hello;
  req.sequence = 1;
  req.session_id = 77;
  req.payload[0] = 1;
  req.payload_size = 1;
  CHECK(transact(cp, dw, req).type == desktop_protocol::Type::HelloAck);
  req.type = desktop_protocol::Type::GetNetworkConfig;
  req.sequence++;
  req.payload_size = 0;
  auto net = transact(cp, dw, req);
  CHECK(net.type == desktop_protocol::Type::NetworkConfig &&
        net.payload_size == 9);
  CHECK(std::find(net.payload.begin(), net.payload.begin() + net.payload_size,
                  uint8_t('s')) == net.payload.begin() + net.payload_size);
  CHECK(net.payload[8] == 1);
  req.type = desktop_protocol::Type::SetNetworkConfig;
  req.sequence++;
  const uint8_t set_payload[] = {1, 3, 'n', 'e', 'w', 0, 0, 0x5c, 0x11};
  std::copy(std::begin(set_payload), std::end(set_payload),
            req.payload.begin());
  req.payload_size = sizeof set_payload;
  CHECK(transact(cp, dw, req).type == desktop_protocol::Type::Ack);
  CHECK(store.value.ssid == "new" && store.value.password == "secret" &&
        store.value.tcp_port == 4444);
  req.type = desktop_protocol::Type::RebootDevice;
  req.sequence++;
  req.payload_size = 0;
  CHECK(transact(cp, dw, req).type == desktop_protocol::Type::Ack);
  CHECK(system.restarts == 0);
  cp.tick();
  CHECK(system.restarts == 1);
  std::vector<uint8_t> fw = {1, 2, 3, 4};
  auto fh = sha256(fw.data(), fw.size());
  req.type = desktop_protocol::Type::BeginFirmwareUpdate;
  req.sequence++;
  req.payload[0] = 1;
  desktop_protocol::write32(req.payload.data() + 1, fw.size());
  std::copy(fh.begin(), fh.end(), req.payload.begin() + 5);
  req.payload_size = 37;
  CHECK(transact(cp, dw, req).type ==
        desktop_protocol::Type::FirmwareUpdateReady);
  req.type = desktop_protocol::Type::FirmwareUpdateChunk;
  req.sequence++;
  desktop_protocol::write32(req.payload.data(), 0);
  std::copy(fw.begin(), fw.end(), req.payload.begin() + 4);
  req.payload_size = 8;
  CHECK(transact(cp, dw, req).type == desktop_protocol::Type::Ack);
  req.sequence++;
  CHECK(transact(cp, dw, req).type == desktop_protocol::Type::Ack);
  CHECK(updater.bytes.size() == 4);
  req.type = desktop_protocol::Type::EndFirmwareUpdate;
  req.sequence++;
  req.payload_size = 0;
  auto done = transact(cp, dw, req);
  CHECK(done.type == desktop_protocol::Type::FirmwareUpdateComplete &&
        updater.staged);
  std::puts("All ESP32 open-loop v2 host tests passed");
}
