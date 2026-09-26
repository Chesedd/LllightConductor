#include "master/desktop_command_processor.hpp"
#include "master/esp_desktop_uart.hpp"
#include "master/prepared_show.hpp"
#include "master/scheduler.hpp"
#include "master/session_manager.hpp"
#include "master/show_controller.hpp"
#include "master/uart_transport.hpp"
#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
using namespace master;
class LogEvents final:public SessionEvents { public:
 void response(uint8_t a,protocol::Type t,uint16_t s)override{ESP_LOGI("master","response address=%u type=%u sequence=%u",a,unsigned(t),s);}
 void retry(uint8_t a,protocol::Type t,uint16_t s,uint8_t n)override{ESP_LOGW("master","timeout retry address=%u type=%u sequence=%u attempt=%u",a,unsigned(t),s,n);}
 void fault(uint8_t a,const char*why)override{ESP_LOGE("master","Pico fault address=%u reason=%s",a,why);}
};
extern "C" void app_main(){
 static EspUartTransport uart(UartConfig{});static EspClock clock;if(!uart.init()){ESP_LOGE("master","Pico UART init failed");return;}
 static EspDesktopUart desktop(DesktopUartConfig{CONFIG_LLLIGHT_DESKTOP_UART_PORT,CONFIG_LLLIGHT_DESKTOP_UART_TX_PIN,CONFIG_LLLIGHT_DESKTOP_UART_RX_PIN,460800}); if(!desktop.init()){ESP_LOGE("master","Desktop UART init failed");return;}
 static LogEvents events;static SessionManager sessions(uart,clock,esp_random(),&events);static ShowScheduler* scheduler_ptr=nullptr;
 static ShowController controller(sessions,scheduler_ptr);static ShowScheduler scheduler(clock,controller);scheduler_ptr=&scheduler;static EspHardwareIdentity identity;static DesktopCommandProcessor commands(desktop,identity,controller,sessions,&scheduler);
 controller.load(demo_show());controller.prepare();ESP_LOGI("master","demo preparing; enable CONFIG_LLLIGHT_DEMO_AUTO_START for a bench run");
 ShowState prior=ShowState::Idle;uint32_t prior_frames=0;uint8_t rx[128],desktop_rx[512];
 for(;;){auto n=uart.receive(rx,sizeof rx);if(n)sessions.ingest(rx,n);auto dn=desktop.receive(desktop_rx,sizeof desktop_rx);if(dn)commands.ingest(desktop_rx,dn);commands.tick();if(controller.state()!=prior){prior=controller.state();ESP_LOGI("master","state=%u",unsigned(prior));}auto&d=scheduler.diagnostics();if(d.dispatched_frame_count!=prior_frames){prior_frames=d.dispatched_frame_count;ESP_LOGI("master","frame=%lu lateness_us=%lld max_us=%lld",static_cast<unsigned long>(prior_frames),static_cast<long long>(d.last_lateness_us),static_cast<long long>(d.max_lateness_us));}
  // The debug console and binary UART are separate. Local trigger is compile-time disabled
  // until a board-specific console input is selected; set this true for bench demos.
#ifdef CONFIG_LLLIGHT_DEMO_AUTO_START
  if(controller.state()==ShowState::Ready)controller.start();
#endif
  int64_t wait_us=1000;if(controller.state()==ShowState::Running&&scheduler.next_deadline_us()>0){auto remaining=scheduler.next_deadline_us()-clock.now_us();if(remaining>2000)wait_us=remaining-1000;}
  vTaskDelay(pdMS_TO_TICKS(wait_us/1000>0?wait_us/1000:1));
 }
}
