#pragma once
#include <cstddef>
#include <cstdint>
namespace master { class DesktopTransport { public:virtual ~DesktopTransport()=default;virtual bool send(const uint8_t*,size_t)=0;};class DeviceIdentityProvider{public:virtual ~DeviceIdentityProvider()=default;virtual void device_id(uint8_t out[16])const=0;}; }
