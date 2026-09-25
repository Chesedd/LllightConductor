#include "pico_slave/command_processor.hpp"
#include "pico_slave/config.hpp"
#include "pico_slave/stream_parser.hpp"
#include "pico_output_controller.hpp"

#include "hardware/gpio.h"
#include "hardware/uart.h"
#include "pico/stdlib.h"

#ifndef PICO_SLAVE_DEBUG
#define PICO_SLAVE_DEBUG 0
#endif

int main() {
  static_assert(pico_slave::config::kUartInstance <= 1);
  uart_inst_t* const protocol_uart = pico_slave::config::kUartInstance == 0 ? uart0 : uart1;
#if PICO_SLAVE_DEBUG
  stdio_init_all();  // USB stdio only; never the protocol UART.
#endif
  pico_slave::PicoOutputController outputs;
  pico_slave::CommandProcessor processor(pico_slave::config::kSlaveAddress,
                                          pico_slave::config::kFirmwareId, outputs);
  if (!processor.initialize()) while (true) tight_loop_contents();

  uart_init(protocol_uart, pico_slave::config::kUartBaud);
  gpio_set_function(pico_slave::config::kUartTxPin, GPIO_FUNC_UART);
  gpio_set_function(pico_slave::config::kUartRxPin, GPIO_FUNC_UART);
  uart_set_format(protocol_uart, 8, 1, UART_PARITY_NONE);
  uart_set_fifo_enabled(protocol_uart, true);

  pico_slave::StreamParser parser;
  while (true) {
    while (uart_is_readable(protocol_uart)) {
      pico_slave::Frame request, response;
      const auto result = parser.feed(uint8_t(uart_getc(protocol_uart)), request);
      if (result == pico_slave::StreamParser::Result::Error) processor.noteParserError();
      if (result == pico_slave::StreamParser::Result::FrameReady && processor.process(request, response)) {
        std::array<uint8_t, pico_slave::kMaxFrameSize> bytes{};
        const auto length = pico_slave::encodeFrame(response, bytes);
        uart_write_blocking(protocol_uart, bytes.data(), length);
      }
    }
    tight_loop_contents();
  }
}
