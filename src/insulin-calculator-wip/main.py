# Re-import necessary libraries after code execution state reset
import pandas as pd
import json

# Reload the profile and treatments data
profile_path = 'data/profile.json'
treatments_path = 'data/treatments.json'

with open(profile_path, 'r') as profile_file:
    profile_data = json.load(profile_file)

with open(treatments_path, 'r') as treatments_file:
    extended_treatments_data = json.load(treatments_file)


def calculate_daily_insulin_fixed(profile, treatments, day):
    """
    Calculate total basal and bolus insulin with fixes for default basal rate calculation
    and handling multiple adjustments per hour.
    """
    # Extract timezone offset from the profile
    # Convert from minutes to seconds
    timezone_offset_seconds = profile[0].get('utcOffset', 0) * 60

    # Parse the day into local time start and end
    local_day_start = pd.Timestamp(
        f"{day} 00:00:00") - pd.Timedelta(seconds=timezone_offset_seconds)
    local_day_end = local_day_start + pd.Timedelta(days=1)

    # Convert local start and end to UTC (milliseconds)
    utc_start = int(local_day_start.timestamp() * 1000)
    utc_end = int(local_day_end.timestamp() * 1000)

    # Filter relevant treatments within the UTC timeframe
    relevant_treatments = [
        t for t in treatments
        if 'date' in t and '$numberLong' in t['date']
        and utc_start <= int(t['date']['$numberLong']) < utc_end
    ]

    if not relevant_treatments:
        print(f"No relevant treatments found for {day}")
        return 0, 0

    # Adjust basal schedule to UTC and ensure full 24-hour coverage
    basal_schedule = profile[0]['store']['NR Profil']['basal']
    adjusted_basal_schedule = [
        {
            'timeAsSeconds': (entry['timeAsSeconds'] - timezone_offset_seconds + 86400) % 86400,
            'value': entry['value']
        }
        for entry in basal_schedule
    ]

    # Add missing entries for midnight and end of day
    adjusted_basal_schedule.append(
        {'timeAsSeconds': 0, 'value': adjusted_basal_schedule[-1]['value']})  # Midnight wrap-around

    # Sort and validate the schedule
    adjusted_basal_schedule = sorted(
        adjusted_basal_schedule, key=lambda x: x['timeAsSeconds'])

    # Print adjusted basal schedule
    print("Adjusted Basal Schedule (UTC):")
    for i, entry in enumerate(adjusted_basal_schedule):
        start_hour = entry['timeAsSeconds'] // 3600
        end_hour = (
            adjusted_basal_schedule[i + 1]['timeAsSeconds'] // 3600 - 1
            if i + 1 < len(adjusted_basal_schedule) else 23
        )
        print(f"{start_hour:02}:00 -> {end_hour:02}:59: {entry['value']} U/hr")

    # Initialize totals
    total_basal_insulin = 0
    total_bolus_insulin = 0
    hourly_basal_delivery = [0] * 24

    # Calculate default basal rates per hour
    for hour in range(24):
        start_time = hour * 3600
        for entry in reversed(adjusted_basal_schedule):
            if entry['timeAsSeconds'] <= start_time:
                hourly_basal_delivery[hour] = entry['value']
                break

    # Print array of hourly basal rates
    print("Hourly Basal Rates:", hourly_basal_delivery)

    # Process treatments
    bolus_list = []
    for treatment in relevant_treatments:
        duration_ms = treatment.get('durationInMilliseconds', 0)
        bolus_insulin = treatment.get('insulin', 0)
        basal_rate = treatment.get('rate', -1)
        time_seconds = (
            int(treatment['date']['$numberLong']) // 1000 + timezone_offset_seconds) % 86400
        hour = time_seconds // 3600

        if basal_rate >= 0:
            for entry in reversed(adjusted_basal_schedule):
                if entry['timeAsSeconds'] <= time_seconds:
                    default_rate = entry['value']
                    break
            insulin_adjustment = (basal_rate - default_rate) * \
                (duration_ms / 3600000)
            hourly_basal_delivery[hour] += insulin_adjustment
        elif bolus_insulin > 0:
            total_bolus_insulin += bolus_insulin
            bolus_list.append(bolus_insulin)

    # Sum basal insulin
    total_basal_insulin = sum(hourly_basal_delivery)

    # Print results
    print("Hourly Basal Delivery:", hourly_basal_delivery)
    print("Bolus Events:", bolus_list)
    print(f"Total Bolus Insulin: {total_bolus_insulin:.2f} U")
    print(f"Basal Insulin: {total_basal_insulin:.2f} U")
    print(
        f"Total Daily Insulin (TDD): {total_basal_insulin + total_bolus_insulin:.2f} U")

    return total_basal_insulin, total_basal_insulin + total_bolus_insulin


# Run the fixed calculation for 2024-12-12
calculate_daily_insulin_fixed(
    profile_data, extended_treatments_data, "2024-12-12")
