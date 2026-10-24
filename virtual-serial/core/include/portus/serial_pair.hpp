#pragma once

#include <cstddef>
#include <cstdint>
#include <mutex>
#include <vector>

namespace portus::serial {

enum class Endpoint : std::uint8_t { A, B };

// Transport core only: no operating system port is created by this class.
// Each endpoint owns a separate incoming ring. A write to A delivers to B.
class SerialPair final {
public:
    explicit SerialPair(std::size_t capacity_per_endpoint = 4096);
    SerialPair(const SerialPair&) = delete;
    SerialPair& operator=(const SerialPair&) = delete;

    std::size_t write(Endpoint sender, const std::uint8_t* bytes, std::size_t count);
    std::size_t read(Endpoint receiver, std::uint8_t* destination, std::size_t count);
    std::size_t available(Endpoint receiver) const;
    std::size_t free_space(Endpoint receiver) const;
    std::size_t capacity() const noexcept;
    void reset();

private:
    struct Ring {
        explicit Ring(std::size_t capacity) : storage(capacity) {}
        std::vector<std::uint8_t> storage;
        std::size_t head = 0;
        std::size_t length = 0;
        std::size_t push(const std::uint8_t* bytes, std::size_t count);
        std::size_t pop(std::uint8_t* destination, std::size_t count);
        void clear() noexcept { head = 0; length = 0; }
    };

    Ring& ring_for(Endpoint receiver);
    const Ring& ring_for(Endpoint receiver) const;

    mutable std::mutex mutex_;
    Ring rx_a_;
    Ring rx_b_;
};

} // namespace portus::serial
