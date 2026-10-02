#pragma once
#include "master/scheduler.hpp"
#include "master/pico_command_sender.hpp"
namespace master {
enum class ShowState : uint8_t { Idle, Ready, Running, Fault };
class ShowController final:public FrameSink { public:
 ShowController(PicoCommandSender&sender,ShowScheduler*&slot):sender_(sender),scheduler_slot_(slot){}
 bool load(const PreparedMasterShow&);bool prepare();bool start();void stop();void tick();bool dispatch(const PreparedFrame&)override;void fatal_fault();ShowState state()const{return state_;}
 private:PicoCommandSender&sender_;ShowScheduler*&scheduler_slot_;const PreparedMasterShow*show_{};ShowState state_{ShowState::Idle};};
}
