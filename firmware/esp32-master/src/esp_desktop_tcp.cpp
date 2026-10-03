#include "master/esp_desktop_tcp.hpp"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "lwip/inet.h"
#include "lwip/sockets.h"
#include "nvs_flash.h"
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
namespace master {
namespace {
constexpr char TAG[] = "desktop-tcp";
}
EspDesktopTcp::~EspDesktopTcp() {
  close_client();
  close_listener();
}
bool EspDesktopTcp::init() {
  if (esp_netif_init() != ESP_OK)
    return false;
  esp_err_t loop = esp_event_loop_create_default();
  if (loop != ESP_OK && loop != ESP_ERR_INVALID_STATE)
    return false;
  esp_netif_create_default_wifi_sta();
  wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
  if (esp_wifi_init(&init) != ESP_OK)
    return false;
  ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                             &event_handler, this));
  ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                             &event_handler, this));
  wifi_config_t wifi{};
  std::memcpy(wifi.sta.ssid, config_.ssid.data(), config_.ssid.size());
  std::memcpy(wifi.sta.password, config_.password.data(),
              config_.password.size());
  wifi.sta.threshold.authmode = WIFI_AUTH_OPEN;
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi));
  ESP_ERROR_CHECK(esp_wifi_start());
  started_us_ = esp_timer_get_time();
  initialized_ = true;
  if (config_.ssid.empty())
    return start_recovery();
  return true;
}
void EspDesktopTcp::event_handler(void *arg, const char *base, int32_t id,
                                  void *data) {
  static_cast<EspDesktopTcp *>(arg)->on_event(base, id, data);
}
void EspDesktopTcp::on_event(const char *base, int32_t id, void *data) {
  if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
    esp_wifi_connect();
  } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    if (!recovery_) {
      close_client();
      close_listener();
    }
    ESP_LOGW(TAG, "Wi-Fi disconnected; reconnecting");
    esp_wifi_connect();
  } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
    auto *event = static_cast<ip_event_got_ip_t *>(data);
    got_ip_ = true;
    ESP_LOGI("wifi", "connected");
    if (!recovery_)
      open_listener(config_.port, event->ip_info.ip.addr);
  }
}
bool EspDesktopTcp::open_listener(uint16_t port, uint32_t address) {
  close_listener();
  listener_ = socket(AF_INET, SOCK_STREAM, IPPROTO_IP);
  if (listener_ < 0)
    return false;
  int yes = 1;
  setsockopt(listener_, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);
  sockaddr_in bind_address{};
  bind_address.sin_family = AF_INET;
  bind_address.sin_port = htons(port);
  bind_address.sin_addr.s_addr = htonl(INADDR_ANY);
  if (bind(listener_, reinterpret_cast<sockaddr *>(&bind_address),
           sizeof bind_address) < 0 ||
      listen(listener_, 1) < 0) {
    close_listener();
    ESP_LOGE(TAG, "Failed to open TCP listener on port %u", unsigned(port));
    return false;
  }
  int flags = fcntl(listener_, F_GETFL, 0);
  fcntl(listener_, F_SETFL, flags | O_NONBLOCK);
  in_addr ip{address};
  ESP_LOGI("master", "Desktop TCP listening on %s:%u", inet_ntoa(ip),
           unsigned(port));
  return true;
}

bool EspDesktopTcp::start_recovery() {
  if (recovery_)
    return true;
  uint8_t mac[6]{};
  esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP);
  char ssid[40];
  std::snprintf(ssid, sizeof ssid, "Lllight-Recovery-%02X%02X%02X", mac[3],
                mac[4], mac[5]);
  esp_netif_create_default_wifi_ap();
  wifi_config_t ap{};
  std::strncpy(reinterpret_cast<char *>(ap.ap.ssid), ssid, sizeof(ap.ap.ssid));
  ap.ap.ssid_len = std::strlen(ssid);
  ap.ap.max_connection = 1;
  ap.ap.authmode = WIFI_AUTH_OPEN;
  if (esp_wifi_set_mode(WIFI_MODE_APSTA) != ESP_OK ||
      esp_wifi_set_config(WIFI_IF_AP, &ap) != ESP_OK)
    return false;
  recovery_ = true;
  ESP_LOGW(TAG, "Recovery AP %s started; TCP endpoint 192.168.4.1:3333", ssid);
  return open_listener(3333, inet_addr("192.168.4.1"));
}
void EspDesktopTcp::close_client() {
  if (client_ >= 0) {
    shutdown(client_, SHUT_RDWR);
    close(client_);
    client_ = -1;
  }
}
void EspDesktopTcp::close_listener() {
  if (listener_ >= 0) {
    close(listener_);
    listener_ = -1;
  }
}
size_t EspDesktopTcp::receive(uint8_t *buffer, size_t capacity) {
  if (!initialized_)
    return 0;
  if (!got_ip_ && !recovery_ && esp_timer_get_time() - started_us_ >= 15000000)
    start_recovery();
  if (client_ < 0 && listener_ >= 0) {
    sockaddr_storage peer{};
    socklen_t size = sizeof peer;
    int candidate =
        accept(listener_, reinterpret_cast<sockaddr *>(&peer), &size);
    if (candidate >= 0) {
      int flags = fcntl(candidate, F_GETFL, 0);
      fcntl(candidate, F_SETFL, flags | O_NONBLOCK);
      client_ = candidate;
      ESP_LOGI(TAG, "Desktop client connected");
    }
  }
  if (client_ < 0)
    return 0;
  int n = recv(client_, buffer, capacity, 0);
  if (n > 0)
    return size_t(n);
  if (n == 0 || (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK)) {
    ESP_LOGI(TAG, "Desktop client disconnected; show execution is unchanged");
    close_client();
  }
  return 0;
}
bool EspDesktopTcp::send(const uint8_t *bytes, size_t count) {
  if (client_ < 0)
    return false;
  size_t sent = 0;
  while (sent < count) {
    int n = ::send(client_, bytes + sent, count - sent, MSG_NOSIGNAL);
    if (n > 0) {
      sent += size_t(n);
      continue;
    }
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
      ESP_LOGW(TAG, "Desktop client is not accepting data; closing connection");
    }
    close_client();
    return false;
  }
  return true;
}
} // namespace master
