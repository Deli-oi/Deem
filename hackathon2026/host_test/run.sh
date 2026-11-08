#!/bin/sh
# Runs the firmware logic on a PC against fake sensors (no hardware, no WiFi).
#   wsl sh hackathon2026/host_test/run.sh        (or any machine with g++)
set -e
here=$(cd "$(dirname "$0")" && pwd)
build=$(mktemp -d)
cp "$here"/../src/*.h "$here"/../src/main.cpp "$build"/
cp "$here"/stubs/*.h "$build"/          # fake libraries; also replaces mqtt_link.h with the no-network stand-in
cp "$here"/sim_test.cpp "$build"/
cd "$build"
g++ -std=c++17 -Wall -Wextra -Wno-unused-function -Wno-unused-variable -I. sim_test.cpp -o sim_test
./sim_test
