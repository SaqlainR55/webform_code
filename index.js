const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// 🔽 Serve static HTML
app.use(express.static(path.join(__dirname, 'public')));

const auth = new google.auth.GoogleAuth({
  keyFile: "/etc/secrets/Credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

app.post("/submit", async (req, res) => {
  const { tab, data } = req.body;
  if (!tab || !data) return res.status(400).send("Missing tab or data");

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  // Define header mappings manually
  const headerMap = {
    "General Information": [
      "Timestamp",
      "First Name",
      "Last Name",
      "Phone",
      "Email",
      "Subject",
      "Message"
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
      "How Did You Learn About F3 Marina Fort Lauderdale?"
    ]
  };

  try {
    const headers = headerMap[tab];
    if (!headers) return res.status(400).send("Unknown tab");

    const row = headers.map(header => {
      if (header === "Timestamp") {
        return new Date().toLocaleString();
      }

      if (header === "First Name" && tab === "General Information") {
        return data["Name"]?.split(" ")[0] || "";
      }

      if (header === "Last Name" && tab === "General Information") {
        return data["Name"]?.split(" ").slice(1).join(" ") || "";
      }

      return data[header] || "";
    });

    const values = [[ "", ...row ]]; // Shift right (start from column B)

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${tab}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });

    res.status(200).send({ success: true });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).send("Internal Server Error");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));