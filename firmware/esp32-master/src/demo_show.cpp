#include "master/prepared_show.hpp"
#include <array>
namespace master {
bool validate_show(const PreparedMasterShow&s){if(s.frame_count&&s.frames==nullptr)return false;uint32_t prior=0;for(size_t i=0;i<s.frame_count;i++){auto&f=s.frames[i];if(f.time_ms>s.duration_ms||(i&&f.time_ms<prior)||(f.batch_count&&f.batches==nullptr))return false;prior=f.time_ms;uint8_t last=0;for(size_t b=0;b<f.batch_count;b++){auto&batch=f.batches[b];if(batch.slave_address==255||batch.update_count==0||batch.update_count>31||!batch.updates||(b&&batch.slave_address<=last))return false;last=batch.slave_address;std::array<bool,256> seen{};for(size_t u=0;u<batch.update_count;u++){auto&x=batch.updates[u];if(seen[x.output_id]||(x.state!=OutputState::Off&&x.state!=OutputState::On))return false;seen[x.output_id]=true;}}}return true;}
const PreparedMasterShow& demo_show(){
 static constexpr PreparedOutputUpdate u0[]={{0,OutputState::On}},u1[]={{1,OutputState::On}},u2[]={{0,OutputState::Off},{2,OutputState::On}},u3[]={{1,OutputState::Off},{2,OutputState::Off}},u4[]={{3,OutputState::On}},u5[]={{3,OutputState::Off}};
 static constexpr PreparedSlaveBatch b0[]={{7,u0,1}},b1[]={{7,u1,1}},b2[]={{7,u2,2}},b3[]={{7,u3,2}},b4[]={{7,u4,1}},b5[]={{7,u5,1}};
 static constexpr PreparedFrame frames[]={{0,b0,1},{500,b1,1},{1000,b2,1},{1500,b3,1},{2000,b4,1},{2500,b5,1}};
 static constexpr PreparedMasterShow show{2500,frames,6};return show;
}
} // namespace master
