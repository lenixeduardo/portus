#ifndef LABSERIAL_RING_H
#define LABSERIAL_RING_H
/*
 * Portable FIFO operations used directly by the Windows KMDF driver.
 * Caller MUST serialize access to head/used/storage. No allocation, no WDK API.
 * Returns a short count on backpressure; never silently overwrites bytes.
 */
static unsigned long LabRingPush(
    unsigned char *storage, unsigned long capacity, unsigned long head,
    unsigned long *used, const unsigned char *source, unsigned long count)
{
    unsigned long copied, i;
    if (count == 0) return 0;
    if (!storage || !used || !source || capacity == 0 ||
        head >= capacity || *used > capacity) return 0;
    copied = count < capacity - *used ? count : capacity - *used;
    for (i = 0; i < copied; ++i) {
        storage[(head + *used + i) % capacity] = source[i];
    }
    *used += copied;
    return copied;
}

static unsigned long LabRingPop(
    unsigned char *storage, unsigned long capacity, unsigned long *head,
    unsigned long *used, unsigned char *destination, unsigned long count)
{
    unsigned long copied, i;
    if (count == 0) return 0;
    if (!storage || !head || !used || !destination || capacity == 0 ||
        *head >= capacity || *used > capacity) return 0;
    copied = count < *used ? count : *used;
    for (i = 0; i < copied; ++i) {
        destination[i] = storage[(*head + i) % capacity];
    }
    *head = (*head + copied) % capacity;
    *used -= copied;
    return copied;
}
#endif
