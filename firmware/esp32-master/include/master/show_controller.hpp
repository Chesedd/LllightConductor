#pragma once
#include "master/scheduler.hpp"
#include "master/session_manager.hpp"
namespace master {
enum class ShowState : uint8_t { Idle, PreparingHello, PreparingReset, Ready, Running, Stopping, Fault };
class ShowController final : public FrameSink { public:
  ShowController(SessionManager& sessions,ShowScheduler*& scheduler_slot):sessions_(sessions),scheduler_slot_(scheduler_slot){}
  bool load(const PreparedMasterShow&); bool prepare(); bool start(); void stop(); void tick();
  bool dispatch(const PreparedFrame&)override; void fatal_fault(); ShowState state()const{return state_;}
 private: SessionManager& sessions_; ShowScheduler*& scheduler_slot_; const PreparedMasterShow* show_{}; ShowState state_{ShowState::Idle};
};
}  // namespace master
