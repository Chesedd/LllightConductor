#include "master/show_controller.hpp"
namespace master {
bool ShowController::load(const PreparedMasterShow&s){if((state_!=ShowState::Idle&&state_!=ShowState::Ready)||!validate_show(s)){state_=ShowState::Fault;return false;}show_=&s;return true;}
bool ShowController::prepare(){if(state_!=ShowState::Idle||!show_)return false;for(size_t i=0;i<show_->frame_count;i++)for(size_t b=0;b<show_->frames[i].batch_count;b++)if(!sender_.add_slave(show_->frames[i].batches[b].slave_address)){fatal_fault();return false;}for(uint16_t a=0;a<255;a++)if(sender_.find(uint8_t(a))&&!sender_.send_reset(uint8_t(a))){fatal_fault();return false;}state_=ShowState::Ready;return true;}
bool ShowController::start(){if(state_!=ShowState::Ready||!scheduler_slot_)return false;for(uint16_t a=0;a<255;a++)if(sender_.find(uint8_t(a))&&!sender_.send_reset(uint8_t(a))){fatal_fault();return false;}scheduler_slot_->start(*show_);state_=ShowState::Running;return true;}
bool ShowController::dispatch(const PreparedFrame&f){for(size_t b=0;b<f.batch_count;b++)if(!sender_.send_updates(f.batches[b]))return false;return true;}
void ShowController::tick(){if(state_==ShowState::Running&&scheduler_slot_){if(!scheduler_slot_->tick())fatal_fault();else if(!scheduler_slot_->running())state_=ShowState::Ready;}}
void ShowController::stop(){if(scheduler_slot_)scheduler_slot_->stop();for(uint16_t a=0;a<255;a++)if(sender_.find(uint8_t(a)))sender_.send_reset(uint8_t(a));state_=ShowState::Idle;}
void ShowController::fatal_fault(){if(scheduler_slot_)scheduler_slot_->stop();state_=ShowState::Fault;for(uint16_t a=0;a<255;a++)if(sender_.find(uint8_t(a)))sender_.send_reset(uint8_t(a));}
}
