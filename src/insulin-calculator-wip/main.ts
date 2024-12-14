import * as fs from "node:fs";
import * as path from "node:path";

export interface Profile {
  utcOffset: number;
  store: {
    [key: string]: {
      basal: Array<{
        timeAsSeconds: number;
        value: number;
      }>;
    };
  };
}

export interface Treatment {
  date: { $numberLong: string };
  durationInMilliseconds?: number;
  insulin?: number;
  rate?: number;
}

const profilePath = path.join(__dirname, "data", "profile.json");
const treatmentsPath = path.join(__dirname, "data", "treatments.json");

const profileData: Profile[] = JSON.parse(
  fs.readFileSync(profilePath, "utf-8"),
);
const extendedTreatmentsData: Treatment[] = JSON.parse(
  fs.readFileSync(treatmentsPath, "utf-8"),
);

// Function to calculate daily insulin
export function getInsulinTotals(
  profile: Profile[],
  treatments: Treatment[],
  day: string,
  logging = false,
): [number, number] {
  // Calculate timezone offset in seconds
  const timezoneOffsetSeconds = profile[0].utcOffset * 60;

  // Convert day to local start and end times
  const localDayStart = new Date(`${day}T00:00:00Z`);
  localDayStart.setSeconds(localDayStart.getSeconds() - timezoneOffsetSeconds);
  const localDayEnd = new Date(localDayStart);
  localDayEnd.setDate(localDayEnd.getDate() + 1);

  const utcStart = localDayStart.getTime();
  const utcEnd = localDayEnd.getTime();

  // Filter treatments relevant to the specified day
  const relevantTreatments = treatments.filter((t) =>
    "date" in t && "$numberLong" in t.date &&
    utcStart <= parseInt(t.date.$numberLong) &&
    parseInt(t.date.$numberLong) < utcEnd
  );

  if (!relevantTreatments.length) {
    if (logging) {
      console.log(`No relevant treatments found for ${day}`);
    }
    return [0, 0];
  }

  // Adjust basal schedule times for timezone
  const basalSchedule = profile[0].store["NR Profil"].basal;
  const adjustedBasalSchedule = basalSchedule.map((entry) => ({
    timeAsSeconds: (entry.timeAsSeconds - timezoneOffsetSeconds + 86400) %
      86400,
    value: entry.value,
  }));

  adjustedBasalSchedule.push({
    timeAsSeconds: 0,
    value: adjustedBasalSchedule[adjustedBasalSchedule.length - 1].value,
  });

  // Sort the adjusted basal schedule by time
  adjustedBasalSchedule.sort((a, b) => a.timeAsSeconds - b.timeAsSeconds);

  if (logging) {
    console.log("Adjusted Basal Schedule (UTC):");
    adjustedBasalSchedule.forEach((entry, i) => {
      const startHour = Math.floor(entry.timeAsSeconds / 3600);
      const endHour = i + 1 < adjustedBasalSchedule.length
        ? Math.floor(adjustedBasalSchedule[i + 1].timeAsSeconds / 3600) - 1
        : 23;
      console.log(
        `${startHour.toString().padStart(2, "0")}:00 -> ${
          endHour.toString().padStart(2, "0")
        }:59: ${entry.value} U/hr`,
      );
    });
  }

  let totalBasalInsulin = 0;
  let totalBolusInsulin = 0;
  const hourlyBasalDelivery = new Array(24).fill(0);

  // Calculate hourly basal delivery rates
  for (let hour = 0; hour < 24; hour++) {
    const startTime = hour * 3600;
    for (const entry of adjustedBasalSchedule.slice().reverse()) {
      if (entry.timeAsSeconds <= startTime) {
        hourlyBasalDelivery[hour] = entry.value;
        break;
      }
    }
  }

  if (logging) {
    console.log("Hourly Basal Rates:", hourlyBasalDelivery);
  }

  const bolusList: number[] = [];
  for (const treatment of relevantTreatments) {
    const durationMs = treatment.durationInMilliseconds || 0;
    const bolusInsulin = treatment.insulin || 0;
    const basalRate = treatment.rate || -1;
    const timeSeconds =
      (parseInt(treatment.date.$numberLong) / 1000 + timezoneOffsetSeconds) %
      86400;
    const hour = Math.floor(timeSeconds / 3600);

    if (basalRate >= 0) {
      let defaultRate = 0;
      for (const entry of adjustedBasalSchedule.slice().reverse()) {
        if (entry.timeAsSeconds <= timeSeconds) {
          defaultRate = entry.value;
          break;
        }
      }
      const insulinAdjustment = (basalRate - defaultRate) *
        (durationMs / 3600000);
      hourlyBasalDelivery[hour] += insulinAdjustment;
    } else if (bolusInsulin > 0) {
      totalBolusInsulin += bolusInsulin;
      bolusList.push(bolusInsulin);
    }
  }

  totalBasalInsulin = hourlyBasalDelivery.reduce((sum, rate) => sum + rate, 0);

  if (logging) {
    console.log("Hourly Basal Delivery:", hourlyBasalDelivery);
    console.log("Bolus Events:", bolusList);
    console.log(`Total Bolus Insulin: ${totalBolusInsulin.toFixed(2)} U`);
    console.log(`Basal Insulin: ${totalBasalInsulin.toFixed(2)} U`);
    console.log(
      `Total Daily Insulin (TDD): ${
        (totalBasalInsulin + totalBolusInsulin).toFixed(2)
      } U`,
    );
  }

  return [totalBasalInsulin, totalBolusInsulin];
}

// Calculate daily insulin for a specific date
getInsulinTotals(profileData, extendedTreatmentsData, "2024-12-12");
