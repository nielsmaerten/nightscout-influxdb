import { MongoClient } from "mongodb";
import * as fs from "node:fs/promises";
import * as process from "node:process";

interface Treatment {
  eventType: string;
  [key: string]: any;
}

async function fetchTreatmentSamples(mongoUrl: string, dbName: string) {
  const client = new MongoClient(mongoUrl);
  const samples: { [key: string]: Treatment[] } = {};

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);
    const treatments = db.collection<any>("treatments");

    // List of all possible event types
    const eventTypes = [
      "Temp Basal",
      "Correction Bolus",
      "",
      "<none>",
      "<None>",
      "Announcement",
      "BG Check",
      "Bolus Wizard",
      "Carb Correction",
      "Exercise",
      "Insulin Change",
      "Meal Bolus",
      "Note",
      "OpenAPS Offline",
      "Profile Switch",
      "Pump Battery Change",
      "Question",
      "Sensor Change",
      "Sensor Start",
      "Site Change",
      "Temporary Target",
    ];

    // Fetch 3 samples for each event type
    for (const eventType of eventTypes) {
      const query = eventType ? { eventType } : {
        $or: [
          { eventType: "" },
          { eventType: null },
          { eventType: { $exists: false } },
        ],
      };

      const results = await treatments
        .find(query)
        .limit(3)
        .toArray();

      if (results.length > 0) {
        // Use a consistent key for empty/null event types
        const key = eventType || "EMPTY";
        samples[key] = results;
      }
    }

    // Save to file
    const outputPath = "./nightscout_samples.json";
    await fs.writeFile(
      outputPath,
      JSON.stringify(samples, null, 2),
      "utf8",
    );

    console.log(`Samples saved to ${outputPath}`);
    console.log("Summary of samples found:");

    // Log summary
    Object.entries(samples).forEach(([eventType, treatments]) => {
      console.log(`${eventType}: ${treatments.length} samples`);
    });
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    await client.close();
    console.log("Disconnected from MongoDB");
  }
}

// Example usage:
// fetchTreatmentSamples('mongodb://localhost:27017', 'nightscout')
//   .catch(console.error);

(async () => {
  const uri = process.env.MONGO_URI || "";
  const dbname = process.env.MONGO_DB || "";
  await fetchTreatmentSamples(
    uri, dbname,
  );
})();
