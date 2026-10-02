#pragma once
#include "pico_slave/output_controller.hpp"
#include "pico_slave/protocol.hpp"
namespace pico_slave {
struct DiagnosticCounters{uint32_t bytesReceived{},framesReceived{},validFrames{},crcErrors{},invalidFrames{},resetCommandsApplied{},setCommandsApplied{};};
enum class CommandResult{Ignored,Invalid,Duplicate,ResetApplied,SetApplied};
class CommandProcessor{public:CommandProcessor(uint8_t address,uint16_t,OutputController&outputs):slave_address_(address),outputs_(outputs){}bool initialize();CommandResult process(const Frame&);void noteBytes(size_t n){counters_.bytesReceived+=uint32_t(n);}void noteFrame(){++counters_.framesReceived;}void noteCrcError(){++counters_.framesReceived;++counters_.crcErrors;}void noteInvalidFrame(){++counters_.framesReceived;++counters_.invalidFrames;}const DiagnosticCounters&counters()const{return counters_;}
 private:uint8_t slave_address_;OutputController&outputs_;bool duplicate_valid_{};uint16_t last_sequence_{};uint32_t last_session_{};uint16_t last_fingerprint_{};DiagnosticCounters counters_{};};
}
