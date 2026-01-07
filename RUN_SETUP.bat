@echo off
title Canteen POS - Setup Wizard
color 0B

echo ============================================
echo   CANTEEN POS SYSTEM - SETUP WIZARD
echo ============================================
echo.
echo Starting setup wizard...
echo.

cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js first:
    echo 1. Go to: https://nodejs.org/
    echo 2. Download and install Node.js
    echo 3. Restart this setup
    echo.
    pause
    exit /b 1
)

REM Check if node_modules exists, if not install
if not exist "%~dp0node_modules" (
    echo Installing dependencies...
    echo This may take a few minutes...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Failed to install dependencies!
        echo Please check your internet connection.
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed successfully!
    echo.
)

REM Start the server
echo Starting server...
echo.
echo ============================================
echo  Server is starting...
echo  Your browser will open automatically
echo ============================================
echo.

REM Start Node.js server in background
start /B node server.js

REM Wait for server to start
timeout /t 3 /nobreak >nul

REM Open setup wizard in browser
start http://localhost:3000/setup.html

echo.
echo Setup wizard opened in your browser!
echo.
echo If the browser doesn't open automatically,
echo please visit: http://localhost:3000/setup.html
echo.
echo ============================================
echo  Press Ctrl+C to stop the server
echo ============================================
echo.

REM Keep the window open
pause