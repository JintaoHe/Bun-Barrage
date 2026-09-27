#!/usr/bin/env bash
# Drives one player turn in the Even Hub simulator (needs --automation-port 9898)
# and saves glasses screenshots to sim/.
A=${SIM:-localhost:9898}
mkdir -p sim
inp(){ curl -s -X POST $A/api/input -H 'content-type: application/json' -d "{\"action\":\"$1\"}" >/dev/null; }
snap(){ curl -s $A/api/screenshot/glasses -o sim/$1.png; }
snap s1-title
inp click; sleep 0.4; snap s2-banner
sleep 1.5
for i in 1 2 3 4 5; do inp up; sleep 0.25; done
snap s3-aim-angle
inp click; sleep 0.4
for i in 1 2 3 4 5 6; do inp up; sleep 0.25; done
snap s4-aim-power
inp click; sleep 0.9; snap s5-flight
sleep 3.2; snap s6-after
sleep 2.2; snap s7-cpu
sleep 4; snap s8-later
