#include "master/scheduler.hpp"
namespace master {
void ShowScheduler::start(const PreparedMasterShow&s){show_=&s;next_=0;start_us_=clock_.now_us();running_=true;diagnostics_={};}
void ShowScheduler::stop(){running_=false;}
int64_t ShowScheduler::next_deadline_us()const{return !running_||next_>=show_->frame_count?-1:start_us_+int64_t(show_->frames[next_].time_ms)*1000;}
bool ShowScheduler::tick(){if(!running_)return false;while(next_<show_->frame_count){auto deadline=next_deadline_us(),now=clock_.now_us();if(now<deadline)return true;auto late=now-deadline;diagnostics_.last_lateness_us=late;if(late>diagnostics_.max_lateness_us)diagnostics_.max_lateness_us=late;if(late>0)++diagnostics_.late_frame_count;if(!sink_.dispatch(show_->frames[next_++])){running_=false;return false;}++diagnostics_.dispatched_frame_count;}running_=false;return true;}
} // namespace master
