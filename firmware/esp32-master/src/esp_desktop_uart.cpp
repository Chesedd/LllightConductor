#include "master/esp_desktop_uart.hpp"
#include "master/device_identity.hpp"
#include "driver/uart.h"
#include "esp_log.h"
#include "esp_mac.h"
#include <algorithm>
#include <array>
namespace master {
bool EspDesktopUart::init(){if(config_.port<0||config_.port>=UART_NUM_MAX){ESP_LOGE("desktop-uart","UART%d is unavailable on this target (UART_NUM_MAX=%d)",config_.port,int(UART_NUM_MAX));return false;}if(config_.port==UART_NUM_1){ESP_LOGE("desktop-uart","UART%d is reserved for the Pico transport",config_.port);return false;}
#if defined(CONFIG_ESP_CONSOLE_UART) && CONFIG_ESP_CONSOLE_UART
 if(config_.port==CONFIG_ESP_CONSOLE_UART_NUM){ESP_LOGE("desktop-uart","UART%d is the ESP-IDF console; binary protocol requires a dedicated UART",config_.port);return false;}
#endif
 uart_config_t c{};c.baud_rate=config_.baud;c.data_bits=UART_DATA_8_BITS;c.parity=UART_PARITY_DISABLE;c.stop_bits=UART_STOP_BITS_1;c.flow_ctrl=UART_HW_FLOWCTRL_DISABLE;c.source_clk=UART_SCLK_DEFAULT;auto p=uart_port_t(config_.port);if(uart_driver_install(p,4096,0,0,nullptr,0)!=ESP_OK)return false;if(uart_param_config(p,&c)!=ESP_OK||uart_set_pin(p,config_.tx_pin,config_.rx_pin,UART_PIN_NO_CHANGE,UART_PIN_NO_CHANGE)!=ESP_OK){uart_driver_delete(p);return false;}initialized_=true;return true;}
bool EspDesktopUart::send(const uint8_t*p,size_t n){return initialized_&&uart_write_bytes(uart_port_t(config_.port),p,n)==int(n);}
size_t EspDesktopUart::receive(uint8_t*p,size_t n){if(!initialized_)return 0;auto count=uart_read_bytes(uart_port_t(config_.port),p,n,0);return count>0?size_t(count):0;}
void EspHardwareIdentity::device_id(uint8_t out[16])const{std::array<uint8_t,6> mac{};esp_efuse_mac_get_default(mac.data());const auto id=stable_device_id(mac);std::copy(id.begin(),id.end(),out);}
}
