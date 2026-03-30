# Problem Statement

Modern analytical queries on large datasets are slow because traditional database systems compute exact results by scanning entire datasets, even when an approximate answer would suffice for decision-making. In many real-world scenarios (dashboards, trend analysis, monitoring), a near-accurate result delivered quickly is more valuable than a perfectly accurate result delivered late.

# Approach

We will build an adaptive approximate analytics engine that delivers fast, statistically defensible query results on large datasets. Key ideas:

- Use a Query Planner to analyze incoming SQL and select an appropriate approximation technique.
- Techniques include:
	- **HyperLogLog** for COUNT DISTINCT
	- **Adaptive random sampling** for AVG and SUM
	- **Stratified sampling** for GROUP BY with skewed distributions
	- **Reservoir sampling** for streaming/live queries
- Start with a small sample and iteratively increase sample size until the user-defined accuracy threshold is met.
- Return each intermediate result with: confidence interval, error margin, sample size, and elapsed time.
- Run an exact DuckDB query in parallel for benchmarking and final comparison (asynchronous, secondary).
- Present a hybrid result so the system performs only the work necessary to reach the requested precision.

# Tech Stack

- **Backend:** Python + FastAPI
- **Query Engine (exact):** DuckDB
- **Approximation Algorithms:** Custom sampling and sketch implementations (HLL, reservoir, stratified, adaptive sampling)
- **Frontend:** React (+ Recharts) for visualizations and progressive updates
- **Optional:** LLM adapter (e.g., Gemini/Claude) for natural-language-to-SQL translation with deterministic fallback templates

---

This document is a brief overview — see the `docs/` folder for API contracts and prompts.