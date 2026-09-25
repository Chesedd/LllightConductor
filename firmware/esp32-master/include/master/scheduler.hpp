#pragma once
#include "master/prepared_show.hpp"
#include "master/transport.hpp"
#include <cstddef>
#include <cstdint>
namespace master {
struct TimingDiagnostics { int64_t last_lateness_us{}; int64_t max_lateness_us{}; uint32_t late_frame_count{}; uint32_t dispatched_frame_count{}; };
class FrameSink { public: virtual ~FrameSink()=default; virtual bool dispatch(const PreparedFrame&)=0; };
class ShowScheduler { public:
  ShowScheduler(MonotonicClock& clock,FrameSink& sink):clock_(clock),sink_(sink){}
  void start(const PreparedMasterShow& show); void stop(); bool tick(); bool running()const{return running_;}
  int64_t next_deadline_us()const; const TimingDiagnostics& diagnostics()const{return diagnostics_;}
 private: MonotonicClock& clock_; FrameSink& sink_; const PreparedMasterShow* show_{}; size_t next_{};
  int64_t start_us_{}; bool running_{}; TimingDiagnostics diagnostics_{};
};
}  // namespace master
