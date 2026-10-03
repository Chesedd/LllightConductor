#include "master/desktop_command_processor.hpp"
#include "master/esp_desktop_uart.hpp"
#include "master/esp_desktop_tcp.hpp"
#include "master/esp_remote_maintenance.hpp"
#include "master/prepared_show.hpp"
#include "master/scheduler.hpp"
#include "master/pico_command_sender.hpp"
#include "master/show_controller.hpp"
#include "master/uart_transport.hpp"
#include "esp_log.h"
#include "esp_random.h"
#include "esp_system.h"
#include "esp_ota_ops.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
using namespace master;
extern "C" void app_main(){
 constexpr int kPicoBaud=115200;
 bool pending_verify=false;const esp_partition_t*running=esp_ota_get_running_partition();esp_ota_img_states_t image_state{};if(esp_ota_get_state_partition(running,&image_state)==ESP_OK&&image_state==ESP_OTA_IMG_PENDING_VERIFY){pending_verify=true;ESP_LOGW("master","OTA image pending verification");}
 esp_err_t nvs=nvs_flash_init();if(nvs==ESP_ERR_NVS_NO_FREE_PAGES||nvs==ESP_ERR_NVS_NEW_VERSION_FOUND){ESP_ERROR_CHECK(nvs_flash_erase());nvs=nvs_flash_init();}if(nvs!=ESP_OK){ESP_LOGE("master","OTA startup self-check failed; rolling back");if(pending_verify)esp_ota_mark_app_invalid_rollback_and_reboot();return;}
 static EspNetworkConfigStore network_store(NetworkConfig{CONFIG_LLLIGHT_DESKTOP_WIFI_SSID,CONFIG_LLLIGHT_DESKTOP_WIFI_PASSWORD,CONFIG_LLLIGHT_DESKTOP_TCP_PORT});NetworkConfig network;network_store.load(network);static EspFirmwareUpdater firmware_updater;static EspSystemControl system_control;
 constexpr uint8_t kBenchSlaveAddress=7;
#ifdef CONFIG_LLLIGHT_PICO_BENCH_RESET_LOOP
 constexpr int64_t kBenchPeriodUs=1000000;
#endif
 static constexpr UartConfig pico_uart_config{uart_port_t(CONFIG_LLLIGHT_PICO_UART_PORT),CONFIG_LLLIGHT_PICO_UART_TX_PIN,UART_PIN_NO_CHANGE,kPicoBaud,kBenchSlaveAddress};
 static EspUartTransport uart(pico_uart_config);static EspClock clock;if(!uart.init()){ESP_LOGE("master","Pico UART init failed");return;}
 #ifdef CONFIG_LLLIGHT_DESKTOP_TRANSPORT_TCP
 static EspDesktopTcp desktop(DesktopTcpConfig{network.ssid,network.password,network.tcp_port});
#else
 static EspDesktopUart desktop(DesktopUartConfig{CONFIG_LLLIGHT_DESKTOP_UART_PORT,CONFIG_LLLIGHT_DESKTOP_UART_TX_PIN,CONFIG_LLLIGHT_DESKTOP_UART_RX_PIN,460800});
#endif
 if(!desktop.init()){ESP_LOGE("master","Desktop transport init failed");return;}
 static PicoCommandSender sender(uart,esp_random());static ShowScheduler* scheduler_ptr=nullptr;
#ifdef CONFIG_LLLIGHT_PICO_BENCH_RESET_LOOP
 if(!sender.add_slave(kBenchSlaveAddress)){ESP_LOGE("master","PICO BENCH failed to register slave=%u",unsigned(kBenchSlaveAddress));return;}
#endif
 static ShowController controller(sender,scheduler_ptr);static ShowScheduler scheduler(clock,controller);scheduler_ptr=&scheduler;static EspHardwareIdentity identity;static DesktopCommandProcessor commands(desktop,identity,controller,sender,&scheduler,&network_store,&firmware_updater,&system_control);
 const int64_t healthy_after=esp_timer_get_time()+5000000;
 controller.load(demo_show());controller.prepare();ESP_LOGI("master","demo preparing; enable CONFIG_LLLIGHT_DEMO_AUTO_START for a bench run");
#ifdef CONFIG_LLLIGHT_PICO_BENCH_RESET_LOOP
 ESP_LOGI("master","PICO BENCH enabled: UART%d TX GPIO%d baud=%d slave=%u period=1000ms",int(pico_uart_config.port),pico_uart_config.tx_pin,pico_uart_config.baud,unsigned(kBenchSlaveAddress));
 int64_t next_bench_reset_us=clock.now_us()+kBenchPeriodUs;
#endif
 ShowState prior=ShowState::Idle;uint32_t prior_frames=0;uint8_t desktop_rx[512];
 for(;;){
#ifdef CONFIG_LLLIGHT_DESKTOP_TRANSPORT_TCP
 commands.set_recovery_mode(desktop.recovery_mode());
#endif
 if(pending_verify&&esp_timer_get_time()>=healthy_after){if(esp_ota_mark_app_valid_cancel_rollback()==ESP_OK)ESP_LOGI("master","OTA image confirmed");pending_verify=false;}auto dn=desktop.receive(desktop_rx,sizeof desktop_rx);if(dn)commands.ingest(desktop_rx,dn);commands.tick();if(controller.state()!=prior){prior=controller.state();ESP_LOGI("master","state=%u",unsigned(prior));}auto&d=scheduler.diagnostics();if(d.dispatched_frame_count!=prior_frames){prior_frames=d.dispatched_frame_count;ESP_LOGI("master","frame=%lu lateness_us=%lld max_us=%lld",static_cast<unsigned long>(prior_frames),static_cast<long long>(d.last_lateness_us),static_cast<long long>(d.max_lateness_us));}
#ifdef CONFIG_LLLIGHT_PICO_BENCH_RESET_LOOP
  const int64_t bench_now_us=clock.now_us();
  if(bench_now_us>=next_bench_reset_us){
   const bool sent=sender.send_reset(kBenchSlaveAddress);
   ESP_LOGI("master","PICO BENCH reset result=%s",sent?"OK":"FAIL");
   do{next_bench_reset_us+=kBenchPeriodUs;}while(next_bench_reset_us<=bench_now_us);
  }
#endif
  // The debug console and binary UART are separate. Local trigger is compile-time disabled
  // until a board-specific console input is selected; set this true for bench demos.
#ifdef CONFIG_LLLIGHT_DEMO_AUTO_START
  if(controller.state()==ShowState::Ready)controller.start();
#endif
  int64_t wait_us=1000;if(controller.state()==ShowState::Running&&scheduler.next_deadline_us()>0){auto remaining=scheduler.next_deadline_us()-clock.now_us();if(remaining>2000)wait_us=remaining-1000;}
#ifdef CONFIG_LLLIGHT_PICO_BENCH_RESET_LOOP
  const int64_t until_bench_us=next_bench_reset_us-clock.now_us();
  if(until_bench_us<wait_us)wait_us=until_bench_us;
#endif
  const auto delay_ms=wait_us/1000>0?wait_us/1000:1;
  TickType_t delay_ticks=pdMS_TO_TICKS(delay_ms);
  if(delay_ticks==0)delay_ticks=1;
  vTaskDelay(delay_ticks);
 }
}
