import {
  FluxTableMetaData,
  InfluxDB,
  Point,
} from "@influxdata/influxdb-client";
import {
  DeleteAPI,
  DeletePredicateRequest,
} from "@influxdata/influxdb-client-apis";
import axios from "axios";
import * as qs from "qs";
import * as dotenv from "dotenv";
import * as process from "node:process";

// Load environment variables from .env file
dotenv.config();

// Get env vars
const {
  INFLUXDB_URL,
  INFLUXDB_TOKEN,
  INFLUXDB_ORG,
  INFLUXDB_BUCKET,
  NIGHTSCOUT_URL,
  NIGHTSCOUT_TOKEN,
} = process.env;

// Check if required env vars are set
if (
  !INFLUXDB_URL ||
  !INFLUXDB_TOKEN ||
  !INFLUXDB_ORG ||
  !INFLUXDB_BUCKET ||
  !NIGHTSCOUT_URL ||
  !NIGHTSCOUT_TOKEN
) {
  console.error(
    "To get started, copy the .env.example file to .env, and fill in the required values.",
  );
  process.exit(1);
}

// Create InfluxDB client
const influxDB = new InfluxDB({ url: INFLUXDB_URL, token: INFLUXDB_TOKEN });

/**
 * Exchange a Nightscout token for a JWT token
 */
async function getJWT(): Promise<string> {
  const url =
    `${NIGHTSCOUT_URL}/api/v2/authorization/request/${NIGHTSCOUT_TOKEN}`;
  const response = await axios.get(url);
  return response.data.token;
}

/**
 * Get the latest timestamp from the InfluxDB database
 * @param __shortRange For internal use: don't change!
 * Uses a short range search if true. This
 * happens when the function is called recursively to retry with a long range.
 */
async function getLatestTimestamp(
  { __shortRange } = { __shortRange: true },
): Promise<number> {
  const queryApi = influxDB.getQueryApi(INFLUXDB_ORG);
  const range = __shortRange ? "-30d" : "-100y";
  const fluxQuery = `
    from(bucket: "${INFLUXDB_BUCKET}")
      |> range(start: ${range})
      |> filter(fn: (r) => r._measurement == "glucose")
      |> keep(columns: ["_time"])
      |> sort(columns: ["_time"], desc: true)
      |> limit(n:1)
  `;

  return new Promise<number>((resolve, reject) => {
    let latestTime: number | null = null;

    queryApi.queryRows(fluxQuery, {
      next(row, tableMeta: FluxTableMetaData) {
        const o = tableMeta.toObject(row);
        latestTime = new Date(o._time).getTime();
      },
      error(error) {
        console.error("Error querying InfluxDB:", error);
        reject(error);
      },
      complete() {
        if (latestTime !== null) {
          // Last timestamp found, resolve
          resolve(latestTime);
        } else if (__shortRange) {
          // Try again with long range search
          resolve(getLatestTimestamp({ __shortRange: false }));
        } else {
          // If no data, return 0 to fetch all data
          resolve(0);
        }
      },
    });
  });
}

/**
 * Fetch Nightscout entries since a given timestamp
 * @param opts Options object containing since, to, and limit
 */
async function fetchNightscoutEntries(opts: {
  since: number;
  to?: number;
  limit?: number;
}): Promise<NightscoutEntry[]> {
  const { since, to, limit = 100 } = opts;

  // Nightscout expects dates in milliseconds
  const params: any = {
    limit,
    date$gte: since,
    sort: "date",
  };

  if (to) {
    params.date$lte = to;
  }

  const url = `${NIGHTSCOUT_URL}/api/v3/entries.json`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${await getJWT()}`,
      },
      params,
      paramsSerializer: (params) => qs.stringify(params, { encode: false }),
    });
    return response.data.result;
  } catch (error: any) {
    const m = JSON.stringify(error.response.data);
    console.error("Error fetching Nightscout entries:", m);
    throw error;
  }
}

/**
 * Write Nightscout entries to InfluxDB
 * @param entries Array of Nightscout entries
 */
async function writeEntriesToInflux(entries: NightscoutEntry[]) {
  const writeApi = influxDB.getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET);

  for (const entry of entries) {
    // skip if sgv is null
    if (!entry.sgv) continue;
    const point = new Point("glucose")
      // .tag('device', entry.device) // Uncomment and modify to add tags if needed
      .intField("sgv", entry.sgv)
      .timestamp(new Date(entry.date));

    writeApi.writePoint(point);
  }

  try {
    await writeApi.close();
    console.log("Data successfully written to InfluxDB.");
  } catch (error: any) {
    console.error("Error writing data to InfluxDB:", error.message);
    throw error;
  }
}

/**
 * Utility function that deletes all data from the 'nightscout'
 * measurement in InfluxDB. Not used in the main function.
 * Use with caution!
 */
async function deleteAllNightscoutDataFromInfluxDB() {
  const deleteAPI = new DeleteAPI(influxDB);
  // Define the time range (from earliest possible time to now)
  const start = "1970-01-01T00:00:00Z";
  const stop = new Date().toISOString();

  // Define the predicate to match the 'nightscout' measurement
  const predicate = '_measurement="glucose"';

  // Create the delete request
  const request: DeletePredicateRequest = {
    start: start,
    stop: stop,
    predicate: predicate,
  };

  try {
    await deleteAPI.postDelete({
      org: INFLUXDB_ORG,
      bucket: INFLUXDB_BUCKET,
      body: request,
    });
    console.log('All data from the "nightscout" measurement has been deleted.');
  } catch (error: any) {
    console.error("Error deleting data from InfluxDB:", error.message);
    throw error;
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  let fromDate: Date | null = null;
  let toDate: Date | null = null;

  args.forEach((arg, index) => {
    if (arg === "--from" && args[index + 1]) {
      fromDate = new Date(args[index + 1]);
      if (isNaN(fromDate.getTime())) {
        console.error(
          "Invalid --from date. Example: --from 2023-01-01T00:00:00Z",
        );
        process.exit(1);
      }
    }
    if (arg === "--to" && args[index + 1]) {
      toDate = new Date(args[index + 1]);
      if (isNaN(toDate.getTime())) {
        console.error("Invalid --to date. Example: --to 2023-12-31T23:59:59Z");
        process.exit(1);
      }
    }
  });

  console.log("From date:", fromDate ? fromDate.toISOString() : "not provided");
  console.log("To date:", toDate ? toDate.toISOString() : "not provided");

  let moreEntriesAvailable = true;
  try {
    while (moreEntriesAvailable) {
      const latestTimestamp = fromDate
        ? fromDate.getTime()
        : await getLatestTimestamp();

      console.log(
        "Fetching Nightscout entries since: ",
        new Date(latestTimestamp).toISOString(),
      );
      const entries = await fetchNightscoutEntries({
        since: latestTimestamp,
        to: toDate?.getTime(),
        limit: 1000,
      });

      if (entries.length > 0) {
        await writeEntriesToInflux(entries);
      } else {
        console.log("No new entries found. Exiting");
        moreEntriesAvailable = false;
      }
    }
  } catch (error: any) {
    console.error("An error occurred:", error.message);
  }
}

main();

type NightscoutEntry = {
  sgv: number;
  date: number;
  dateString: string;
  // There's more, but we only need these fields
};