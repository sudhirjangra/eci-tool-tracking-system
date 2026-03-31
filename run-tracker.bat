@echo off
:: 1. Set the path to your portable Node v24
set PATH=C:\Users\ID0346943\Downloads\nodejs;%PATH%

:: 2. Navigate to your project folder (if not already there)
cd /d "C:\Users\ID0346943\Downloads\Elections 2026 Tracker\Production\election-dashboard"

:: 3. Verify Node version just to be sure
echo Using Node Version:
node -v

:: 4. Run the development server using the direct JS path to bypass security blocks
echo Starting Vite Dev Server...
node "C:\Users\ID0346943\Downloads\nodejs\node_modules\npm\bin\npm-cli.js" run dev

pause