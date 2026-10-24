#include "portus/serial_pair.hpp"

#include <algorithm>
#include <cstring>
#include <stdexcept>

namespace portus::serial {

SerialPair::SerialPair(std::size_t capacity_per_endpoint)
    : rx_a_(capacity_per_endpoint), rx_b_(capacity_per_endpoint) {
    if (capacity_per_endpoint == 0) {
        throw std::invalid_argument("capacity_per_endpoint must be > 0");
    }
}

std::size_t SerialPair::Ring::push(const std::uint8_t* bytes, std::size_t count) {
    const std::size_t count_to_write = std::min(count, storage.size() - length);
    if (count_to_write == 0) return 0;
    const std::size_t tail = (head + length) % storage.size();
    const std::size_t first = std::min(count_to_write, storage.size() - tail);
    std::memcpy(storage.data() + tail, bytes, first);
    if (first < count_to_write) {
        std::memcpy(storage.data(), bytes + first, count_to_write - first);
    }
    length += count_to_write;
    return count_to_write;
}

std::size_t SerialPair::Ring::pop(std::uint8_t* destination, std::size_t count) {
    const std::size_t count_to_read = std::min(count, length);
    if (count_to_read == 0) return 0;
    const std::size_t first = std::min(count_to_read, storage.size() - head);
    std::memcpy(destination, storage.data() + head, first);
    if (first < count_to_read) {
        std::memcpy(destination + first, storage.data(), count_to_read - first);
    }
    head = (head + count_to_read) % storage.size();
    length -= count_to_read;
    return count_to_read;
}

SerialPair::Ring& SerialPair::ring_for(Endpoint receiver) {
    return receiver == Endpoint::A ? rx_a_ : rx_b_;
}

const SerialPair::Ring& SerialPair::ring_for(Endpoint receiver) const {
    return receiver == Endpoint::A ? rx_a_ : rx_b_;
}

std::size_t SerialPair::write(Endpoint sender, const std::uint8_t* bytes, std::size_t count) {
    if (bytes == nullptr && count != 0) throw std::invalid_argument("null source");
    if (count == 0) return 0;
    std::lock_guard<std::mutex> lock(mutex_);
    return ring_for(sender == Endpoint::A ? Endpoint::B : Endpoint::A).push(bytes, count);
}

std::size_t SerialPair::read(Endpoint receiver, std::uint8_t* destination, std::size_t count) {
    if (destination == nullptr && count != 0) throw std::invalid_argument("null destination");
    if (count == 0) return 0;
    std::lock_guard<std::mutex> lock(mutex_);
    return ring_for(receiver).pop(destination, count);
}

std::size_t SerialPair::available(Endpoint receiver) const {
    std::lock_guard<std::mutex> lock(mutex_);
    return ring_for(receiver).length;
}

std::size_t SerialPair::free_space(Endpoint receiver) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto& ring = ring_for(receiver);
    return ring.storage.size() - ring.length;
}

std::size_t SerialPair::capacity() const noexcept { return rx_a_.storage.size(); }

void SerialPair::reset() {
    std::lock_guard<std::mutex> lock(mutex_);
    rx_a_.clear();
    rx_b_.clear();
}

} // namespace portus::serial
