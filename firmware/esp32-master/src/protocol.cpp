#include "master/protocol.hpp"
#include <algorithm>
#include <cstring>
namespace master::protocol {
static uint16_t read16(const uint8_t*p){return uint16_t(p[0])|uint16_t(p[1])<<8;}
static uint32_t read32(const uint8_t*p){return uint32_t(p[0])|uint32_t(p[1])<<8|uint32_t(p[2])<<16|uint32_t(p[3])<<24;}
uint16_t crc16(const uint8_t* p,size_t n){uint16_t c=0xffff;while(n--){c^=uint16_t(*p++)<<8;for(int i=0;i<8;i++)c=(c&0x8000)?uint16_t((c<<1)^0x1021):uint16_t(c<<1);}return c;}
bool encode(const Frame& f,Bytes& out){if(f.address==255||f.payload_size>kMaxPayload)return false;out.size=15+f.payload_size;auto*p=out.data.data();p[0]=0xa5;p[1]=0x5a;p[2]=kVersion;p[3]=uint8_t(f.type);p[4]=f.address;p[5]=uint8_t(f.sequence);p[6]=uint8_t(f.sequence>>8);for(int i=0;i<4;i++)p[7+i]=uint8_t(f.session>>(8*i));p[11]=uint8_t(f.payload_size);p[12]=uint8_t(f.payload_size>>8);std::copy_n(f.payload.data(),f.payload_size,p+13);auto c=crc16(p+2,11+f.payload_size);p[13+f.payload_size]=uint8_t(c);p[14+f.payload_size]=uint8_t(c>>8);return true;}
bool decode(const uint8_t*p,size_t n,Frame& f){if(n<15||p[0]!=0xa5||p[1]!=0x5a||p[2]!=kVersion)return false;auto len=read16(p+11);if(len>kMaxPayload||n!=size_t(15+len)||read16(p+13+len)!=crc16(p+2,11+len)||p[4]==255)return false;f.type=Type(p[3]);f.address=p[4];f.sequence=read16(p+5);f.session=read32(p+7);f.payload_size=len;std::copy_n(p+13,len,f.payload.data());return true;}
void Parser::push(const uint8_t* p,size_t n,Handler handler,void* context){
 while(n--){if(size_<buffer_.size())buffer_[size_++]=*p++;else{std::move(buffer_.begin()+1,buffer_.end(),buffer_.begin());buffer_.back()=*p++;}}
 for(;;){size_t start=0;while(start+1<size_&&(buffer_[start]!=0xa5||buffer_[start+1]!=0x5a))++start;if(start){std::move(buffer_.begin()+start,buffer_.begin()+size_,buffer_.begin());size_-=start;}if(size_<13)return;auto len=read16(buffer_.data()+11);if(len>kMaxPayload){std::move(buffer_.begin()+1,buffer_.begin()+size_,buffer_.begin());--size_;continue;}size_t total=15+len;if(size_<total)return;Frame f;size_t consumed=1;if(decode(buffer_.data(),total,f)){handler(context,f);consumed=total;}std::move(buffer_.begin()+consumed,buffer_.begin()+size_,buffer_.begin());size_-=consumed;}
}
} // namespace master::protocol
