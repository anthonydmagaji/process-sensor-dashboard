# Process Sensor Data Dashboard

A Python tool that generates, cleans, and analyses synthetic plant sensor data
(temperature, pressure, flow), with automated anomaly detection and an
interactive web dashboard.

## What it does

- Generates realistic synthetic sensor readings with injected missing values
  and sensor faults (spikes)
- Cleans the data using linear interpolation
- Flags anomalous readings using a standard-deviation threshold
- Visualises results as time-series charts, with anomalies highlighted
- Provides two versions:
  - `run_script_version.py` — a simple script that saves charts and a CSV
  - `app.py` — an interactive Streamlit dashboard with live controls

## Tech used

Python, Pandas, NumPy, Matplotlib, Streamlit

## Running it

Install dependencies:

    pip install -r requirements.txt

Run the simple script version (saves PNG charts + CSV to the current folder):

    python run_script_version.py

Run the interactive dashboard:

    streamlit run app.py

The dashboard opens in your browser. Use the sidebar to adjust the number of
readings, noise level, missing/fault rates, and the anomaly detection
threshold — the charts and summary stats update live. You can also upload
your own CSV (with `timestamp`, `temperature_C`, `pressure_bar`, `flow_Lmin`
columns) instead of using synthetic data.

## Project structure

    sensor_core.py           # data generation, cleaning, anomaly detection functions
    run_script_version.py    # v1: simple script version
    app.py                   # v2: interactive Streamlit dashboard
    requirements.txt
