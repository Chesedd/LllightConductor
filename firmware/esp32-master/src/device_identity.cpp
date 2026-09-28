#include "master/device_identity.hpp"
#include "master/sha256.hpp"
#include <algorithm>
#include <array>
namespace master {
std::array<uint8_t,16> stable_device_id(const std::array<uint8_t,6>& factory_mac){
 constexpr uint8_t domain[]={'l','l','l','i','g','h','t','-','d','e','v','i','c','e','-','v','1'};
 std::array<uint8_t,sizeof(domain)+6> input{};
 std::copy(std::begin(domain),std::end(domain),input.begin());
 std::copy(factory_mac.begin(),factory_mac.end(),input.begin()+sizeof(domain));
 const auto digest=sha256(input.data(),input.size());
 std::array<uint8_t,16> result{};std::copy_n(digest.begin(),result.size(),result.begin());return result;
}
}
