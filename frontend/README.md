# Sales Conversion Agent — React + Vite + Tailwind

A UI console for the 4-agent Sales Rep Performance pipeline: fixed navbar, light/dark theme toggle (faint-blue light theme ↔ black dark theme), animated pipeline visualization, and a results dashboard with download/email export.

## Stack

- **React 19** + **Vite 8**
- **Tailwind CSS v4** (`@tailwindcss/vite` plugin, class-based dark mode via a `.dark` class on `<html>`)
- **lucide-react** for icons

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build → dist/
npm run preview   # preview the production build
```

## Project structure

```
src/
  App.jsx                     # top-level layout & state wiring
  index.css                   # Tailwind import + design tokens (@theme) + keyframes
  hooks/
    useTheme.js                # dark/light toggle, persisted to localStorage
    usePipeline.js              # simulates the 4-agent run (sequencing, timings)
  components/
    Navbar.jsx                  # fixed navbar, status pill, theme toggle
    Hero.jsx                     # rep input + run button + quick-pick chips
    Pipeline.jsx                  # 4-agent visualization (nodes, connector, fork)
    PipelineNode.jsx               # single agent card (idle/running/done states)
    Connector.jsx                   # animated data-flow line between nodes
    SourceChip.jsx                    # Gong / Salesforce / Transcript pill
    Dashboard.jsx                      # stat cards, account grid, actions, export
    AccountCard.jsx                     # per-account card with animated score ring
    EmailModal.jsx                       # "email report" dialog
    Toast.jsx                             # confirmation toast
  data/accounts.js              # mock rep summary + account data
  utils/report.js                # builds the downloadable .doc + mailto handoff
```

## The pipeline, as modeled

1. **Data Collection Agent** — fetches rep name + accounts from the database.
2. **Extraction Agent** — pulls Gong, Salesforce, and transcript data, then forks into
   **Key A** (→ Account Analysis Agent) and **Key B** (→ Sales Rep Agent).
3. **Account Analysis Agent** — scores each account off Key A.
4. **Sales Rep Agent** — reads Key B plus every account score for the quota-risk verdict.

Agents 3 and 4 animate in parallel since they both branch off the two keys produced by
Agent 2. Once all four finish, the dashboard reveals with stat cards, per-account cards,
and the actions taken.

## Wiring up to a real backend

Right now `usePipeline.js` simulates each stage with timed state changes and
`data/accounts.js` holds mock data. To connect this to your actual ADK pipeline:

- Replace the `wait()` calls in `usePipeline.js` with real `fetch`/`EventSource` calls to
  your FastAPI SSE endpoint (e.g. `/agent/run/{rep_id}`), updating `nodeStates` as each
  agent's event arrives instead of on a timer.
- Replace `ACCOUNTS` and `REP_SUMMARY` with the parsed `account_analysis[]` and
  `rep_assessment` output from your agents.
- For real email delivery, swap the `mailto:` handoff in `utils/report.js` for a call to
  your backend's email-sending endpoint.
