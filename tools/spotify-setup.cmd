@echo off
rem Double-click to connect Aang to Spotify. See spotify-setup.ps1 for what it does.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0spotify-setup.ps1" %*
