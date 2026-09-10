"""
SeaKeepers - NOAA MDMAP Seed Data Preparation & Verification
Combines, cleans, verifies, and reshapes raw NOAA MDMAP survey CSVs 
into seed_reports.csv for DynamoDB seeding.
"""

import glob
import numpy as np
import pandas as pd

RAW_DATA_DIR = "data/raw"
OUTPUT_PATH = "data/seed_reports.csv"

# Published NOAA MDMAP summary statistics used as a directional integrity cross-check
NOAA_PUBLISHED_SURVEYS = 4421
NOAA_PUBLISHED_SITES = 335
NOAA_PUBLISHED_COUNTRIES = 9


def load_and_combine_raw_files() -> pd.DataFrame:
    """Combine all downloaded regional MDMAP export CSVs into one dataframe."""
    file_list = glob.glob(f"{RAW_DATA_DIR}/MDMAP_Export_*.csv")
    if not file_list:
        raise FileNotFoundError(
            f"No MDMAP_Export_*.csv files found in {RAW_DATA_DIR}. "
            "Download the raw exports first (see README)."
        )
    print("Files found:", file_list)

    dfs = [pd.read_csv(f) for f in file_list]
    combined = pd.concat(dfs, ignore_index=True)
    print("Combined shape:", combined.shape)
    return combined


def deduplicate(combined: pd.DataFrame) -> pd.DataFrame:
    """Remove duplicate survey+transect rows that may occur across split regional downloads."""
    duplicates = combined.duplicated(subset=["survey_id", "transect_id"]).sum()
    print("Duplicate survey+transect rows across files:", duplicates)

    if duplicates > 0:
        combined = combined.drop_duplicates(subset=["survey_id", "transect_id"])
        print("After dedup:", combined.shape)
    return combined


def verify_data_integrity(combined: pd.DataFrame) -> None:
    """Cross-checks survey and site counts against published NOAA baseline figures."""
    unique_sites = combined["shoreline_site_id"].nunique()
    unique_surveys = combined["survey_id"].nunique()
    unique_countries = combined["country"].nunique()

    print("\n--- Data Integrity Check ---")
    print(f"Unique sites in this dataset:    {unique_sites}")
    print(f"Unique surveys in this dataset:  {unique_surveys}")
    print(f"Unique countries in this dataset: {unique_countries}")
    print(
        f"Countries present: {sorted(combined['country'].dropna().unique().tolist())}"
    )
    print(f"\nOfficial NOAA published figures (cumulative since 2012):")
    print(
        f"  {NOAA_PUBLISHED_SURVEYS} surveys, {NOAA_PUBLISHED_SITES} sites, "
        f"{NOAA_PUBLISHED_COUNTRIES} countries"
    )
    print(
        "\nNote: this project's totals exceed the commonly cited NOAA figure "
        "above. That published figure could not be confirmed as currently "
        "dated, and MDMAP is described by NOAA as an actively growing "
        "database, making a larger live snapshot plausible. This dataset "
        "should be treated as a real, internally consistent extract of the "
        "live MDMAP database, rather than validated against a precisely "
        "matching official total."
    )
    print("-----------------------------\n")


def filter_to_mdmap2_protocol(combined: pd.DataFrame) -> pd.DataFrame:
    """Filters data to MDMAP 2.0 Protocol rows to ensure standardized transect dimensions."""
    print("Protocol breakdown before filtering:")
    print(combined["survey_protocol"].value_counts())

    mdmap2 = combined[combined["survey_protocol"] == "MDMAP 2.0 Protocol"].copy()
    print(f"\nRows using MDMAP 2.0 Protocol: {mdmap2.shape}")
    print(f"Unique surveys under this protocol: {mdmap2['survey_id'].nunique()}")
    print(f"Unique sites under this protocol: {mdmap2['shoreline_site_id'].nunique()}")
    return mdmap2


def aggregate_to_survey_level(mdmap2: pd.DataFrame) -> pd.DataFrame:
    """Collapses transect-level entries into single survey-level records."""
    mdmap2 = mdmap2.copy()
    mdmap2["has_photo"] = mdmap2["survey_photos"].notna()

    survey_level = (
        mdmap2.groupby("survey_id")
        .agg(
            {
                "shoreline_site_id": "first",
                "shoreline_site_name": "first",
                "survey_date": "first",
                "country": "first",
                "state_province_territory": "first",
                "city_county": "first",
                "site_waters_edge_left_lat": "first",
                "site_waters_edge_left_lon": "first",
                "total_debris_items": "sum",
                "total_plastic_items": "sum",
                "total_metal_items": "sum",
                "total_glass_items": "sum",
                "total_rubber_items": "sum",
                "total_processed-lumber_items": "sum",
                "total_cloth-fabric_items": "sum",
                "total_other_items": "sum",
                "has_photo": "max",
            }
        )
        .reset_index()
    )

    print("Survey-level rows:", survey_level.shape)
    print("Surveys with a reported photo:", survey_level["has_photo"].sum())
    return survey_level


def derive_category(survey_level: pd.DataFrame) -> pd.DataFrame:
    """Assign each survey a single dominant debris category (by material type total)."""
    material_cols = [
        "total_plastic_items",
        "total_metal_items",
        "total_glass_items",
        "total_rubber_items",
        "total_processed-lumber_items",
        "total_cloth-fabric_items",
        "total_other_items",
    ]
    survey_level = survey_level.copy()
    survey_level["category"] = (
        survey_level[material_cols]
        .idxmax(axis=1)
        .str.replace("total_", "")
        .str.replace("_items", "")
    )
    print(survey_level["category"].value_counts())
    return survey_level


def derive_severity(survey_level: pd.DataFrame) -> pd.DataFrame:
    """Buckets total debris counts into low, medium, or high severity using dataset quantiles."""
    survey_level = survey_level.copy()
    q1, q2 = survey_level["total_debris_items"].quantile([0.33, 0.66])

    def bucket_severity(count):
        if count <= q1:
            return "low"
        elif count <= q2:
            return "medium"
        return "high"

    survey_level["severity"] = survey_level["total_debris_items"].apply(bucket_severity)
    print(survey_level["severity"].value_counts())
    return survey_level


def build_photo_urls(survey_level: pd.DataFrame) -> pd.DataFrame:
    """Constructs public NOAA photo URLs using survey_id keys where photos are present."""
    survey_level = survey_level.copy()
    survey_level["photo_url"] = survey_level.apply(
        lambda row: (
            f"https://portal.diver.orr.noaa.gov/pentaho/mdmap/photo-files/{int(row['survey_id'])}"
            if row["has_photo"]
            else None
        ),
        axis=1,
    )
    return survey_level


def build_seed_reports(survey_level: pd.DataFrame) -> pd.DataFrame:
    """Formats survey records into the DebrisReports DynamoDB seed schema."""
    seed_reports = pd.DataFrame(
        {
            "report_id": "seed_" + survey_level["survey_id"].astype(str),
            "lat": survey_level["site_waters_edge_left_lat"],
            "lon": survey_level["site_waters_edge_left_lon"],
            "category": survey_level["category"],
            "severity": survey_level["severity"],
            "photo_url": survey_level["photo_url"],
            "timestamp": survey_level["survey_date"],
            "weather_snapshot": None,  # not available historically; populated live for real user reports
            "user_id": "noaa_seed_data",  # fixed system placeholder, not a real registered user
            "site_name": survey_level["shoreline_site_name"],
            "total_debris_items": survey_level["total_debris_items"],
        }
    )
    seed_reports = seed_reports.dropna(subset=["lat", "lon"])
    print("Final seed reports:", seed_reports.shape)
    print("Reports with a real photo URL:", seed_reports["photo_url"].notna().sum())
    return seed_reports


def main():
    combined = load_and_combine_raw_files()
    combined = deduplicate(combined)
    verify_data_integrity(combined)

    mdmap2 = filter_to_mdmap2_protocol(combined)
    survey_level = aggregate_to_survey_level(mdmap2)
    survey_level = derive_category(survey_level)
    survey_level = derive_severity(survey_level)
    survey_level = build_photo_urls(survey_level)

    seed_reports = build_seed_reports(survey_level)

    seed_reports.to_csv(OUTPUT_PATH, index=False)
    print(f"\nSaved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
