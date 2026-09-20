# Contact-Centric Reverse Boolean Search

Standalone console MVP for turning **people the agency already talks to / sells to** into LinkedIn Sales Navigator search hypotheses.

## The idea

The anchor is a known buyer, not merely a company.

You provide:

```text
John Doe | ABC HVAC | Atlanta, GA | https://abchvac.example
```

The program researches the person + company together and produces:

1. **Buyer profile** — current title, function, management level, Sales Navigator seniority.
2. **Company profile** — industry, approximate employee count, LinkedIn headcount band.
3. **Rough revenue range** — clearly labeled as reported vs inferred, with confidence and basis.
4. **Validation search** — an anonymous Sales Navigator search designed to rediscover John **without using John's name or ABC HVAC in the search**.
5. **Expansion search** — a slightly broader version intended to surface lookalike buyers at other companies.
6. If you enter multiple known buyers, **combined buyer archetypes** based on repeated patterns.

The human validation loop is the product hypothesis:

```text
Known buyer
   -> AI reconstructs buyer/company profile
   -> anonymous Sales Navigator search
   -> known buyer appears in results?
       -> YES: inspect surrounding results as lookalike prospects
       -> NO: revise the search/profile
```

## Important distinction: Lead vs Account filters

The program separates:

- **Title Boolean**
- **Keyword Boolean**
- **Lead filters**: company headcount, title/function/seniority, geography, industry, etc.
- **Account filters**: company headcount, industry, headquarters and **annual revenue**.

LinkedIn currently supports company headcount as a Lead filter. Annual Revenue is an Account filter, so the tool does not pretend revenue can be pasted into a Lead Boolean query.

## Setup on macOS

The web app needs Python 3.11+ and Node.js 22+ (Node 24 matches the Docker
configuration). If either is missing, install it with Homebrew:

```bash
brew install python@3.12  # only if Python 3.11+ is missing
brew install node@24     # only if Node 22+ is missing
```

From this project folder, run the web app in two Terminal tabs:

```bash
# Terminal 1
bash start_backend.sh
```

```bash
# Terminal 2
bash start_frontend.sh
```

Open <http://localhost:3000>. The backend launcher creates the project-root
`.env` if missing; add `OPENAI_API_KEY` there and restart the backend before
running research. API docs are at <http://127.0.0.1:8000/docs>.

For the original console app:

```bash
bash run_mac.sh
# Or select a specific input:
bash run_mac.sh --contacts contacts.example.txt
```

With no arguments, the console launcher prefers `contacts_filled.xlsx`, then
`contacts.xlsx`, then interactive entry. Explicit arguments are passed directly
to the console app. Relative input/output paths are resolved from this project
folder. Use `.venv/bin/python` for the direct Python examples below on macOS.

The launchers install dependencies automatically. The frontend uses the exact
pnpm version in `package.json` and the committed lockfile through `npx`; no
global pnpm installation is needed. Initial setup requires internet access.
Stop each server with Ctrl+C.

When moving from Windows, copy source files, `.env`, and any needed data, but
recreate `.venv`, `platform/backend/.venv`, `platform/frontend/node_modules`,
and `platform/frontend/.next` on the Mac. These contain platform-specific files.
Move old environments/build folders aside before launching. Saved web-app runs
live in `platform/backend/data`; preserve that folder if you need your history.
The existing `.bat` files remain available for Windows.

The scripts in `outputs/excel_contact_input` are workbook-generation utilities
that depend on the separate `@oai/artifact-tool` environment. They are not
required to run the app or import the included Excel workbooks.

## Setup on Windows

1. Install Python 3.11+.
2. Unzip this folder.
3. Double-click `run_windows.bat`.
4. The first run creates `.env`.
5. Open `.env` and add:

```text
OPENAI_API_KEY=your_key_here
```

6. Double-click `run_windows.bat` again.

## Excel usage (recommended)

Open `contacts.xlsx`, add one contact per row, save it, and double-click
`run_windows.bat`. The runner automatically imports the workbook. The required
columns are **Person Name** and **Company**; **Location** and **Website** are
optional. Blank rows are ignored.

You can also choose another workbook from the command line:

```bash
python reverse_boolean.py --contacts my_clients.xlsx
```

## Interactive usage

```bash
python reverse_boolean.py
```

The console asks:

```text
Contact 1 - Person Name: John Doe
  Company: ABC HVAC
  Location (optional): Atlanta, GA
  Company website (optional): https://abchvac.example

Contact 2 - Person Name:
```

Leaving the next person name blank begins the analysis.

You may start with **one person**. Multiple known buyers are better for discovering repeated patterns.

## Text file usage

Create `contacts.txt`:

```text
John Doe | ABC HVAC | Atlanta, GA | https://abchvac.example
Jane Smith | Southern Heating | Charlotte, NC |
```

Run:

```bash
python reverse_boolean.py --contacts contacts.txt --agency-context "Agency sells AI lead follow-up to HVAC contractors"
```

## Example output

```text
ANCHOR: John Doe @ ABC HVAC

BUYER PROFILE
  Current title: President
  Management level: Owner/Executive
  Function: Operations / Executive
  Sales Nav seniority: Owner, CXO

COMPANY PROFILE
  Employees: ~35 (range 25-50)
  LinkedIn headcount band: 11-50
  Rough annual revenue: $5.0M - $10.0M
  Revenue confidence: Medium

VALIDATION SEARCH

TITLE BOOLEAN:
("Owner" OR "President" OR "Founder" OR "CEO")

KEYWORD BOOLEAN:
("HVAC" OR "Heating and Cooling" OR "Air Conditioning")

LEAD FILTERS:
  Company Headcount: 11-50
  Seniority: Owner, CXO
  Geography: Georgia
  Industry: relevant HVAC / construction category
```

The exact output depends on public evidence for the real person/company.

## No anchor leakage

The actual generated Sales Navigator search must not contain:

- the known person's name,
- the known company name,
- the known company domain,
- an exact Current Company constraint.

The Python validator checks for accidental leakage and emits a warning if the model violates this.

## Revenue estimates

Private contractor revenue is frequently unavailable publicly. The tool is instructed to:

- prefer reported/reputable estimates when found,
- otherwise infer a **broad range**, not a fake exact number,
- show a confidence rating,
- explain the estimation basis,
- return unknown if there is not enough evidence.

Use revenue as a qualification signal, not accounting-grade data.

## Cost controls

Default model:

```text
gpt-5.6-luna
```

Default web-search context:

```text
low
```

The tool also caches identical analyses locally in:

```text
.reverse_boolean_cache/
```

If you run the exact same inputs again, it reuses the cached JSON instead of making another API research call.

Force fresh research:

```bash
python reverse_boolean.py --contacts contacts.txt --refresh
```

Disable cache entirely:

```bash
python reverse_boolean.py --no-cache
```

Disable web research:

```bash
python reverse_boolean.py --contacts contacts.txt --no-web
```

`--no-web` is not recommended when all you have is a person's name and company.

## Output JSON

The console-friendly result is also saved to:

```text
contact_boolean_strategy.json
```

This is what the future app should consume.

High-level structure:

```json
{
  "contacts": [
    {
      "person_profile": {},
      "company_profile": {},
      "validation_search": {},
      "expansion_search": {}
    }
  ],
  "combined_strategy": {},
  "validation_warnings": []
}
```

## Integrating this into the larger app

```python
from reverse_boolean import KnownContact, ContactReverseSearchEngine

engine = ContactReverseSearchEngine()

result = engine.generate([
    KnownContact(
        name="John Doe",
        company="ABC HVAC",
        location="Atlanta, GA",
        website="https://abchvac.example",
    )
])
```

Later your FastAPI endpoint can call the same class. The console interface can be removed without changing the core engine.

## Deliberately NOT included

This MVP does not:

- scrape LinkedIn,
- log into LinkedIn,
- automate LinkedIn messages/connections,
- automatically assume neighboring search results are qualified,
- call Apollo,
- send outreach.

The purpose of this component is only to prove:

> Can we take a person who already buys/talks to the agency, anonymously reconstruct their buyer/company pattern, and create a Sales Navigator search that finds that person plus useful lookalikes?

Once that works reliably, the next component should consume the resulting prospects and qualify/rank them.
