#include "master/prepared_show.hpp"
#include "master/protocol.hpp"
#include "master/scheduler.hpp"
#include "master/session_manager.hpp"
#include "master/show_controller.hpp"
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
using namespace master;
static int tests;
#define CHECK(x) do{++tests;if(!(x)){std::fprintf(stderr,"FAIL %s:%d: %s\n",__FILE__,__LINE__,#x);std::exit(1);}}while(0)
struct Clock:MonotonicClock{int64_t us{};int64_t now_us()const override{return us;}};
struct Transport:PicoTransport{struct Sent{uint8_t a;std::vector<uint8_t>b;};std::vector<Sent> sent;bool send(uint8_t a,const uint8_t*p,size_t n)override{sent.push_back({a,{p,p+n}});return true;}size_t receive(uint8_t*,size_t)override{return 0;}};
static protocol::Frame decoded(const Transport::Sent&s){protocol::Frame f;CHECK(protocol::decode(s.b.data(),s.b.size(),f));return f;}
static void respond(SessionManager&m,const protocol::Frame&q,protocol::Type type,std::initializer_list<uint8_t> payload={}){protocol::Frame r{type,q.address,q.sequence,q.session};r.payload_size=payload.size();std::copy(payload.begin(),payload.end(),r.payload.begin());protocol::Bytes b;CHECK(protocol::encode(r,b));m.ingest(b.data.data(),b.size);}
static std::vector<uint8_t> hex(const char*s){std::vector<uint8_t>v;unsigned x;while(std::sscanf(s,"%x",&x)==1){v.push_back(uint8_t(x));while(*s&&*s!=' ')++s;while(*s==' ')++s;}return v;}
static void golden(){using protocol::Type;struct V{const char*h;Type t;};V vs[]={
 {"A5 5A 01 01 07 34 12 EF CD AB 89 00 00 DA C1",Type::Hello},
 {"A5 5A 01 02 07 34 12 EF CD AB 89 05 00 02 01 01 00 08 CC 47",Type::HelloAck},
 {"A5 5A 01 03 07 35 12 EF CD AB 89 04 00 40 30 20 10 BD 2B",Type::Ping},
 {"A5 5A 01 04 07 35 12 EF CD AB 89 04 00 40 30 20 10 BB 5B",Type::Pong},
 {"A5 5A 01 05 07 36 12 EF CD AB 89 00 00 49 E3",Type::ResetOutputs},
 {"A5 5A 01 06 07 37 12 EF CD AB 89 03 00 01 03 01 49 C5",Type::SetOutputs},
 {"A5 5A 01 06 07 38 12 EF CD AB 89 07 00 03 01 01 02 00 07 01 9D C0",Type::SetOutputs},
 {"A5 5A 01 07 07 37 12 EF CD AB 89 00 00 10 7A",Type::Ack},
 {"A5 5A 01 08 07 39 12 EF CD AB 89 01 00 03 CA 30",Type::Nack},
 {"A5 5A 01 09 07 3A 12 EF CD AB 89 00 00 80 15",Type::GetStatus},
 {"A5 5A 01 0A 07 3A 12 EF CD AB 89 08 00 01 07 01 08 02 01 01 89 18 64",Type::Status}};
 for(auto&v:vs){auto bytes=hex(v.h);protocol::Frame f;CHECK(protocol::decode(bytes.data(),bytes.size(),f));CHECK(f.type==v.t);protocol::Bytes out;CHECK(protocol::encode(f,out));CHECK(std::equal(bytes.begin(),bytes.end(),out.data.begin()));}
 auto hello=hex(vs[0].h);protocol::Frame hf;CHECK(protocol::decode(hello.data(),hello.size(),hf));protocol::Bytes encoded;CHECK(protocol::encode(hf,encoded));CHECK(std::equal(hello.begin(),hello.end(),encoded.data.begin()));
 const uint8_t check[]={'1','2','3','4','5','6','7','8','9'};CHECK(protocol::crc16(check,9)==0x29b1);
 protocol::Parser p;int count=0;auto cb=[](void*c,const protocol::Frame&){++*static_cast<int*>(c);};uint8_t garbage[]={0,1,0xa5};p.push(garbage,3,cb,&count);p.push(hello.data()+1,hello.size()-1,cb,&count);CHECK(count==1);
}
struct Sink:FrameSink{Clock*c{};std::vector<std::pair<uint32_t,int64_t>> frames;bool ok=true;bool dispatch(const PreparedFrame&f)override{frames.push_back({f.time_ms,c->us});return ok;}};
static void scheduler_tests(){
 Clock c;Sink sink;sink.c=&c;ShowScheduler s(c,sink);PreparedMasterShow empty{0,nullptr,0};s.start(empty);CHECK(s.tick());CHECK(!s.running());
 PreparedFrame fs[]={{0,nullptr,0},{100,nullptr,0},{200,nullptr,0}};PreparedMasterShow show{200,fs,3};c.us=1000;s.start(show);CHECK(s.tick());CHECK(sink.frames.back().second==1000);c.us=101500;CHECK(s.tick());c.us=201000;CHECK(s.tick());CHECK(!s.running());CHECK(sink.frames[ sink.frames.size()-2].second==101500);CHECK(s.diagnostics().last_lateness_us==0);CHECK(s.diagnostics().max_lateness_us==500);CHECK(s.diagnostics().late_frame_count==1);
 c.us=0;s.start(show);s.stop();c.us=999999;CHECK(!s.tick());CHECK(!s.running());
 PreparedOutputUpdate u[]={{1,OutputState::On},{2,OutputState::Off}};PreparedSlaveBatch bs[]={{2,u,2},{7,u,2}};PreparedFrame one{0,bs,2};PreparedMasterShow batched{0,&one,1};CHECK(validate_show(batched));PreparedSlaveBatch bad[]={{7,u,2},{2,u,2}};PreparedFrame bf{0,bad,2};CHECK(!validate_show({0,&bf,1}));
}
static void establish(SessionManager&m,Transport&t,uint8_t a){CHECK(m.add_slave(a));CHECK(m.start_hello(a));auto q=decoded(t.sent.back());respond(m,q,protocol::Type::HelloAck,{2,1,1,0,8});CHECK(m.find(a)->online);}
static void session_tests(){Clock c;Transport t;SessionManager m(t,c,123);establish(m,t,7);auto seq=m.find(7)->next_sequence;CHECK(m.add_slave(8));CHECK(m.start_hello(8));auto hello8=decoded(t.sent.back());CHECK(hello8.sequence==0);CHECK(m.find(7)->next_sequence==seq);respond(m,hello8,protocol::Type::HelloAck,{2,1,1,0,8});m.find(7)->next_sequence=65535;CHECK(m.send_reset(7));CHECK(decoded(t.sent.back()).sequence==65535);CHECK(m.send_status(7));CHECK(decoded(t.sent.back()).sequence==0);
 auto status=decoded(t.sent.back());respond(m,status,protocol::Type::Ack);CHECK(m.pending_control()==1); // reset remains
 c.us=50000;auto n=t.sent.size();m.service_timeouts();CHECK(t.sent.size()==n+1);c.us=100000;m.service_timeouts();c.us=150000;m.service_timeouts();CHECK(m.find(7)->faulted);
 Clock c2;Transport t2;SessionManager m2(t2,c2,9);establish(m2,t2,7);PreparedOutputUpdate a[]={{0,OutputState::On}},b[]={{1,OutputState::On}};PreparedSlaveBatch ba{7,a,1},bb{7,b,1};CHECK(m2.send_updates(ba));auto old=decoded(t2.sent.back());CHECK(m2.send_updates(bb));auto newest=decoded(t2.sent.back());c2.us=50000;n=t2.sent.size();m2.service_timeouts();CHECK(t2.sent.size()==n+1);respond(m2,newest,protocol::Type::Ack);CHECK(!m2.find(7)->faulted);respond(m2,old,protocol::Type::Ack); // ignored superseded ACK
 CHECK(m2.send_updates(ba));auto nack=decoded(t2.sent.back());respond(m2,nack,protocol::Type::Nack,{3});CHECK(m2.find(7)->faulted);CHECK(m2.find(7)->last_nack==3);
}
static void lifecycle_integration(){Clock c;Transport t;SessionManager sessions(t,c,0x1234);ShowScheduler*slot=nullptr;ShowController ctl(sessions,slot);ShowScheduler sched(c,ctl);slot=&sched;CHECK(ctl.state()==ShowState::Idle);CHECK(ctl.load(demo_show()));CHECK(ctl.prepare());CHECK(ctl.state()==ShowState::PreparingHello);auto hello=decoded(t.sent.back());CHECK(hello.type==protocol::Type::Hello);respond(sessions,hello,protocol::Type::HelloAck,{2,1,1,0,8});ctl.tick();CHECK(ctl.state()==ShowState::PreparingReset);auto reset=decoded(t.sent.back());CHECK(reset.type==protocol::Type::ResetOutputs);respond(sessions,reset,protocol::Type::Ack);ctl.tick();CHECK(ctl.state()==ShowState::Ready);CHECK(ctl.start());CHECK(ctl.state()==ShowState::Running);ctl.tick();auto set=decoded(t.sent.back());CHECK(set.type==protocol::Type::SetOutputs&&set.payload[0]==1);respond(sessions,set,protocol::Type::Ack);c.us=500000;ctl.tick();CHECK(decoded(t.sent.back()).type==protocol::Type::SetOutputs);ctl.stop();CHECK(ctl.state()==ShowState::Stopping);auto stop=decoded(t.sent.back());CHECK(stop.type==protocol::Type::ResetOutputs);respond(sessions,stop,protocol::Type::Ack);ctl.tick();CHECK(ctl.state()==ShowState::Idle);ctl.stop();CHECK(ctl.state()==ShowState::Idle);
 Clock c2;Transport t2;SessionManager ss(t2,c2,1);ShowScheduler*sp=nullptr;ShowController bad(ss,sp);ShowScheduler sc(c2,bad);sp=&sc;PreparedFrame unsorted[]={{2,nullptr,0},{1,nullptr,0}};CHECK(!bad.load({2,unsorted,2}));CHECK(bad.state()==ShowState::Fault);
}
int main(){golden();scheduler_tests();session_tests();lifecycle_integration();std::printf("PASS: %d checks\n",tests);}
