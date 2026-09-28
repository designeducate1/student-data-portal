// ============================================================
// STUDENT APP -- TEMPLATE SCRIPT
// ============================================================
// This is a clean, from-scratch copy of the backend that powers one
// teacher's Student Data Portal. It is meant to be reused: each teacher
// who wants their own class running gets their OWN Sheet + their OWN
// deployment of this exact script, with their OWN two secret keys below.
// Nobody shares a Sheet, a script, or a key with anyone else -- that
// isolation is what keeps one teacher's students' data separate from
// another's, even though everyone is running an identical script.
//
// SETUP (do this once per teacher):
//   1. Make your own copy of the companion Google Sheet (see the tab
//      layout at the bottom of this file) -- File > Make a copy.
//   2. In YOUR copied Sheet: Extensions > Apps Script, delete whatever's
//      there, and paste this entire file in.
//   3. Fill in the four placeholders directly below -- your Sheet's ID,
//      two invented random strings (keep them different from each
//      other, and different from any other teacher's), and your own
//      alert email.
//   4. Deploy > New deployment > type "Web app" > Execute as: Me >
//      Who has access: Anyone. Copy the resulting URL ending in /exec.
//   5. That URL plus your two keys are what get entered into the app's
//      own configuration for your class -- a separate step, once you're
//      ready to connect it.
// ============================================================

const SHEET_ID = "PASTE_YOUR_COPIED_SHEETS_ID_HERE"; // from your Sheet's URL, between /d/ and /edit
const LOGIN_KEY = "INVENT_A_RANDOM_STRING_HERE"; // gates login, student data fetch, and notes saving
const ENQUIRY_KEY = "INVENT_A_DIFFERENT_RANDOM_STRING_HERE"; // gates the enquiry form only
const ALERT_EMAIL = "your.email@example.com"; // enquiry notifications land here
const SOURCE_DEFAULT = "Student App";

const SHEET_NAME_STUDENTS = "Neuro";
const SHEET_NAME_ENQUIRIES = "email";

// Which column (1-indexed, e.g. F = 6) holds the Notes/CalendarWalk data
// on the Students tab. Update this ONE number if you add, remove, or
// reorder columns before it -- everything else in this file reads from
// this constant rather than a hard-coded position.
const NOTES_COLUMN = 6;

// ----------------------------------------------------
// MAIN GET ROUTER (Student Data)
// ----------------------------------------------------
function doGet(e) {
  return handleStudentDataFetch(e);
}

// ----------------------------------------------------
// MAIN POST ROUTER (Notes Update + Enquiry Form)
// ----------------------------------------------------
function doPost(e) {
  const data = parseRequest(e);

  if (data.action === "UPDATE_NOTES") {
    return handleNotesUpdate(data);
  }

  return handleEnquirySubmission(data);
}

// ----------------------------------------------------
// 1. STUDENT DATA FETCHER
// ----------------------------------------------------
// Reads every column of the Students tab and hands it back as one object
// per row. Whatever you name a column becomes a pill/label in the app
// automatically -- add, rename or remove columns freely. Two positions
// are structural and must stay put: a column whose header contains the
// word "password" (used for login), and column M (the 13th column),
// which is reserved for the app's own Notes/CalendarWalk data -- don't
// repurpose column M for anything else.
function handleStudentDataFetch(e) {
  try {
    const requestedStudentId = (e && e.parameter && e.parameter.studentId)
      ? e.parameter.studentId.toString().toLowerCase().trim()
      : null;
    const providedKey = (e && e.parameter && e.parameter.key) ? e.parameter.key : "";

    if (providedKey !== LOGIN_KEY) {
      return jsonResponse({ error: "Unauthorized: Invalid API Key" });
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME_STUDENTS) || ss.getActiveSheet();
    const rawData = sheet.getDataRange().getValues();

    if (rawData.length < 2) {
      return jsonResponse([]);
    }

    const headers = rawData[0];
    const rows = rawData.slice(1);
    let formattedData = [];

    for (let i = 0; i < rows.length; i++) {
      let rowObject = {};
      let matchesStudent = false;

      for (let j = 0; j < headers.length; j++) {
        let cellValue = rows[i][j];
        let heading = headers[j] ? headers[j].toString().trim() : ("Column_" + String.fromCharCode(65 + j));

        rowObject[heading] = cellValue;

        if (requestedStudentId && cellValue != null && cellValue.toString().toLowerCase().trim() === requestedStudentId) {
          matchesStudent = true;
        }
      }

      // NOTES_COLUMN is always exposed as "Notes" regardless of what
      // header row 1 has there, so the app can rely on it.
      if (rows[i].length >= NOTES_COLUMN && rows[i][NOTES_COLUMN - 1]) {
        rowObject["Notes"] = rows[i][NOTES_COLUMN - 1];
        rowObject["Column M"] = rows[i][NOTES_COLUMN - 1];
      }

      if (!requestedStudentId || matchesStudent) {
        formattedData.push(rowObject);
      }
    }

    return jsonResponse(formattedData);
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

// ----------------------------------------------------
// 2. NOTES UPDATE HANDLER (writes into Column M)
// ----------------------------------------------------
function handleNotesUpdate(data) {
  try {
    const studentId = String(data.studentId || "").trim().toLowerCase();
    const notesJson = typeof data.notes === "string" ? data.notes : JSON.stringify(data.notes || {});

    if (!studentId) {
      return jsonResponse({ ok: false, error: "Missing student ID" });
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME_STUDENTS) || ss.getActiveSheet();
    const rawData = sheet.getDataRange().getValues();

    let updated = false;
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      let isMatch = false;

      for (let c = 0; c < Math.min(row.length, 3); c++) {
        if (String(row[c]).trim().toLowerCase() === studentId) {
          isMatch = true;
          break;
        }
      }

      if (isMatch) {
        sheet.getRange(i + 1, NOTES_COLUMN).setValue(notesJson);
        updated = true;
        break;
      }
    }

    return jsonResponse({ ok: true, updated: updated });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

// ----------------------------------------------------
// 3. ENQUIRY SUBMISSION HANDLER (Enquiries tab + email alert)
// ----------------------------------------------------
function handleEnquirySubmission(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse({ ok: false, error: "System busy, please try again." });
  }

  try {
    const key = trim(data.key);
    if (key !== ENQUIRY_KEY && key !== LOGIN_KEY) {
      return jsonResponse({ ok: false, error: "Invalid key." });
    }

    const name = trim(data.name);
    const email = trim(data.email);
    const phone = trim(data.phone);
    const message = trim(data.message);
    const source = trim(data.source) || SOURCE_DEFAULT;

    if (!name && !email && !phone && !message) {
      return jsonResponse({ ok: false, error: "Empty submission." });
    }
    if (!name) {
      return jsonResponse({ ok: false, error: "Name is required." });
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME_ENQUIRIES);
    if (!sheet) {
      return jsonResponse({ ok: false, error: "Enquiries tab missing -- check SHEET_NAME_ENQUIRIES matches your tab name exactly." });
    }

    const timestamp = new Date();
    sheet.appendRow([timestamp, name, email, phone, message, source]);

    const lastRow = sheet.getLastRow();
    const cellC = sheet.getRange(lastRow, 3);
    const valC = String(cellC.getValue() || "").trim();
    if (valC.startsWith("http://") || valC.startsWith("https://")) {
      cellC.setFormula(`=HYPERLINK("${valC}", "${valC}")`);
    }

    const subject = `New Student Enquiry - ${name}`;
    const emailBody =
      "New Enquiry from Student App:\n\n" +
      "Time: " + timestamp + "\n" +
      "Name: " + name + "\n" +
      "Email: " + email + "\n" +
      "Phone: " + phone + "\n" +
      "Source: " + source + "\n\n" +
      "Message:\n" + message;

    // Always goes to the class's own ALERT_EMAIL, never to the student's
    // submitted address -- this is a staff-notification form, not an
    // auto-reply. Staff see the student's email above and reply manually.
    MailApp.sendEmail(ALERT_EMAIL, subject, emailBody);

    return jsonResponse({ ok: true, message: "Success" });
  } catch (err) {
    return jsonResponse({ ok: false, error: "Server error.", detail: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------
// UTILITIES
// ----------------------------------------------------
function parseRequest(e) {
  let data = {};
  if (e && e.postData && e.postData.contents) {
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      data = e.parameter || {};
    }
  } else {
    data = e && e.parameter ? e.parameter : {};
  }
  return data || {};
}

function trim(value) {
  return String(value || "").trim();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// COMPANION SHEET LAYOUT -- build this in your copied Sheet
// ============================================================
// Tab 1: "Neuro"  (student data + preferences + login)
//   Column A: Student number       (whatever value students type to log in)
//   Column B: Student name
//   Column C: Headlines            (example -- rename/add freely; anything
//                                    with a trailing * is hidden from the
//                                    app's chat pills, e.g. for grades/
//                                    feedback that shouldn't be shown there)
//   Column D: Attendance           (example -- rename/add freely)
//   Column E: Password             (header just needs the word "password" in it --
//                                    can live in any column, position doesn't matter)
//   Column F: Student notes -- reserved; leave blank or call it "Notes",
//             the app writes the CalendarWalk data here itself. Whichever
//             column this ends up in, set NOTES_COLUMN above to match.
//
//   Deliberately NOT included here: grades, feedback, module handbooks/
//   briefs, deadlines -- these came from Google Classroom instead (see
//   the app's own Classroom integration) rather than being duplicated
//   and hand-maintained in this sheet.
//
// Tab 2: "email"  (enquiry log -- name must match SHEET_NAME_ENQUIRIES above)
//   Column A: Time
//   Column B: Name
//   Column C: Email
//   Column D: Phone
//   Column E: Message
//   Column F: Source
// ============================================================
