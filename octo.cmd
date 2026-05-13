@echo off
:: octo.cmd — run Octopus from Command Prompt
:: Usage: octo [start|setup|stop|status|logs|voice|help]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0octo.ps1" %*
