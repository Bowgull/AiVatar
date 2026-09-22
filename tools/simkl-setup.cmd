@echo off
rem Double-click to connect Aang to Simkl. See simkl-setup.ps1 for what it does.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0simkl-setup.ps1" %*
