#pragma once
#include "master/desktop_transport.hpp"
#include <cstddef>
#include <cstdint>
namespace master {
struct DesktopUartConfig { int port=2; int tx_pin=25; int rx_pin=26; int baud=460800; };
class EspDesktopUart final:public DesktopTransport { public: explicit EspDesktopUart(DesktopUartConfig config={}):config_(config){} bool init();bool send(const uint8_t*,size_t)override;size_t receive(uint8_t*,size_t); private:DesktopUartConfig config_;bool initialized_{};};
class EspHardwareIdentity final:public DeviceIdentityProvider {public:void device_id(uint8_t out[16])const override;};
}
