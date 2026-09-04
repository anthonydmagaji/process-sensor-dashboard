"""
app.py

v2: Interactive Streamlit dashboard for the Process Sensor Data Dashboard project.
Generates synthetic sensor data, cleans it, and lets the user adjust the
anomaly detection threshold and generation parameters live.

Run with: streamlit run app.py
"""

import matplotlib.pyplot as plt
import streamlit as st

from sensor_core import generate_data, clean_data, detect_anomalies, summarise

SENSOR_COLUMNS = ["temperature_C", "pressure_bar", "flow_Lmin"]
SENSOR_LABELS = {
    "temperature_C": "Temperature (°C)",
    "pressure_bar": "Pressure (bar)",
    "flow_Lmin": "Flow (L/min)",
}

st.set_page_config(page_title="Process Sensor Dashboard", layout="wide")

st.title("Process Sensor Data Dashboard")
st.caption(
    "Synthetic plant sensor data with automated cleaning and anomaly detection. "
    "Adjust the controls in the sidebar to see the effect live."
)

# --- Sidebar controls ---
st.sidebar.header("Data generation")
n_points = st.sidebar.slider("Number of readings", 50, 500, 200, step=10)
noise_level = st.sidebar.slider("Sensor noise level", 0.5, 3.0, 1.0, step=0.1)
missing_fraction = st.sidebar.slider("Missing data fraction", 0.0, 0.15, 0.03, step=0.01)
spike_fraction = st.sidebar.slider("Spike/fault fraction", 0.0, 0.10, 0.02, step=0.01)
seed = st.sidebar.number_input("Random seed", value=42, step=1)

st.sidebar.header("Anomaly detection")
n_std = st.sidebar.slider("Anomaly threshold (std deviations)", 1.0, 5.0, 3.0, step=0.5)

uploaded_file = st.sidebar.file_uploader("Or upload your own CSV", type=["csv"])

# --- Data pipeline ---
if uploaded_file is not None:
    import pandas as pd

    raw_df = pd.read_csv(uploaded_file, parse_dates=["timestamp"])
    st.sidebar.success("Using uploaded data")
else:
    raw_df = generate_data(
        n_points=n_points,
        temp_std=3.0 * noise_level,
        pressure_std=0.15 * noise_level,
        flow_std=5.0 * noise_level,
        missing_fraction=missing_fraction,
        spike_fraction=spike_fraction,
        seed=int(seed),
    )

clean_df = clean_data(raw_df)
for col in SENSOR_COLUMNS:
    if col in clean_df.columns:
        clean_df = detect_anomalies(clean_df, col, n_std=n_std)

# --- Summary metrics ---
cols = st.columns(len(SENSOR_COLUMNS))
for i, col in enumerate(SENSOR_COLUMNS):
    if col not in clean_df.columns:
        continue
    stats = summarise(clean_df, col)
    with cols[i]:
        st.metric(
            label=SENSOR_LABELS[col],
            value=f"{stats['mean']:.2f}",
            delta=f"{stats['n_anomalies']} anomalies",
            delta_color="inverse",
        )

# --- Charts ---
for col in SENSOR_COLUMNS:
    if col not in clean_df.columns:
        continue
    st.subheader(SENSOR_LABELS[col])

    fig, ax = plt.subplots(figsize=(10, 3.5))
    ax.plot(clean_df["timestamp"], clean_df[col], label="Reading", color="tab:blue", linewidth=1)

    anomaly_col = f"{col}_is_anomaly"
    if anomaly_col in clean_df.columns:
        anomalies = clean_df[clean_df[anomaly_col]]
        ax.scatter(
            anomalies["timestamp"], anomalies[col],
            color="red", label="Anomaly", zorder=5, s=25,
        )

    ax.set_xlabel("Time")
    ax.set_ylabel(SENSOR_LABELS[col])
    ax.legend(loc="upper right")
    fig.autofmt_xdate()
    fig.tight_layout()
    st.pyplot(fig)
    plt.close(fig)

# --- Raw data table ---
with st.expander("View data table"):
    st.dataframe(clean_df, use_container_width=True)

st.download_button(
    "Download cleaned data as CSV",
    data=clean_df.to_csv(index=False),
    file_name="cleaned_sensor_data.csv",
    mime="text/csv",
)
