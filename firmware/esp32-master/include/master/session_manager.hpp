#pragma once
#include "master/prepared_show.hpp"
#include "master/protocol.hpp"
#include "master/transport.hpp"
#include <array>
#include <cstddef>
#include <cstdint>

namespace master {
enum class RequestClass : uint8_t { Control, Realtime };
struct PendingRequest { bool active{}; uint16_t sequence{}; protocol::Type type{}; RequestClass request_class{};
  int64_t sent_us{}; uint8_t attempts{}; protocol::Bytes encoded{}; std::array<bool,256> outputs{}; };
struct SlaveSession { bool used{}; uint8_t address{}; uint32_t session_id{}; uint16_t next_sequence{};
  bool online{}; bool faulted{}; uint8_t last_nack{}; int64_t last_response_us{};
  std::array<PendingRequest,8> pending{}; };
class SessionEvents { public: virtual ~SessionEvents()=default;
  virtual void response(uint8_t,protocol::Type,uint16_t){} virtual void retry(uint8_t,protocol::Type,uint16_t,uint8_t){}
  virtual void fault(uint8_t,const char*){} };
class SessionManager {
 public:
  static constexpr int64_t kTimeoutUs=50000; static constexpr uint8_t kMaxAttempts=3;
  SessionManager(PicoTransport& transport, MonotonicClock& clock, uint32_t boot_nonce,SessionEvents* events=nullptr);
  bool add_slave(uint8_t address); bool start_hello(uint8_t address); bool send_reset(uint8_t address);
  bool send_status(uint8_t address); bool send_updates(const PreparedSlaveBatch& batch);
  void ingest(const uint8_t* data,size_t size); void service_timeouts();
  const SlaveSession* find(uint8_t address) const; SlaveSession* find(uint8_t address);
  bool all_online() const; bool all_clear() const; size_t pending_control() const;
 private:
  PicoTransport& transport_; MonotonicClock& clock_; uint32_t nonce_; SessionEvents* events_; std::array<SlaveSession,8> slaves_{};
  protocol::Parser parser_; bool send_request(SlaveSession&,protocol::Type,const uint8_t*,size_t,RequestClass,const PreparedSlaveBatch*);
  static void parsed(void*,const protocol::Frame&); void on_frame(const protocol::Frame&);
};
}  // namespace master
