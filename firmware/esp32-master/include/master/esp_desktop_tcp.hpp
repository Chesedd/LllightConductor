#pragma once
#include "master/desktop_transport.hpp"
#include <cstddef>
#include <cstdint>
namespace master {
struct DesktopTcpConfig {const char* ssid;const char* password;uint16_t port=3333;};
class EspDesktopTcp final:public DesktopTransport {
 public: explicit EspDesktopTcp(DesktopTcpConfig config):config_(config){}~EspDesktopTcp();bool init();size_t receive(uint8_t* buffer,size_t capacity);bool send(const uint8_t* bytes,size_t count)override;
 private: static void event_handler(void* arg,const char* base,int32_t id,void* data);void on_event(const char* base,int32_t id,void* data);bool open_listener(uint32_t address);void close_client();void close_listener();DesktopTcpConfig config_;int listener_=-1;int client_=-1;bool initialized_=false;
};
}
