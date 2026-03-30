# SwiftQuery

SwiftQuery is a small full-stack demo for prompt-to-SQL query sessions with:

- a React frontend
- a FastAPI backend
- adaptive sampling for `COUNT`, `SUM`, and `AVG`
- exact-query comparison via DuckDB
- user dataset uploads for `csv`, `tsv`, `json`, `xml`, and `sqlite`

This README is written for Windows Command Prompt (`cmd.exe`).

## Repo Layout

```text
bubble/
  apps/
    api/   FastAPI backend
    web/   React + Vite frontend
```

## Prerequisites

- Windows with `cmd.exe`
- Python 3.11 or newer
- Node.js 20 or newer
- Corepack enabled so `pnpm` works

You can check versions with:

```cmd
python --version
node --version
corepack --version
```

If `pnpm` is not available yet:

```cmd
corepack enable
```

## Backend Setup

Open Command Prompt and run:

```cmd
cd /d D:\ishi\bubble\apps\api
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -e .
```

## Frontend Setup

Open a second Command Prompt window and run:

```cmd
cd /d D:\ishi\bubble\apps\web
corepack pnpm install
```

## Run The Full App

You need two Command Prompt windows.

### Terminal 1: API

```cmd
cd /d D:\ishi\bubble\apps\api
.venv\Scripts\activate
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend URLs:

- API root: `http://127.0.0.1:8000/`
- Swagger docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/api/health`

### Terminal 2: Web

```cmd
cd /d D:\ishi\bubble\apps\web
set VITE_QUERY_SOURCE=sse
set VITE_API_BASE_URL=http://127.0.0.1:8000
corepack pnpm dev
```

Frontend URL:

- App: `http://127.0.0.1:5173`

`VITE_QUERY_SOURCE=sse` is required for the live backend flow, including dataset upload from the `+` button in the UI.

## Run Frontend Only In Mock Mode

If you only want to see the UI without starting the backend:

```cmd
cd /d D:\ishi\bubble\apps\web
set VITE_QUERY_SOURCE=mock
corepack pnpm dev
```

In mock mode, the app uses static demo data and does not support file upload.

## How To Use Uploaded Datasets

1. Start the backend and frontend in live mode.
2. Open `http://127.0.0.1:5173`.
3. Click the `+` button next to the dataset dropdown.
4. Upload a `.csv`, `.tsv`, `.json`, `.xml`, `.sqlite`, `.sqlite3`, or `.db` file.
5. Select the imported dataset if it is not already selected.
6. Run a prompt such as:

```text
How many rows are there?
What is the total sales?
What is the average amount?
How many rows have status equal to paid?
```

Current adaptive sampling support is limited to single-table `COUNT`, `SUM`, and `AVG` queries.

## Build And Test

### Backend tests

```cmd
cd /d D:\ishi\bubble\apps\api
.venv\Scripts\activate
python -m unittest discover -s tests -v
```

### Frontend production build

```cmd
cd /d D:\ishi\bubble\apps\web
corepack pnpm build
```

## Common `cmd` Notes

- Use `set NAME=value` for environment variables in `cmd`.
- If you open a new Command Prompt window, run `.venv\Scripts\activate` again before using backend Python commands.
- If port `8000` or `5173` is already in use, stop the old process or change the port in the command.

## Troubleshooting Port Errors On Windows

If you see errors like `WinError 10013` or `WinError 10048` when starting Uvicorn/Vite, another process is usually already bound to that port.

### PowerShell: check and free API port 8000

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8000 | Select-Object LocalAddress,LocalPort,OwningProcess
Stop-Process -Id <PID> -Force
```

Then start API again:

```cmd
cd /d D:\ishi\bubble\apps\api
.venv\Scripts\activate
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### PowerShell: check and free web port 5173

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173 | Select-Object LocalAddress,LocalPort,OwningProcess
Stop-Process -Id <PID> -Force
```

Then start web again:

```cmd
cd /d D:\ishi\bubble\apps\web
set VITE_QUERY_SOURCE=sse
set VITE_API_BASE_URL=http://127.0.0.1:8000
corepack pnpm dev
```

If you do not want to stop the existing process, run on a different port (for example `8001` or `5174`).
