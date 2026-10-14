#include "portus/serial_config.hpp"
#include <cassert>
#include <iostream>
using namespace portus::serial;
int main() {
    SerialConfig c{};
    assert(validate(c));
    c.baud_rate = 0; assert(!validate(c));
    c.baud_rate = 115200; c.data_bits = 9; assert(!validate(c));
    c.data_bits = 5; c.stop_bits = StopBits::OnePointFive; assert(validate(c));
    c.data_bits = 8; assert(!validate(c));
    c.stop_bits = StopBits::Two; assert(validate(c));
    SerialTimeouts t{}; t.read_multiplier_ms = 10; t.read_constant_ms = 25;
    t.write_multiplier_ms = 5; t.write_constant_ms = 7;
    assert(read_total_timeout_ms(t, 100) == 1025);
    assert(write_total_timeout_ms(t, 100) == 507);
    std::cout << "PASS: serial configuration validation and timeout arithmetic\n";
}
