# Firmware logic test (no hardware needed)

Runs the real `loop()` from `src/main.cpp` against fake sensors on a PC and checks what would be
published when a sensor is healthy, unplugged, warming up, or returning garbage.

    wsl sh hackathon2026/host_test/run.sh      # or `sh host_test/run.sh` anywhere with g++

Not part of the PlatformIO build.
