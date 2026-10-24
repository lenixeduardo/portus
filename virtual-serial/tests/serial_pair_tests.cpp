#include "portus/serial_pair.hpp"
#include <array>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <stdexcept>
#include <thread>
using portus::serial::Endpoint;
using portus::serial::SerialPair;

static void test_bidirectional_and_binary_bytes() {
    SerialPair pair(8);
    const std::array<std::uint8_t, 4> a{0x00, 0x01, 0xFF, 0x13};
    const std::array<std::uint8_t, 3> b{0x0A, 0x0D, 0x7F};
    assert(pair.write(Endpoint::A, a.data(), a.size()) == 4);
    assert(pair.write(Endpoint::B, b.data(), b.size()) == 3);
    assert(pair.available(Endpoint::A) == 3);
    assert(pair.available(Endpoint::B) == 4);
    std::array<std::uint8_t, 4> out_a{};
    std::array<std::uint8_t, 4> out_b{};
    assert(pair.read(Endpoint::A, out_a.data(), out_a.size()) == 3);
    assert(pair.read(Endpoint::B, out_b.data(), out_b.size()) == 4);
    for (std::size_t i = 0; i < b.size(); ++i) assert(out_a[i] == b[i]);
    assert(out_b == a);
}

static void test_capacity_and_wrap() {
    SerialPair pair(4);
    std::uint8_t in[] {1, 2, 3, 4, 5};
    std::uint8_t out[5] {};
    assert(pair.write(Endpoint::A, in, 5) == 4);
    assert(pair.free_space(Endpoint::B) == 0);
    assert(pair.write(Endpoint::A, in, 1) == 0);
    assert(pair.read(Endpoint::B, out, 3) == 3);
    assert(out[0] == 1 && out[1] == 2 && out[2] == 3);
    assert(pair.write(Endpoint::A, in + 3, 2) == 2);
    assert(pair.read(Endpoint::B, out, 5) == 3);
    assert(out[0] == 4 && out[1] == 4 && out[2] == 5);
}

static void test_zero_and_reset() {
    SerialPair pair(4);
    assert(pair.write(Endpoint::A, nullptr, 0) == 0);
    assert(pair.read(Endpoint::A, nullptr, 0) == 0);
    bool rejected = false;
    try { pair.write(Endpoint::A, nullptr, 1); }
    catch (const std::invalid_argument&) { rejected = true; }
    assert(rejected);
    rejected = false;
    try { SerialPair invalid(0); }
    catch (const std::invalid_argument&) { rejected = true; }
    assert(rejected);
    std::uint8_t data[] {9, 8};
    pair.write(Endpoint::B, data, 2);
    pair.reset();
    assert(pair.available(Endpoint::A) == 0);
    assert(pair.available(Endpoint::B) == 0);
}

static void test_concurrent_writers() {
    SerialPair pair(5000);
    const std::array<std::uint8_t, 1000> a = [] { std::array<std::uint8_t, 1000> b{}; b.fill(0xA5); return b; }();
    const std::array<std::uint8_t, 1000> b = [] { std::array<std::uint8_t, 1000> b{}; b.fill(0x5A); return b; }();
    std::thread ta([&] { assert(pair.write(Endpoint::A, a.data(), a.size()) == a.size()); });
    std::thread tb([&] { assert(pair.write(Endpoint::B, b.data(), b.size()) == b.size()); });
    ta.join(); tb.join();
    std::array<std::uint8_t, 1000> received{};
    assert(pair.read(Endpoint::B, received.data(), received.size()) == received.size());
    for (auto x : received) assert(x == 0xA5);
    assert(pair.read(Endpoint::A, received.data(), received.size()) == received.size());
    for (auto x : received) assert(x == 0x5A);
}
int main() {
    test_bidirectional_and_binary_bytes();
    test_capacity_and_wrap();
    test_zero_and_reset();
    test_concurrent_writers();
    std::cout << "PASS: 4 testes do motor serial independente\n";
}
