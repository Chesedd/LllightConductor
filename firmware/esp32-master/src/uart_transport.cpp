#ifdef ESP_PLATFORM
#include "master/uart_transport.hpp"
#include "esp_timer.h"
namespace master {
bool EspUartTransport::init(){uart_config_t c{};c.baud_rate=config_.baud;c.data_bits=UART_DATA_8_BITS;c.parity=UART_PARITY_DISABLE;c.stop_bits=UART_STOP_BITS_1;c.flow_ctrl=UART_HW_FLOWCTRL_DISABLE;c.source_clk=UART_SCLK_DEFAULT;return uart_driver_install(config_.port,512,0,0,nullptr,0)==ESP_OK&&uart_param_config(config_.port,&c)==ESP_OK&&uart_set_pin(config_.port,config_.tx_pin,config_.rx_pin,UART_PIN_NO_CHANGE,UART_PIN_NO_CHANGE)==ESP_OK;}
bool EspUartTransport::send(uint8_t address,const uint8_t*p,size_t n){return address==config_.peer_address&&uart_write_bytes(config_.port,p,n)==int(n);}
size_t EspUartTransport::receive(uint8_t*p,size_t n){int got=uart_read_bytes(config_.port,p,n,0);return got>0?size_t(got):0;}
int64_t EspClock::now_us()const{return esp_timer_get_time();}
}
#endif
