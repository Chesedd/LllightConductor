#pragma once
#include "pico_slave/protocol.hpp"
namespace pico_slave {class StreamParser{public:enum class Result{None,FrameReady,CrcError,InvalidFrame};Result feed(uint8_t,Frame&);void reset();private:void discardPrefix(std::size_t);std::array<uint8_t,kMaxFrameSize>buffer_{};std::size_t size_{};};}
