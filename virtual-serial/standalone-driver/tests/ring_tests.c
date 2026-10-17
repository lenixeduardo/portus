/* Native user-mode tests for the exact, platform-neutral FIFO used by labserial.c.
 * These do NOT load, run or verify the Windows kernel driver.
 */
#include "../core/labserial_ring.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

#define CAP 37UL
#define STEPS 100000UL
static unsigned int seed = 0x6c616273U;
static unsigned int next_random(void) {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return seed;
}

static void test_binary_wrap_and_backpressure(void) {
    unsigned char ring[4] = {0};
    unsigned char input[] = {0x00, 0xff, 0x13, 0x7f, 0x30, 0x31};
    unsigned char output[6] = {0};
    unsigned long head = 0, used = 0;
    assert(LabRingPush(ring, 4, head, &used, input, 6) == 4);
    assert(used == 4);
    assert(LabRingPush(ring, 4, head, &used, input, 2) == 0);
    assert(LabRingPop(ring, 4, &head, &used, output, 3) == 3);
    assert(memcmp(output, input, 3) == 0);
    assert(LabRingPush(ring, 4, head, &used, input + 4, 2) == 2);
    assert(LabRingPop(ring, 4, &head, &used, output, 6) == 3);
    assert(output[0] == 0x7f && output[1] == 0x30 && output[2] == 0x31);
    assert(used == 0);
}

static void test_invalid_state_and_zero_length(void) {
    unsigned char ring[1] = {0}, b = 0xff;
    unsigned long head = 0, used = 0;
    assert(LabRingPush(ring, 1, head, &used, &b, 0) == 0);
    assert(LabRingPop(ring, 1, &head, &used, &b, 0) == 0);
    assert(LabRingPush(NULL, 1, head, &used, &b, 1) == 0);
    assert(LabRingPop(NULL, 1, &head, &used, &b, 1) == 0);
    assert(LabRingPush(ring, 1, head, &used, &b, 1) == 1);
    assert(LabRingPush(ring, 1, head, &used, &b, 1) == 0);
    assert(LabRingPop(ring, 1, &head, &used, &b, 1) == 1 && b == 0xff);
    assert(used == 0);
    used = 2;
    assert(LabRingPop(ring, 1, &head, &used, &b, 1) == 0);
}

static void test_seeded_reference_fifo(void) {
    unsigned char ring[CAP] = {0}, reference[CAP] = {0};
    unsigned char source[80], received[80];
    unsigned long head = 0, used = 0, reference_used = 0;
    unsigned long step, i;
    for (step = 0; step < STEPS; ++step) {
        const unsigned long count = (unsigned long)(next_random() % 80U);
        if ((next_random() & 1U) == 0) {
            unsigned long expected = count < CAP - reference_used ? count : CAP - reference_used;
            unsigned long written;
            for (i = 0; i < count; ++i) source[i] = (unsigned char)next_random();
            written = LabRingPush(ring, CAP, head, &used, source, count);
            assert(written == expected);
            memcpy(reference + reference_used, source, (size_t)written);
            reference_used += written;
        } else {
            unsigned long expected = count < reference_used ? count : reference_used;
            unsigned long read = LabRingPop(ring, CAP, &head, &used, received, count);
            assert(read == expected);
            assert(memcmp(received, reference, (size_t)read) == 0);
            memmove(reference, reference + read, (size_t)(reference_used - read));
            reference_used -= read;
        }
        assert(used == reference_used);
        assert(head < CAP);
    }
    assert(LabRingPop(ring, CAP, &head, &used, received, CAP) == reference_used);
    assert(memcmp(received, reference, (size_t)reference_used) == 0);
}

int main(void) {
    test_binary_wrap_and_backpressure();
    test_invalid_state_and_zero_length();
    test_seeded_reference_fifo();
    puts("PASS: kernel FIFO native tests (binary, overflow, wrap, 100000 seeded operations)");
    return 0;
}
