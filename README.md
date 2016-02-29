# server-status-ui
User friendly UI for Apache httpd mod_status module

It loads data from output of httpd's mod_status and renders it in a slightly prettier way.
Main goal is to visualize the state and amount of worker threads.

The UI has following sections:
1. General info - Uptime, Total threads, Total accesses, Total traffic, Data/sec avg, Requests/sec avg
2. Ratio busy to idle worker threads
3. Dynamics of idle threads for past X seconds (configurable in config.js as well as from UI)
4. Scoreboard - what are the threads busy with
5. Settings for refresh rate and section 3. trend length
