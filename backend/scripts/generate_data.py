from __future__ import annotations

from pathlib import Path
import numpy as np
import pandas as pd


RANDOM_SEED = 42
N_ROWS = 12000


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-x))


def generate_base_dataframe(n_rows: int, flawed: bool = False) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_SEED if not flawed else RANDOM_SEED + 7)

    user_ids = [f"U{idx:06d}" for idx in range(1, n_rows + 1)]

    if flawed:
        treatment = rng.choice(["control", "treatment"], size=n_rows, p=[0.65, 0.35])
    else:
        treatment = rng.choice(["control", "treatment"], size=n_rows, p=[0.50, 0.50])

    device = rng.choice(
        ["mobile", "desktop", "tablet"],
        size=n_rows,
        p=[0.58, 0.34, 0.08],
    )

    country = rng.choice(
        ["US", "IN", "UK", "CA"],
        size=n_rows,
        p=[0.42, 0.30, 0.18, 0.10],
    )

    prior_orders = rng.poisson(lam=1.8, size=n_rows)
    pre_period_spend = np.round(rng.gamma(shape=2.2, scale=28.0, size=n_rows), 2)
    days_since_signup = rng.integers(1, 720, size=n_rows)

    # Create timestamps over a 30-day window
    start_time = np.datetime64("2026-01-01T00:00:00")
    offsets_in_minutes = rng.integers(0, 30 * 24 * 60, size=n_rows)
    timestamp = start_time + offsets_in_minutes.astype("timedelta64[m]")

    # Optional imbalance in flawed dataset
    if flawed:
        high_value_mask = treatment == "treatment"
        pre_period_spend[high_value_mask] += rng.normal(20, 8, high_value_mask.sum()).clip(min=0)
        prior_orders[high_value_mask] += rng.integers(0, 2, high_value_mask.sum())

    device_effect = np.select(
        [device == "mobile", device == "desktop", device == "tablet"],
        [-0.15, 0.12, -0.05],
        default=0.0,
    )

    country_effect = np.select(
        [country == "US", country == "IN", country == "UK", country == "CA"],
        [0.08, -0.04, 0.03, 0.01],
        default=0.0,
    )

    treatment_effect = np.where(treatment == "treatment", 0.22 if not flawed else 0.18, 0.0)

    linear_score = (
        -3.1
        + treatment_effect
        + device_effect
        + country_effect
        + 0.11 * np.log1p(prior_orders)
        + 0.0025 * pre_period_spend
        + 0.0005 * days_since_signup
    )

    conversion_prob = sigmoid(linear_score)
    converted = rng.binomial(1, conversion_prob)

    revenue = np.zeros(n_rows)
    converters = converted == 1

    # Right-skewed revenue
    revenue[converters] = rng.lognormal(mean=3.4, sigma=0.75, size=converters.sum())

    # Treatment users spend slightly more when converted
    treatment_converter_mask = (treatment == "treatment") & converters
    revenue[treatment_converter_mask] *= 1.08

    revenue = np.round(revenue, 2)

    df = pd.DataFrame(
        {
            "user_id": user_ids,
            "treatment": treatment,
            "converted": converted,
            "revenue": revenue,
            "device": device,
            "country": country,
            "prior_orders": prior_orders,
            "pre_period_spend": np.round(pre_period_spend, 2),
            "days_since_signup": days_since_signup,
            "timestamp": pd.to_datetime(timestamp),
        }
    )

    if flawed:
        # Missing outcomes: more missingness in treatment
        treatment_idx = df[df["treatment"] == "treatment"].sample(frac=0.08, random_state=RANDOM_SEED).index
        control_idx = df[df["treatment"] == "control"].sample(frac=0.02, random_state=RANDOM_SEED).index

        df.loc[treatment_idx, "converted"] = np.nan
        df.loc[control_idx, "revenue"] = np.nan

    return df.sort_values("timestamp").reset_index(drop=True)


def print_summary(df: pd.DataFrame, name: str) -> None:
    print(f"\n{name}")
    print("-" * len(name))
    print(f"Rows: {len(df):,}")
    print("Treatment counts:")
    print(df["treatment"].value_counts(dropna=False))
    print("\nConversion rate by treatment:")
    print(df.groupby("treatment")["converted"].mean())
    print("\nRevenue by treatment:")
    print(df.groupby("treatment")["revenue"].mean())
    print("\nMissing values:")
    print(df.isna().sum())


def main() -> None:
    project_root = Path(__file__).resolve().parents[2]
    output_dir = project_root / "data" / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)

    clean_df = generate_base_dataframe(N_ROWS, flawed=False)
    flawed_df = generate_base_dataframe(N_ROWS, flawed=True)

    clean_path = output_dir / "clean_ab_data.csv"
    flawed_path = output_dir / "flawed_ab_data.csv"

    clean_df.to_csv(clean_path, index=False)
    flawed_df.to_csv(flawed_path, index=False)

    print(f"Saved clean dataset to: {clean_path}")
    print(f"Saved flawed dataset to: {flawed_path}")

    print_summary(clean_df, "Clean Dataset Summary")
    print_summary(flawed_df, "Flawed Dataset Summary")


if __name__ == "__main__":
    main()