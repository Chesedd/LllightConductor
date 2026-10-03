#include "master/pico_command_sender.hpp"
#include <algorithm>
namespace master {
PicoTarget* PicoCommandSender::find(uint8_t a){for(auto&t:targets_)if(t.used&&t.address==a)return &t;return nullptr;}
const PicoTarget* PicoCommandSender::find(uint8_t a)const{for(auto&t:targets_)if(t.used&&t.address==a)return &t;return nullptr;}
bool PicoCommandSender::add_slave(uint8_t a){if(a==255)return false;if(find(a))return true;for(auto&t:targets_)if(!t.used){t.used=true;t.address=a;return true;}return false;}
void PicoCommandSender::clear_slaves(){targets_={};}
bool PicoCommandSender::send(PicoTarget&t,protocol::Type type,const uint8_t*p,size_t n){protocol::Frame f{type,t.address,t.next_sequence++,epoch_};f.payload_size=uint16_t(n);if(n)std::copy_n(p,n,f.payload.data());protocol::Bytes bytes;return protocol::encode(f,bytes)&&transport_.send(t.address,bytes.data.data(),bytes.size);}
bool PicoCommandSender::send_reset(uint8_t a){auto*t=find(a);return t&&send(*t,protocol::Type::ResetOutputs,nullptr,0);}
bool PicoCommandSender::send_updates(const PreparedSlaveBatch&b){auto*t=find(b.slave_address);if(!t||b.update_count==0||b.update_count>31)return false;uint8_t p[63];p[0]=uint8_t(b.update_count);for(size_t i=0;i<b.update_count;i++){p[1+2*i]=b.updates[i].output_id;p[2+2*i]=uint8_t(b.updates[i].state);}return send(*t,protocol::Type::SetOutputs,p,1+2*b.update_count);}
size_t PicoCommandSender::configured_count()const{size_t n=0;for(auto&t:targets_)if(t.used)++n;return n;}
} // namespace master
