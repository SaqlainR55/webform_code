// server.js
const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { DateTime } = require("luxon");

// ── OpenAI Client ─────────────────────────────────────────────────────────────
// Replace these two lines:
// const { Configuration, OpenAIApi } = require("openai");
// const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

// With this:
dotenv.config();
console.log("Loaded OPENAI_API_KEY:", !!process.env.OPENAI_API_KEY); // should print 'true'
// ───────────────────────────────────────────────────────────────────────────────

// ── OpenAI Client ─────────────────────────────────────────────────────────────
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ───────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const auth = new google.auth.GoogleAuth({
  keyFile: "/etc/secrets/Credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// ── Sheet Header Definitions ───────────────────────────────────────────────────
const headerMap = {
  "General Information": [
    "Timestamp",
    "First Name",
    "Last Name",
    "Phone",
    "Email",
    "Subject",
    "Message",
    "Lease Related"            // ← NEW column
  ],
  "Dry Storage Application": [
    "Timestamp",
    "First Name",
    "Last Name",
    "Phone",
    "Email",
    "Boat Length In Feet - LOA",
    "Height",
    "Beam",
    "Manufacturer",
    "Model",
    "Year",
    "How Did You Learn About F3 Marina Fort Lauderdale?",
    "Lease Related"
  ]
};

const aliasMap = {
  "Boat Length In Feet - LOA": "LOA",
  "How Did You Learn About F3 Marina Fort Lauderdale?": "Referral Source"
};
// ───────────────────────────────────────────────────────────────────────────────

app.post("/submit", async (req, res) => {
  const { tab, data } = req.body;
  if (!tab || !data) return res.status(400).send("Missing tab or data");

  try {
    // 1) Fetch Google Sheets client
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    // 2) If General Information, run OpenAI to classify lease-related
    let leaseRelatedAnswer = "No";
    if (tab === "General Information") {
      const userMsg = data["Message"] || "";
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an assistant that tags inquiries as leasing-related or not.`
          },
          {
            role: "user",
            content: `If the following message contains **any** intent to inquire about boat storage, leasing, slip rental, dry stack storage, or space availability, return:
          
          { "lease_related": "Yes" }
          
          Otherwise return:
          
          { "lease_related": "No" }
          
          Message: "${userMsg}"`
          }
        ]
      });
      const text = completion.choices[0].message.content;
      // parse JSON safely
      try {
        leaseRelatedAnswer = JSON.parse(text).lease_related || "No";
      } catch {
        leaseRelatedAnswer = /Yes/i.test(text) ? "Yes" : "No";
      }
    }

    // 3) Build the row array
    const headers = headerMap[tab];
    if (!headers) return res.status(400).send("Unknown tab");

    const row = headers.map(header => {
      if (header === "Timestamp") {
        return DateTime.now().setZone("America/New_York").toISO();
      }
      if (header === "First Name" && tab === "General Information") {
        return data["Name"]?.split(" ")[0] || "";
      }
      if (header === "Last Name" && tab === "General Information") {
        return data["Name"]?.split(" ").slice(1).join(" ") || "";
      }
      if (header === "Lease Related") {
        return leaseRelatedAnswer;
      }
      const key = aliasMap[header] || header;
      return data[key] ?? "";
    });

    // 4) Append to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[ "", ...row ]] }
    });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Internal Server Error");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
