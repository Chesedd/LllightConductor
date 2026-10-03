#pragma once
#include "master/prepared_show.hpp"
#include "master/protocol.hpp"
#include "master/transport.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
namespace master {
struct PicoTarget { bool used{}; uint8_t address{}; uint16_t next_sequence{}; };
// Open-loop v2 sender: deliberately no receive, ACK, timeout, or liveness state.
class PicoCommandSender {
 public:
  PicoCommandSender(PicoTransport& transport,uint32_t show_epoch):transport_(transport),epoch_(show_epoch?show_epoch:1){}
  bool add_slave(uint8_t); void clear_slaves(); bool send_reset(uint8_t); bool send_updates(const PreparedSlaveBatch&);
  const PicoTarget* find(uint8_t)const; PicoTarget* find(uint8_t);
  size_t configured_count()const; constexpr size_t online_count()const{return 0;}
 private:
  bool send(PicoTarget&,protocol::Type,const uint8_t*,size_t);
  PicoTransport& transport_; uint32_t epoch_; std::array<PicoTarget,8> targets_{};
};
} // namespace master
