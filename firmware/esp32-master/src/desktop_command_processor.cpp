#include "master/desktop_command_processor.hpp"
#include "master/firmware_version.hpp"
#include "master/sha256.hpp"
#include <algorithm>
#include <cstring>
namespace master {
using namespace desktop_protocol;
DesktopCommandProcessor::DesktopCommandProcessor(
    DesktopTransport &t, const DeviceIdentityProvider &i, ShowController &c,
    PicoCommandSender &s, ShowScheduler *sc, NetworkConfigStore *n,
    FirmwareUpdater *f, SystemControl *sys, bool recovery)
    : transport_(t), identity_(i), controller_(c), sender_(s), scheduler_(sc),
      net_(n), firmware_(f), system_(sys), recovery_(recovery) {}
void DesktopCommandProcessor::ingest(const uint8_t *p, size_t n) {
  parser_.push(p, n, parsed, parse_error, this);
}
void DesktopCommandProcessor::tick() {
  controller_.tick();
  if (reboot_pending_ && system_) {
    reboot_pending_ = false;
    system_->restart();
  }
  if (start_pending_ && controller_.state() == ShowState::Ready) {
    if (controller_.start())
      start_pending_ = false;
  }
}
void DesktopCommandProcessor::parsed(void *c, const Frame &f) {
  static_cast<DesktopCommandProcessor *>(c)->handle(f);
}
Frame DesktopCommandProcessor::response(const Frame &r, Type t,
                                        const uint8_t *p, size_t n) {
  Frame x;
  x.type = t;
  x.sequence = r.sequence;
  x.session_id = r.session_id;
  x.payload_size = n;
  if (n)
    std::copy_n(p, n, x.payload.begin());
  return x;
}
Frame DesktopCommandProcessor::nack(const Frame &r, Nack n) {
  auto b = uint8_t(n);
  return response(r, Type::Nack, &b, 1);
}
void DesktopCommandProcessor::send(const Frame &f, Bytes *save) {
  Bytes b;
  if (encode(f, b)) {
    transport_.send(b.data.data(), b.size);
    if (save)
      *save = b;
  }
}
void DesktopCommandProcessor::abort_upload() { upload_.reset(); }
uint8_t DesktopCommandProcessor::state() const {
  if (upload_)
    return 1;
  switch (controller_.state()) {
  case ShowState::Running:
    return 3;
  case ShowState::Fault:
    return 4;
  case ShowState::Ready:
    return 2;
  default:
    return active_ ? 2 : 0;
  }
}
void DesktopCommandProcessor::handle(const Frame &r) {
  if (r.type == Type::Hello) {
    Frame out;
    if (r.payload_size != 1 || r.payload[0] != 1)
      out = nack(r, Nack::UnsupportedVersion);
    else {
      session_ = r.session_id;
      session_valid_ = true;
      replay_ = {};
      replay_next_ = 0;
      abort_upload();
      if (firmware_upload_) {
        firmware_->cancel();
        firmware_upload_.reset();
      }
      uint8_t p[22]{};
      p[0] = 1;
      identity_.device_id(p + 1);
      p[17] = kFirmwareVersion.major;
      p[18] = kFirmwareVersion.minor;
      p[19] = kFirmwareVersion.patch;
      p[20] = state();
      out = response(r, Type::HelloAck, p, sizeof p);
    }
    send(out);
    return;
  }
  if (!session_valid_ || r.session_id != session_) {
    send(nack(r, Nack::BadSession));
    return;
  }
  Bytes encoded;
  encode(r, encoded);
  auto fingerprint = crc32(encoded.data.data() + 3, 9 + r.payload_size);
  for (auto &e : replay_)
    if (e.used && e.sequence == r.sequence) {
      if (e.fingerprint == fingerprint)
        transport_.send(e.response.data.data(), e.response.size);
      else
        send(nack(r, Nack::InvalidPayload));
      return;
    }
  auto out = dispatch(r);
  Bytes saved;
  send(out, &saved);
  replay_[replay_next_] = {true, r.sequence, fingerprint, saved};
  replay_next_ = (replay_next_ + 1) % replay_.size();
}
Frame DesktopCommandProcessor::dispatch(const Frame &r) {
  switch (r.type) {
  case Type::GetNetworkConfig: {
    if (r.payload_size || !net_)
      return nack(r,
                  r.payload_size ? Nack::InvalidPayload : Nack::UnknownMessage);
    NetworkConfig c;
    if (!net_->load(c))
      return nack(r, Nack::InternalError);
    uint8_t p[38]{};
    p[0] = 1;
    p[1] = uint8_t(c.ssid.size());
    std::copy(c.ssid.begin(), c.ssid.end(), p + 2);
    p[2 + c.ssid.size()] = c.password.empty() ? 0 : 1;
    write16(p + 3 + c.ssid.size(), c.tcp_port);
    p[5 + c.ssid.size()] = recovery_ ? 1 : 0;
    return response(r, Type::NetworkConfig, p, 6 + c.ssid.size());
  }
  case Type::SetNetworkConfig: {
    if (!net_)
      return nack(r, Nack::UnknownMessage);
    if (firmware_upload_)
      return nack(r, Nack::Busy);
    if (r.payload_size < 6 || r.payload[0] != 1)
      return nack(r, Nack::InvalidPayload);
    size_t sl = r.payload[1];
    if (sl > 32 || r.payload_size < 6 + sl)
      return nack(r, Nack::InvalidPayload);
    uint8_t mode = r.payload[2 + sl], pl = r.payload[3 + sl];
    if (mode > 1 || pl > 63 || r.payload_size != size_t(6 + sl + pl) ||
        (mode == 0 && pl))
      return nack(r, Nack::InvalidPayload);
    NetworkConfig c;
    if (!net_->load(c))
      c = {};
    c.ssid.assign(reinterpret_cast<const char *>(r.payload.data() + 2), sl);
    if (mode)
      c.password.assign(
          reinterpret_cast<const char *>(r.payload.data() + 4 + sl), pl);
    c.tcp_port = read16(r.payload.data() + 4 + sl + pl);
    if (!valid_network_config(c) || !net_->save(c))
      return nack(r, Nack::InvalidPayload);
    return response(r, Type::Ack);
  }
  case Type::RebootDevice:
    if (r.payload_size)
      return nack(r, Nack::InvalidPayload);
    if (state() == 3 || upload_ || firmware_upload_)
      return nack(r, Nack::Busy);
    reboot_pending_ = true;
    return response(r, Type::Ack);
  case Type::BeginFirmwareUpdate: {
    if (!firmware_)
      return nack(r, Nack::UnknownMessage);
    if (state() == 3 || upload_ || firmware_upload_)
      return nack(r, Nack::Busy);
    if (r.payload_size != 37 || r.payload[0] != 1)
      return nack(r, Nack::InvalidPayload);
    auto f = std::make_unique<Firmware>();
    f->expected = read32(r.payload.data() + 1);
    if (!f->expected)
      return nack(r, Nack::InvalidPayload);
    std::copy_n(r.payload.begin() + 5, 32, f->hash.begin());
    uint16_t maximum = 0;
    if (!firmware_->begin(f->expected, f->hash, maximum) || maximum == 0)
      return nack(r, Nack::InternalError);
    firmware_upload_ = std::move(f);
    uint8_t p[6];
    write32(p, firmware_upload_->expected);
    write16(p + 4, maximum);
    return response(r, Type::FirmwareUpdateReady, p, 6);
  }
  case Type::FirmwareUpdateChunk: {
    if (!firmware_upload_)
      return nack(r, Nack::InvalidState);
    if (r.payload_size < 5)
      return nack(r, Nack::InvalidPayload);
    auto off = read32(r.payload.data());
    size_t n = r.payload_size - 4;
    auto &f = *firmware_upload_;
    if (off == f.last_offset && f.offset == off + n && f.last.size() == n &&
        std::equal(f.last.begin(), f.last.end(), r.payload.begin() + 4))
      return response(r, Type::Ack);
    if (off != f.offset || off + n > f.expected)
      return nack(r, Nack::UploadOffset);
    if (!firmware_->write(off, r.payload.data() + 4, n)) {
      firmware_->cancel();
      firmware_upload_.reset();
      return nack(r, Nack::InternalError);
    }
    f.last_offset = off;
    f.last.assign(r.payload.begin() + 4, r.payload.begin() + 4 + n);
    f.offset += n;
    return response(r, Type::Ack);
  }
  case Type::EndFirmwareUpdate: {
    if (r.payload_size)
      return nack(r, Nack::InvalidPayload);
    if (!firmware_upload_)
      return nack(r, Nack::InvalidState);
    auto expected = firmware_upload_->hash;
    if (firmware_upload_->offset != firmware_upload_->expected) {
      firmware_->cancel();
      firmware_upload_.reset();
      return nack(r, Nack::UploadOffset);
    }
    std::array<uint8_t, 32> actual{};
    if (!firmware_->finish(actual)) {
      firmware_->cancel();
      firmware_upload_.reset();
      return nack(r, Nack::InternalError);
    }
    firmware_upload_.reset();
    if (actual != expected)
      return nack(r, Nack::HashMismatch);
    return response(r, Type::FirmwareUpdateComplete, actual.data(),
                    actual.size());
  }
  case Type::CancelFirmwareUpdate:
    if (r.payload_size)
      return nack(r, Nack::InvalidPayload);
    if (firmware_upload_) {
      firmware_->cancel();
      firmware_upload_.reset();
    }
    return response(r, Type::Ack);
  case Type::GetStatus: {
    if (r.payload_size)
      return nack(r, Nack::InvalidPayload);
    Frame x;
    status(r, x);
    return x;
  }
  case Type::BeginUpload: {
    if (firmware_upload_)
      return nack(r, Nack::Busy);
    if (state() == 3)
      return nack(r, Nack::Busy);
    if (r.payload_size != 37 || r.payload[0] != 1)
      return nack(r, Nack::InvalidPayload);
    auto len = read32(&r.payload[1]);
    if (len > kMaxArtifactSize)
      return nack(r, Nack::UploadTooLarge);
    auto u = std::make_unique<Upload>();
    u->expected = len;
    std::copy_n(r.payload.begin() + 5, 32, u->hash.begin());
    u->bytes.reserve(len);
    upload_ = std::move(u);
    uint8_t p[6];
    write32(p, len);
    write16(p + 4, 1020);
    return response(r, Type::UploadReady, p, 6);
  }
  case Type::UploadChunk: {
    if (!upload_)
      return nack(r, Nack::InvalidState);
    if (r.payload_size < 5)
      return nack(r, Nack::InvalidPayload);
    auto off = read32(r.payload.data());
    size_t n = r.payload_size - 4;
    if (off < upload_->bytes.size()) {
      if (size_t(off) + n <= upload_->bytes.size() &&
          std::equal(r.payload.begin() + 4, r.payload.begin() + 4 + n,
                     upload_->bytes.begin() + off))
        return response(r, Type::Ack);
      return nack(r, Nack::UploadConflict);
    }
    if (off != upload_->bytes.size() || off + n > upload_->expected)
      return nack(r, Nack::UploadOffset);
    upload_->bytes.insert(upload_->bytes.end(), r.payload.begin() + 4,
                          r.payload.begin() + 4 + n);
    return response(r, Type::Ack);
  }
  case Type::EndUpload: {
    if (r.payload_size)
      return nack(r, Nack::InvalidPayload);
    if (!upload_)
      return nack(r, Nack::InvalidState);
    if (upload_->bytes.size() != upload_->expected)
      return nack(r, Nack::UploadOffset);
    auto hash = sha256(upload_->bytes.data(), upload_->bytes.size());
    if (hash != upload_->hash) {
      abort_upload();
      return nack(r, Nack::HashMismatch);
    }
    OwnedPreparedMasterShow show;
    if (!decode_prepared_master_binary(upload_->bytes.data(),
                                       upload_->bytes.size(), show)) {
      abort_upload();
      return nack(r, Nack::InvalidShow);
    }
    auto a = std::make_unique<Artifact>();
    a->bytes = std::move(upload_->bytes);
    a->hash = hash;
    a->show = std::move(show);
    candidate_ = std::move(a);
    abort_upload();
    return response(r, Type::UploadComplete, hash.data(), hash.size());
  }
  case Type::ActivateShow: {
    if (state() == 3 || upload_)
      return nack(r, Nack::InvalidState);
    if (r.payload_size != 32)
      return nack(r, Nack::InvalidPayload);
    if (!candidate_ || !std::equal(candidate_->hash.begin(),
                                   candidate_->hash.end(), r.payload.begin()))
      return nack(r, Nack::NoShow);
    if (controller_.state() != ShowState::Idle &&
        controller_.state() != ShowState::Ready)
      return nack(r, Nack::InvalidState);
    start_pending_ = false;
    if (!controller_.unload())
      return nack(r, Nack::InvalidState);
    active_ = std::move(candidate_);
    return response(r, Type::Ack);
  }
  case Type::StartShow: {
    if (firmware_upload_)
      return nack(r, Nack::Busy);
    if (r.payload_size)
      return nack(r, Nack::InvalidPayload);
    if (state() == 3)
      return response(r, Type::Ack);
    if (upload_)
      return nack(r, Nack::InvalidState);
    if (!active_)
      return nack(r, Nack::NoShow);
    if (controller_.state() == ShowState::Idle) {
      if (!controller_.load(active_->show.view()) || !controller_.prepare())
        return nack(r, Nack::InvalidState);
      start_pending_ = true;
    } else if (controller_.state() == ShowState::Ready) {
      if (!controller_.start())
        return nack(r, Nack::InvalidState);
    } else
      return nack(r, Nack::InvalidState);
    return response(r, Type::Ack);
  }
  case Type::StopShow:
    if (r.payload_size)
      return nack(r, Nack::InvalidPayload);
    if (upload_)
      return nack(r, Nack::InvalidState);
    start_pending_ = false;
    controller_.stop();
    return response(r, Type::Ack);
  default:
    return nack(r, Nack::UnknownMessage);
  }
}
void DesktopCommandProcessor::status(const Frame &r, Frame &out) {
  uint8_t p[91]{};
  p[0] = state();
  p[1] = active_ ? 1 : 0;
  if (active_)
    std::copy(active_->hash.begin(), active_->hash.end(), p + 2);
  p[34] = candidate_ ? 1 : 0;
  if (candidate_)
    std::copy(candidate_->hash.begin(), candidate_->hash.end(), p + 35);
  write32(p + 67, active_ ? active_->show.duration_ms : 0);
  write32(p + 71, scheduler_ ? scheduler_->position_ms() : 0);
  p[75] = uint8_t(sender_.online_count());
  p[76] = uint8_t(sender_.configured_count());
  p[77] = controller_.state() == ShowState::Fault ? 6 : 0;
  if (scheduler_) {
    auto &d = scheduler_->diagnostics();
    write32(p + 80, d.late_frame_count);
    write32(p + 84, uint32_t(d.max_lateness_us < 0 ? 0 : d.max_lateness_us));
  }
  p[90] = 1;
  out = response(r, Type::Status, p, sizeof p);
}
} // namespace master
