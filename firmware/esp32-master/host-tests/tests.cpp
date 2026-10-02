#include "master/protocol.hpp"
#include "master/pico_command_sender.hpp"
#include "master/show_controller.hpp"
#include "master/prepared_show.hpp"
#include "master/scheduler.hpp"
#include <cstdio>
#include <cstdlib>
#include <vector>
using namespace master;
#define CHECK(x) do{if(!(x)){std::fprintf(stderr,"FAIL %d: %s\n",__LINE__,#x);std::exit(1);}}while(0)
struct Clock:MonotonicClock{int64_t us{};int64_t now_us()const override{return us;}};
struct Wire:PicoTransport{std::vector<std::vector<uint8_t>>sent;bool send(uint8_t,const uint8_t*p,size_t n)override{sent.emplace_back(p,p+n);return true;}size_t receive(uint8_t*,size_t)override{return 0;}};
protocol::Frame decode(const std::vector<uint8_t>&b){protocol::Frame f;CHECK(protocol::decode(b.data(),b.size(),f));return f;}
struct Sink:FrameSink{bool dispatch(const PreparedFrame&)override{return true;}};
int main(){const uint8_t check[]={'1','2','3','4','5','6','7','8','9'};CHECK(protocol::crc16(check,9)==0x29b1);Wire w;PicoCommandSender sender(w,0x89abcdef);CHECK(sender.add_slave(7));CHECK(sender.send_reset(7));auto reset=decode(w.sent.back());CHECK(reset.type==protocol::Type::ResetOutputs&&reset.sequence==0&&reset.session==0x89abcdef);const std::vector<uint8_t>resetGolden={0xA5,0x5A,2,5,7,0,0,0xEF,0xCD,0xAB,0x89,0,0,0x3C,0x0A};CHECK(w.sent.back()==resetGolden);PreparedOutputUpdate updates[]={{1,OutputState::On},{2,OutputState::Off}};PreparedSlaveBatch batch{7,updates,2};CHECK(sender.send_updates(batch));auto set=decode(w.sent.back());CHECK(set.type==protocol::Type::SetOutputs&&set.payload[0]==2&&set.sequence==1);CHECK(sender.online_count()==0&&sender.configured_count()==1);
 Clock c;ShowScheduler*slot=nullptr;ShowController controller(sender,slot);ShowScheduler scheduler(c,controller);slot=&scheduler;PreparedSlaveBatch batches[]={{7,updates,2}};PreparedFrame frames[]={{0,batches,1},{100,batches,1}};PreparedMasterShow show{100,frames,2};CHECK(controller.load(show));auto n=w.sent.size();CHECK(controller.prepare());CHECK(controller.state()==ShowState::Ready&&w.sent.size()==n+1);CHECK(controller.start());CHECK(controller.state()==ShowState::Running);controller.tick();CHECK(decode(w.sent.back()).type==protocol::Type::SetOutputs);c.us=100000;controller.tick();CHECK(controller.state()==ShowState::Ready);n=w.sent.size();controller.stop();CHECK(controller.state()==ShowState::Idle&&w.sent.size()==n+1&&decode(w.sent.back()).type==protocol::Type::ResetOutputs);controller.stop();CHECK(controller.state()==ShowState::Idle);CHECK(sender.online_count()==0);std::puts("All ESP32 open-loop v2 host tests passed");}
