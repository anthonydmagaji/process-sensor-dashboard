"""
sensor_core.py

Core functions for the Process Sensor Data Dashboard project.
Generates synthetic plant sensor data (temperature, pressure, flow),
cleans it, and flags anomalous readings.
"""

import numpy as np
import pandas as pd


def generate_data(
    n_points: int = 200,
    interval_minutes: int = 5,
    temp_mean: float = 85.0,
    temp_std: float = 3.0,
    pressure_mean: float = 4.2,
    pressure_std: float = 0.15,
    flow_mean: float = 120.0,
    flow_std: float = 5.0,
    missing_fraction: float = 0.03,
    spike_fraction: float = 0.02,
    seed: int | None = None,
) -> pd.DataFrame:
    """
    Generate a synthetic time series of sensor readings for a simple process.

    Simulates three sensors (temperature in degC, pressure in bar, flow in L/min)
    with normal random noise, then injects a small fraction of missing values
    and a small fraction of large spikes to mimic real faulty sensor behaviour.
    """
    rng = np.random.default_rng(seed)

    timestamps = pd.date_range("2026-01-01 00:00", periods=n_points, freq=f"{interval_minutes}min")

    temperature = rng.normal(temp_mean, temp_std, n_points)
    pressure = rng.normal(pressure_mean, pressure_std, n_points)
    flow = rng.normal(flow_mean, flow_std, n_points)

    df = pd.DataFrame(
        {
            "timestamp": timestamps,
            "temperature_C": temperature,
            "pressure_bar": pressure,
            "flow_Lmin": flow,
        }
    )

    # Inject a few missing values, per numeric column
    numeric_cols = ["temperature_C", "pressure_bar", "flow_Lmin"]
    for col in numeric_cols:
        n_missing = int(n_points * missing_fraction)
        missing_idx = rng.choice(n_points, size=n_missing, replace=False)
        df.loc[missing_idx, col] = np.nan

    # Inject a few large spikes (simulating sensor faults) into temperature
    n_spikes = int(n_points * spike_fraction)
    spike_idx = rng.choice(n_points, size=n_spikes, replace=False)
    spike_direction = rng.choice([-1, 1], size=n_spikes)
    df.loc[spike_idx, "temperature_C"] += spike_direction * rng.uniform(15, 30, n_spikes)

    return df


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean a raw sensor DataFrame by interpolating missing values.

    Uses linear interpolation along the time axis, then forward/backward
    fills any remaining edge gaps.
    """
    df = df.copy()
    numeric_cols = ["temperature_C", "pressure_bar", "flow_Lmin"]

    for col in numeric_cols:
        df[col] = df[col].interpolate(method="linear")
        df[col] = df[col].bfill().ffill()

    return df


def detect_anomalies(df: pd.DataFrame, column: str, n_std: float = 3.0) -> pd.DataFrame:
    """
    Flag anomalous readings in a given column using a rolling z-score.

    A reading is flagged as an anomaly if it falls more than `n_std`
    standard deviations from the column's mean.
    """
    df = df.copy()
    mean = df[column].mean()
    std = df[column].std()

    lower_bound = mean - n_std * std
    upper_bound = mean + n_std * std

    flag_col = f"{column}_is_anomaly"
    df[flag_col] = (df[column] < lower_bound) | (df[column] > upper_bound)

    return df


def summarise(df: pd.DataFrame, column: str) -> dict:
    """Return basic summary statistics for a sensor column."""
    return {
        "mean": df[column].mean(),
        "std": df[column].std(),
        "min": df[column].min(),
        "max": df[column].max(),
        "n_anomalies": int(df.get(f"{column}_is_anomaly", pd.Series(dtype=bool)).sum()),
    }
