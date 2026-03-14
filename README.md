# CausalLab — Experimentation Review and A/B Test Analysis Platform

CausalLab is a full-stack platform for reviewing randomized A/B test datasets with diagnostics, statistical analysis, trust-aware reporting, safe data cleanup, covariate-adjusted analysis, sample datasets, and LLM-generated stakeholder summaries.

## Overview

Teams often focus only on p-values and lift, even when the experiment itself may be flawed. CausalLab is designed to separate:

- **statistical effect estimation**
- **experiment trustworthiness**

The platform helps users upload an experiment dataset, map treatment and outcome columns, validate the setup, run diagnostics, estimate treatment effects, apply safe fixes when needed, and generate stakeholder-friendly reports.

## Key Features

### Dataset Ingestion and Validation
- Upload CSV datasets through a web interface
- Profile dataset schema and preview rows
- Dynamically map treatment, outcome, ID, timestamp, pre-period, and covariate columns
- Validate column mapping before analysis
- Carry mapping status forward into Data Readiness

### Data Readiness and Safe Cleanup
- Check for:
  - duplicate rows
  - missing treatment values
  - missing outcome values
  - invalid treatment group structure
  - outcome type problems
  - binary outcome validity
  - timestamp parse issues
  - covariate usability
- Apply safe cleanup fixes such as:
  - normalize empty strings
  - standardize treatment labels
  - coerce binary outcome values
  - remove duplicate rows
  - drop rows with missing treatment
  - drop rows with missing outcome
- Automatically re-run readiness checks on the cleaned dataset
- Show cleanup impact before continuing to diagnostics

### Experiment Diagnostics
- Treatment group counts
- Sample Ratio Mismatch (SRM) detection
- Missing outcome checks by group
- Raw outcome summaries by group
- Expected-vs-observed treatment allocation review
- Trust-aware warnings carried into downstream reporting

### Statistical Analysis

#### Binary outcomes (for example: `converted`)
- Conversion rates by group
- Absolute lift
- Relative lift
- Two-proportion z-test
- 95% confidence interval
- Optional covariate-adjusted analysis with logistic regression

#### Continuous outcomes (for example: `revenue`)
- Mean outcome by group
- Absolute lift
- Relative lift
- Difference-in-means testing
- 95% confidence interval
- Optional covariate-adjusted analysis with OLS regression

### Adjusted Analysis
- Supports pre-treatment covariates
- Shows:
  - adjusted lift
  - adjusted p-value
  - adjusted confidence interval
  - covariates used
  - dropped covariates when the model cannot safely use them
  - warnings when adjustment is unstable
- Safely declines adjusted analysis when covariates are redundant, highly collinear, or otherwise unsuitable

### Trust-Aware Reporting
- Trust score summarizing experiment reliability
- Trust-aware analysis page
- Printable report page
- LLM-generated:
  - Executive Summary
  - Reliability Note
  - Recommendation

### Sample Datasets
Built-in sample datasets are available directly on the Upload page so reviewers can try the platform without bringing their own file.

Included examples:
- `clean_ab_data.csv`
- `messy_ab_test_dataset.csv`
- `flawed_ab_data.csv`
- `marketing_AB.csv`
- `ab_data.csv`

## Why It Matters

A statistically significant result is not always a trustworthy result.

CausalLab is designed to answer two separate questions:

1. **Did the treatment outperform control?**
2. **Is the experiment reliable enough to trust that conclusion?**

That distinction is one of the most important design choices in the project.

## Tech Stack

### Frontend
- Next.js
- TypeScript
- Tailwind CSS

### Backend
- FastAPI
- Python
- pandas
- NumPy
- SciPy
- statsmodels

### LLM Layer
- OpenAI API

### Deployment
- Vercel (frontend)
- Render (backend)

## Architecture

```text
CausalLab/
├── backend/
│   ├── app/
│   │   ├── api/routes/
│   │   ├── models/
│   │   ├── services/
│   │   └── utils/
│   ├── uploads/
│   ├── reports/
│   ├── scripts/
│   └── requirements.txt
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── public/
│   │   └── sample-datasets/
│   └── package.json
├── data/
│   └── generated/
└── README.md
```

## End-to-End Workflow

1. Upload a CSV dataset or load a built-in sample dataset
2. Profile schema and preview data
3. Map treatment, outcome, ID, timestamp, pre-period, and covariate columns
4. Validate the mapping
5. Run Data Readiness checks
6. Apply safe fixes if needed
7. Run experiment diagnostics
8. Run A/B analysis
9. Review trust score and adjusted vs unadjusted results
10. Open printable report
11. Generate stakeholder-facing executive summary with the LLM layer

## Evaluation Strategy

The project was evaluated on both **clean** and **intentionally flawed** synthetic datasets.

### Clean synthetic dataset
Used to validate the expected “happy path”:
- balanced treatment/control split
- no missing outcome issue
- statistically significant positive effect
- no major warnings

### Messy synthetic dataset
Used to validate:
- mapping issues
- readiness failures
- safe cleanup workflow
- automatic re-evaluation after fixes
- adjusted analysis with baseline covariates

### Flawed synthetic dataset
Used to stress-test experiment trustworthiness:
- severe treatment/control imbalance
- missing outcomes or structural issues
- significant-looking treatment effect
- strong warnings that reduce confidence in the result

### Why this evaluation matters
This evaluation was designed to test not only whether the statistics were computed correctly, but also whether the platform could distinguish between:

- a statistically significant result
- a statistically significant **and trustworthy** result

That trust-aware distinction is a central part of the project design.

## Where Causal Inference Fits

CausalLab currently supports **causal inference in the randomized experiment setting**.

Because A/B tests assign treatment randomly, differences in outcomes can be interpreted causally if experiment diagnostics support validity. The current version does **not** support full observational causal inference methods such as:

- propensity score matching
- inverse probability weighting
- doubly robust estimation

So the most accurate description is:

> CausalLab is an experimentation review and treatment-effect analysis platform for randomized A/B test datasets.

## Live Demo

- **Frontend:** `https://causal-lab.vercel.app`
- **Backend API Docs:** `https://causallab.onrender.com/docs`

## Example Use Cases

- Review a randomized experiment before presenting results to stakeholders
- Detect SRM and missing-outcome issues before trusting a lift estimate
- Compare adjusted and unadjusted treatment effects from the same platform
- Demonstrate why statistically significant does not always mean decision-ready
- Generate printable reports for technical and non-technical audiences

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/Sankar16/CausalLab.git
cd CausalLab
```

### 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs by default on:

```text
http://127.0.0.1:8000
```

### 3. Frontend setup

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs by default on:

```text
http://localhost:3000
```

## Environment Variables

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

### Backend

Set these in your shell or deployment platform:

```env
OPENAI_API_KEY=your_openai_api_key
FRONTEND_URL=http://localhost:3000
```

## Deployed Setup

### Frontend
- Deploy on **Vercel**
- Root directory: `frontend`
- Set environment variable:

```env
NEXT_PUBLIC_API_BASE_URL=https://causallab.onrender.com
```

### Backend
- Deploy on **Render**
- Root directory: `backend`
- Build command:

```bash
pip install -r requirements.txt
```

- Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

- Environment variables:

```env
OPENAI_API_KEY=your_openai_api_key
FRONTEND_URL=https://your-vercel-url.vercel.app
```

## Screenshots

![Upload](docs/screenshots/upload.png)
![Mapping1](docs/screenshots/mapping_1.png)
![Mapping2](docs/screenshots/mapping_2.png)
![Data Readiness1](docs/screenshots/data-readiness_1.png)
![Data Readiness2](docs/screenshots/data-readiness_2.png)
![Diagnostics1](docs/screenshots/diagnostics_1.png)
![Diagnostics2](docs/screenshots/diagnostics_2.png)
![Diagnostics3](docs/screenshots/diagnostics_3.png)
![Diagnostics4](docs/screenshots/diagnostics_4.png)
![Analysis1](docs/screenshots/analysis_1.png)
![Analysis2](docs/screenshots/analysis_2.png)
![Executive Summary](docs/screenshots/executive-summary.png)

## Limitations

- Designed primarily for randomized A/B test datasets
- Does not support full observational causal inference workflows yet
- Uploaded files are stored on the deployed backend instance for MVP simplicity
- LLM reporting quality depends on prompt design and structured inputs
- Binary adjusted-analysis confidence intervals are currently presented on the model coefficient scale (log-odds), with probability-scale lift shown separately for readability

## Future Improvements

- better mixed-evidence recommendation logic when adjusted and unadjusted analyses disagree
- subgroup analysis
- smarter covariate recommendations
- richer export formatting
- observational causal inference mode
- final chart artifact cleanup


## License

MIT License
