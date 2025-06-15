# Stock Analysis Project for St Clair

This repository contains a FastAPI backend and a React frontend used for various stock analysis utilities.

## Project Structure

- **`frontend/`** – React + TypeScript web application built with Vite.
- **`backend/`** – FastAPI service exposing stock analysis endpoints.

## Backend Setup

1. Ensure Python 3.10+ is available.
2. Install the dependencies:

   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. Create a `.env` file inside `backend` with your API keys:

   ```
   FMP_API_KEY=<your FMP key>
   FMP_BASE_URL=https://financialmodelingprep.com/api/v3
   TWELVE_DATA_API_KEY=<your Twelve Data key>
   AWS_ACCESS_KEY_ID=<optional AWS key>
   AWS_SECRET_ACCESS_KEY=<optional AWS secret>
   ```

4. Start the API server:

   ```bash
   uvicorn main:app --reload
   ```

The backend listens on port `8000` by default.

## Frontend Setup

1. Install Node.js (v18 or newer).
2. Install dependencies and start the dev server:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

The frontend expects the backend to be running on `http://localhost:8000`.
