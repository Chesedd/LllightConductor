#include "master/desktop_protocol.hpp"
#include <algorithm>
#include <cstring>
namespace master::desktop_protocol {
uint32_t crc32(const uint8_t*p,size_t n){uint32_t c=0xffffffffu;while(n--){c^=*p++;for(int i=0;i<8;i++)c=(c>>1)^((c&1)?0xedb88320u:0);}return c^0xffffffffu;}
bool encode(const Frame&f,Bytes&o){if(f.payload_size>kMaxPayload)return false;o.size=16+f.payload_size;o.data[0]=0xd3;o.data[1]=0x32;o.data[2]=1;o.data[3]=uint8_t(f.type);write16(&o.data[4],f.sequence);write32(&o.data[6],f.session_id);write16(&o.data[10],uint16_t(f.payload_size));std::copy_n(f.payload.begin(),f.payload_size,o.data.begin()+12);write32(&o.data[12+f.payload_size],crc32(&o.data[2],10+f.payload_size));return true;}
bool decode(const uint8_t*p,size_t n,Frame&f){if(n<16||p[0]!=0xd3||p[1]!=0x32||p[2]!=1)return false;auto z=read16(p+10);if(z>kMaxPayload||n!=size_t(16)+z||read32(p+12+z)!=crc32(p+2,10+z))return false;f.type=Type(p[3]);f.sequence=read16(p+4);f.session_id=read32(p+6);f.payload_size=z;std::copy_n(p+12,z,f.payload.begin());return true;}
void Parser::discard(size_t n){if(n>=size_){size_=0;return;}std::memmove(buffer_.data(),buffer_.data()+n,size_-n);size_-=n;}
void Parser::push(const uint8_t*p,size_t n,FrameCallback frame,ErrorCallback error,void*ctx){while(n){if(size_==kMaxFrame)discard(1);auto take=std::min(n,kMaxFrame-size_);std::copy_n(p,take,buffer_.begin()+size_);p+=take;n-=take;size_+=take;for(;;){size_t at=0;while(at+1<size_&&(buffer_[at]!=0xd3||buffer_[at+1]!=0x32))++at;if(at+1>=size_){bool keep=size_&&buffer_[size_-1]==0xd3;if(keep)buffer_[0]=0xd3;size_=keep?1:0;break;}if(at)discard(at);if(size_<12)break;auto len=read16(&buffer_[10]);if(len>kMaxPayload){if(error)error(ctx,ParseError::OversizedPayload);discard(1);continue;}size_t total=16+len;if(size_<total)break;if(read32(&buffer_[12+len])!=crc32(&buffer_[2],10+len)){if(error)error(ctx,ParseError::BadCrc);discard(1);continue;}if(buffer_[2]!=1){if(error)error(ctx,ParseError::UnsupportedVersion);discard(total);continue;}Frame f;if(decode(buffer_.data(),total,f)&&frame)frame(ctx,f);discard(total);}}
}
}
