const express = require("express");
const fs = require("fs");
const { Pool } = require("pg");
require("dotenv").config();
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

app.use((req, res, next) => {
  //allow access from every, elminate CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.removeHeader("x-powered-by");
  //set the allowed HTTP methods to be requested
  res.setHeader("Access-Control-Allow-Methods", "POST");
  //headers clients can use in their requests
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  //allow request to continue and be handled by routes
  next();
});

// Parse JSON and URL-encoded bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Increase the request body size limit (e.g., 10MB)
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

// PostgreSQL connection URL from environment variable
const connectionString = process.env.DATABASE_URL;

// PostgreSQL connection configuration
const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test the database connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error("Error acquiring client", err.stack);
  }
  client.query("SELECT NOW()", (err, result) => {
    release();
    if (err) {
      return console.error("Error executing query", err.stack);
    }
    console.log("Connected to the database:", result.rows);
  });
});

// Define a route
app.get("/", (req, res) => {
  res.send("Hello, World!");
});

// Add a route to get all tables from the database
app.get("/tables", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    client.release();
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving tables");
  }
});

app.post("/table", async (req, res) => {
  const { tableName } = req.body;

  if (!tableName) {
    return res.send({ message: "Table name is required" });
  }

  try {
    const client = await pool.connect();
    const result = await client.query(`SELECT * FROM ${tableName}`);
    client.release();
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving tables");
  }
});

app.post("/create_table", async (req, res) => {
  const { tableName } = req.body;

  if (!tableName) {
    return res.send({ message: "Table name is required" });
  }

  // Construct the CREATE TABLE query
  // const createTableQuery = `
  //     CREATE TABLE ${tableName} (
  //       title TEXT,
  //       data TEXT[]
  //     );
  // `;

  const createTableQuery = `
    CREATE TABLE ${tableName} (
      question TEXT,
      answer TEXT
    );`;

  try {
    const client = await pool.connect();
    await client.query(createTableQuery);
    client.release();
    res.send({ message: "Table created successfully" });
  } catch (err) {
    console.error("Error creating table:", err.stack);
    res.status(500).send("Error creating table");
  }
});

app.post("/add_column", async (req, res) => {
  const tableName = req.body.tableName;

  try {
    const { tableName } = req.body;

    if (!tableName) {
      return res.status(400).json({
        message: "Table name is required",
      });
    }

    const addColumnQuery = `
      ALTER TABLE ${tableName}
      ADD COLUMN id DECIMAL;
    `;

    const client = await pool.connect();
    await client.query(addColumnQuery);
    client.release();

    res.json({ message: `Column added successfully` });
  } catch (err) {
    console.error("Error executing query", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Endpoint to drop a table
app.post("/drop_table", async (req, res) => {
  const tableName = req.body.tableName;

  const dropTableQuery = `DROP TABLE IF EXISTS ${tableName};`;

  try {
    const client = await pool.connect();
    await client.query(dropTableQuery);
    client.release();
    res.send({ message: `Table ${tableName} dropped successfully` });
  } catch (err) {
    console.error("Error dropping table:", err.stack);
    res.status(500).send("Error dropping table");
  }
});

// Endpoint to add columns to an existing table
app.post("/add_data", async (req, res) => {
  const { tableName, questions } = req.body;
  console.log(questions);

  if (!tableName || !questions) {
    return res.send({ message: "Table name and titles are required" });
  }

  // Construct the INSERT INTO query
  const insertDataQuery = `
    INSERT INTO answers (question, answer)
    VALUES ($1, $2);
  `;

  try {
    const client = await pool.connect();
    for (let i = 0; i < questions.length; i++) {
      await client.query(insertDataQuery, [questions[i], ""]);
    }
    client.release();
    res.send({ message: "Titles added successfully" });
  } catch (err) {
    console.error("Error adding titles:", err.stack);
    res.status(500).send("Error adding titles");
  }
});

// Clear table
app.get("/truncate_table", async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query(`TRUNCATE TABLE answers`);
    client.release();

    res.json({ message: "Table truncated successfully" });
  } catch (err) {
    console.error("Error executing query", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// update position of the questionnaire
app.post("/update_position", async (req, res) => {
  const { section_no, question_no } = req.body;

  try {
    if (section_no === undefined || question_no === undefined) {
      return res.status(400).json({
        message: "id, section_no, and question_no are required",
      });
    }

    const updateDataQuery = `
      UPDATE position
      SET section_no = $1, question_no = $2
      WHERE id = $3;
    `;

    const client = await pool.connect();
    await client.query(updateDataQuery, [section_no, question_no, 0]);
    client.release();

    res.json({ message: "Data updated successfully" });
  } catch (err) {
    console.error("Error executing query", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/get_answer", async (req, res) => {
  const { question } = req.body;

  try {
    if (question === undefined) {
      return res
        .status(400)
        .json({ message: "question and answer are required" });
    }

    const getAnswerQuery = `
      SELECT * FROM answers WHERE question = $1;
    `;

    const client = await pool.connect();
    const response = await client.query(getAnswerQuery, [question]);
    client.release();

    res.json(response.rows[0]);
  } catch (err) {
    console.error("Error executing query", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/update_answer", async (req, res) => {
  const { question, answer } = req.body;

  try {
    if (question === undefined || answer === undefined) {
      return res
        .status(400)
        .json({ message: "question and answer are required" });
    }

    const updateAnswerQuery = `
      UPDATE answers
      SET answer = $1
      WHERE question = $2;
    `;

    const client = await pool.connect();
    await client.query(updateAnswerQuery, [answer, question]);
    client.release();

    res.json({ message: "Answer updated successfully" });
  } catch (err) {
    console.error("Error executing query", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
