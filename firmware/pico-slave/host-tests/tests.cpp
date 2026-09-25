#include "pico_slave/command_processor.hpp"
#include "pico_slave/stream_parser.hpp"

#include <array>
#include <cstdio>
#include <cstdlib>
#include <initializer_list>
#include <vector>

using namespace pico_slave;
#define CHECK(x) do { if (!(x)) { std::fprintf(stderr,"FAIL %s:%d: %s\n",__FILE__,__LINE__,#x); std::exit(1); } } while(0)

class FakeOutputs final : public OutputController {
 public:
  bool initialize() override { initialized=true; states.fill(false); return true; }
  bool resetAll() override { states.fill(false); ++resets; return true; }
  bool validateOutput(uint8_t id) const override { return id < 4; }
  bool applyBatch(const OutputUpdate* u, std::size_t n) override { ++applies; for(std::size_t i=0;i<n;++i) states[u[i].output_id]=u[i].on; return true; }
  std::size_t configuredCount() const override { return 4; }
  bool readState(uint8_t id, bool& on) const override { if(id>=4)return false; on=states[id]; return true; }
  bool initialized{}; int resets{}; int applies{}; std::array<bool,4> states{};
};

std::vector<uint8_t> hex(std::initializer_list<uint8_t> v) { return v; }
Frame decode(const std::vector<uint8_t>& v) { Frame f; CHECK(decodeFrame(v.data(),v.size(),f)); return f; }
Frame request(MessageType type,uint16_t seq=1,uint32_t session=9,std::initializer_list<uint8_t> payload={}) {
  Frame f; f.message_type=uint8_t(type); f.slave_address=7; f.sequence=seq; f.session_id=session; f.payload_length=payload.size();
  std::size_t i=0; for(auto b:payload)f.payload[i++]=b; return f;
}
void sameBytes(const Frame& f,const std::vector<uint8_t>& expected) { std::array<uint8_t,kMaxFrameSize>b{}; auto n=encodeFrame(f,b); CHECK(n==expected.size()); for(std::size_t i=0;i<n;++i)CHECK(b[i]==expected[i]); }

int main() {
  const auto hello=hex({0xA5,0x5A,0x01,0x01,0x07,0x34,0x12,0xEF,0xCD,0xAB,0x89,0,0,0xDA,0xC1});
  const auto setone=hex({0xA5,0x5A,1,6,7,0x37,0x12,0xEF,0xCD,0xAB,0x89,3,0,1,3,1,0x49,0xC5});
  const auto ack=hex({0xA5,0x5A,1,7,7,0x37,0x12,0xEF,0xCD,0xAB,0x89,0,0,0x10,0x7A});
  CHECK(crc16CcittFalse(reinterpret_cast<const uint8_t*>("123456789"),9)==0x29B1);
  CHECK(crc16CcittFalse(nullptr,0)==0xFFFF); CHECK(crc16CcittFalse(hello.data()+2,11)==0xC1DA);
  CHECK(decode(hello).session_id==0x89ABCDEF); CHECK(decode(setone).payload[1]==3);
  auto af=request(MessageType::Ack,0x1237,0x89ABCDEF); sameBytes(af,ack);

  StreamParser p; Frame f; CHECK(p.feed(hello[0],f)==StreamParser::Result::None);
  for(std::size_t i=1;i<hello.size()-1;++i)CHECK(p.feed(hello[i],f)==StreamParser::Result::None);
  CHECK(p.feed(hello.back(),f)==StreamParser::Result::FrameReady);
  for(auto b:hello) { auto result=p.feed(b,f); if(b==hello.back())CHECK(result==StreamParser::Result::FrameReady); }
  for(auto b:hello) p.feed(b,f);
  for(auto b:setone) { if(p.feed(b,f)==StreamParser::Result::FrameReady)CHECK(f.message_type==6); }
  p.reset(); p.feed(0x12,f); p.feed(0xA5,f); p.feed(0x33,f); for(auto b:hello) if(p.feed(b,f)==StreamParser::Result::FrameReady)CHECK(f.message_type==1);
  auto bad=hello; bad.back()^=1; p.reset(); bool got=false; for(auto b:bad)p.feed(b,f); for(auto b:setone)got|=p.feed(b,f)==StreamParser::Result::FrameReady; CHECK(got);
  p.reset(); std::vector<uint8_t> oversized={0xA5,0x5A,1,1,7,0,0,0,0,0,0,65,0}; for(auto b:oversized)p.feed(b,f); got=false; for(auto b:hello)got|=p.feed(b,f)==StreamParser::Result::FrameReady; CHECK(got);
  p.reset(); p.feed(0xA5,f); for(auto b:hello)got|=p.feed(b,f)==StreamParser::Result::FrameReady;

  FakeOutputs outputs; outputs.states.fill(true); CommandProcessor cp(7,0x0102,outputs); CHECK(cp.initialize()); CHECK(outputs.initialized); for(bool s:outputs.states)CHECK(!s);
  Frame out; CHECK(cp.process(request(MessageType::SetOutputs),out)); CHECK(out.payload[0]==uint8_t(NackCode::BadSession));
  CHECK(cp.process(request(MessageType::Hello,1,9),out)); CHECK(cp.sessionActive()); CHECK(out.message_type==2);
  const int hello_resets=outputs.resets; CHECK(cp.process(request(MessageType::Hello,8,9),out)); CHECK(outputs.resets==hello_resets);
  CHECK(cp.process(request(MessageType::SetOutputs,9,99,{1,0,1}),out)); CHECK(out.payload[0]==uint8_t(NackCode::BadSession)); CHECK(!outputs.states[0]);
  auto other=request(MessageType::SetOutputs,9,9,{1,0,1}); other.slave_address=8; CHECK(!cp.process(other,out)); CHECK(!outputs.states[0]);
  CHECK(cp.process(request(MessageType::SetOutputs,2,9,{1,1,1}),out)); CHECK(outputs.states[1]); CHECK(out.message_type==7);
  int applies=outputs.applies; CHECK(cp.process(request(MessageType::SetOutputs,2,9,{1,1,1}),out)); CHECK(outputs.applies==applies);
  outputs.states[2]=true; CHECK(cp.process(request(MessageType::Hello,3,10),out)); CHECK(!outputs.states[2]);
  CHECK(cp.process(request(MessageType::SetOutputs,0xFFFF,10,{2,0,1,2,1}),out)); CHECK(cp.process(request(MessageType::SetOutputs,0,10,{1,0,0}),out)); CHECK(!outputs.states[0]);
  auto before=outputs.states; CHECK(cp.process(request(MessageType::SetOutputs,1,10,{2,0,1,9,1}),out)); CHECK(outputs.states==before); CHECK(out.payload[0]==3);
  CHECK(cp.process(request(MessageType::SetOutputs,2,10,{1,0,2}),out)); CHECK(outputs.states==before); CHECK(out.payload[0]==4);
  CHECK(cp.process(request(MessageType::SetOutputs,3,10,{2,0,1,0,0}),out)); CHECK(outputs.states==before); CHECK(out.payload[0]==2);
  CHECK(cp.process(request(MessageType::SetOutputs,4,10,{3,0,1,1,1,3,1}),out)); CHECK(outputs.states[0]&&outputs.states[1]&&outputs.states[3]);
  CHECK(cp.process(request(MessageType::Ping,5,10,{0x40,0x30,0x20,0x10}),out)); CHECK(out.message_type==4&&out.payload[3]==0x10);
  CHECK(cp.process(request(MessageType::GetStatus,6,10),out)); CHECK(out.message_type==10&&out.payload[3]==4&&out.payload[6]==1&&(out.payload[7]&0x0B)==0x0B);
  CHECK(cp.process(request(MessageType::ResetOutputs,7,10),out)); for(bool s:outputs.states)CHECK(!s);
  std::puts("All Pico slave host tests passed");
}
