#pragma once
#include "master/transport.hpp"
#ifdef ESP_PLATFORM
#include "driver/uart.h"
namespace master {
struct UartConfig { uart_port_t port=UART_NUM_1; int tx_pin=17; int rx_pin=16; int baud=115200; uint8_t peer_address=7; };
class EspUartTransport final:public PicoTransport { public: explicit EspUartTransport(UartConfig config):config_(config){} bool init();
 bool send(uint8_t,const uint8_t*,size_t)override; size_t receive(uint8_t*,size_t)override;
 private: UartConfig config_; };
class EspClock final:public MonotonicClock { public:int64_t now_us()const override; };
}
#endif
