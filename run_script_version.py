"""
run_script_version.py

v1: Simple script version of the Process Sensor Data Dashboard.
Generates synthetic sensor data, cleans it, flags anomalies,
prints a summary, and saves charts as PNG files.

Run with: python run_script_version.py
"""

import matplotlib.pyplot as plt

from sensor_core import generate_data, clean_data, detect_anomalies, summarise

SENSOR_COLUMNS = ["temperature_C", "pressure_bar", "flow_Lmin"]


def main():
    print("Generating synthetic sensor data...")
    raw_df = generate_data(n_points=200, seed=42)

    print("Cleaning data (interpolating missing values)...")
    clean_df = clean_data(raw_df)

    print("Detecting anomalies...")
    for col in SENSOR_COLUMNS:
        clean_df = detect_anomalies(clean_df, col, n_std=3.0)

    print("\n--- Summary ---")
    for col in SENSOR_COLUMNS:
        stats = summarise(clean_df, col)
        print(
            f"{col}: mean={stats['mean']:.2f}, std={stats['std']:.2f}, "
            f"min={stats['min']:.2f}, max={stats['max']:.2f}, "
            f"anomalies={stats['n_anomalies']}"
        )

    print("\nSaving charts...")
    for col in SENSOR_COLUMNS:
        fig, ax = plt.subplots(figsize=(10, 4))
        ax.plot(clean_df["timestamp"], clean_df[col], label=col, color="tab:blue")

        anomaly_col = f"{col}_is_anomaly"
        anomalies = clean_df[clean_df[anomaly_col]]
        ax.scatter(anomalies["timestamp"], anomalies[col], color="red", label="Anomaly", zorder=5)

        ax.set_title(f"{col} over time")
        ax.set_xlabel("Time")
        ax.set_ylabel(col)
        ax.legend()
        fig.autofmt_xdate()
        fig.tight_layout()

        out_path = f"{col}_chart.png"
        fig.savefig(out_path, dpi=120)
        plt.close(fig)
        print(f"  saved {out_path}")

    clean_df.to_csv("cleaned_sensor_data.csv", index=False)
    print("\nSaved cleaned_sensor_data.csv")
    print("Done.")


if __name__ == "__main__":
    main()
