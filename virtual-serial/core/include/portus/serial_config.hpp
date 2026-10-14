#pragma once
#include <cstdint>
#include <stdexcept>

namespace portus::serial {

enum class Parity { None, Odd, Even, Mark, Space };
enum class StopBits { One, OnePointFive, Two };
struct SerialConfig {
    std::uint32_t baud_rate = 9600;
    std::uint8_t data_bits = 8;
    Parity parity = Parity::None;
    StopBits stop_bits = StopBits::One;
    bool rts_cts = false;
    bool xon_xoff = false;
};

struct SerialTimeouts {
    std::uint32_t read_interval_ms = 0;
    std::uint32_t read_multiplier_ms = 0;
    std::uint32_t read_constant_ms = 0;
    std::uint32_t write_multiplier_ms = 0;
    std::uint32_t write_constant_ms = 0;
};

inline bool validate(const SerialConfig& config) noexcept {
    return config.baud_rate > 0 && config.baud_rate <= 4000000 &&
           config.data_bits >= 5 && config.data_bits <= 8 &&
           !(config.stop_bits == StopBits::OnePointFive && config.data_bits != 5);
}
inline std::uint64_t read_total_timeout_ms(const SerialTimeouts& t, std::uint32_t bytes) noexcept {
    return static_cast<std::uint64_t>(bytes) * t.read_multiplier_ms + t.read_constant_ms;
}
inline std::uint64_t write_total_timeout_ms(const SerialTimeouts& t, std::uint32_t bytes) noexcept {
    return static_cast<std::uint64_t>(bytes) * t.write_multiplier_ms + t.write_constant_ms;
}

} // namespace portus::serial
