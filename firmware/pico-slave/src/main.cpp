#include "pico_slave/command_processor.hpp"
#include "pico_slave/config.hpp"
#include "pico_slave/stream_parser.hpp"
#include "pico_output_controller.hpp"
#include "hardware/gpio.h"
#include "hardware/uart.h"
#include "pico/stdlib.h"
#include <cstdio>
#ifndef PICO_SLAVE_DIAGNOSTICS
#define PICO_SLAVE_DIAGNOSTICS 1
#endif
namespace { constexpr uint32_t kLedPulseMs=35; }
int main(){static_assert(pico_slave::config::kUartInstance<=1);auto*protocol_uart=pico_slave::config::kUartInstance==0?uart0:uart1;
#if PICO_SLAVE_DIAGNOSTICS
 stdio_init_all();gpio_init(PICO_DEFAULT_LED_PIN);gpio_set_dir(PICO_DEFAULT_LED_PIN,GPIO_OUT);gpio_put(PICO_DEFAULT_LED_PIN,false);
#endif
 pico_slave::PicoOutputController outputs;pico_slave::CommandProcessor processor(pico_slave::config::kSlaveAddress,pico_slave::config::kFirmwareId,outputs);if(!processor.initialize())while(true)tight_loop_contents();uart_init(protocol_uart,pico_slave::config::kUartBaud);gpio_set_function(pico_slave::config::kUartRxPin,GPIO_FUNC_UART);uart_set_format(protocol_uart,8,1,UART_PARITY_NONE);uart_set_fifo_enabled(protocol_uart,true);
#if PICO_SLAVE_DIAGNOSTICS
 printf("PICO READY\nslave=%u\nrxPin=GP%u\n",pico_slave::config::kSlaveAddress,pico_slave::config::kUartRxPin);
#endif
 pico_slave::StreamParser parser;absolute_time_t led_off=nil_time;
 absolute_time_t next_stats=make_timeout_time_ms(2000);uint32_t reported_bytes=0;
 while(true){while(uart_is_readable(protocol_uart)){pico_slave::Frame frame;processor.noteBytes(1);auto result=parser.feed(uint8_t(uart_getc(protocol_uart)),frame);if(result==pico_slave::StreamParser::Result::CrcError){processor.noteCrcError();
#if PICO_SLAVE_DIAGNOSTICS
 printf("RX CRC_ERROR\n");
#endif
 }else if(result==pico_slave::StreamParser::Result::InvalidFrame){processor.noteInvalidFrame();
#if PICO_SLAVE_DIAGNOSTICS
 printf("RX INVALID_FRAME\n");
#endif
 }else if(result==pico_slave::StreamParser::Result::FrameReady){processor.noteFrame();auto applied=processor.process(frame);
#if PICO_SLAVE_DIAGNOSTICS
 if(applied==pico_slave::CommandResult::ResetApplied||applied==pico_slave::CommandResult::SetApplied){gpio_put(PICO_DEFAULT_LED_PIN,true);led_off=make_timeout_time_ms(kLedPulseMs);if(applied==pico_slave::CommandResult::ResetApplied)printf("RX seq=%u RESET_OUTPUTS applied\n",frame.sequence);else printf("RX seq=%u SET_OUTPUTS count=%u applied\n",frame.sequence,frame.payload[0]);}else if(applied==pico_slave::CommandResult::Invalid)printf("RX INVALID_FRAME\n");
#endif
 }}
#if PICO_SLAVE_DIAGNOSTICS
 if(!is_nil_time(led_off)&&time_reached(led_off)){gpio_put(PICO_DEFAULT_LED_PIN,false);led_off=nil_time;}if(time_reached(next_stats)){const auto&c=processor.counters();if(c.bytesReceived!=reported_bytes){reported_bytes=c.bytesReceived;printf("RX stats bytes=%lu frames=%lu valid=%lu crc=%lu invalid=%lu applied=%lu\n",(unsigned long)c.bytesReceived,(unsigned long)c.framesReceived,(unsigned long)c.validFrames,(unsigned long)c.crcErrors,(unsigned long)c.invalidFrames,(unsigned long)(c.resetCommandsApplied+c.setCommandsApplied));}next_stats=make_timeout_time_ms(2000);}
#endif
 tight_loop_contents();}}
