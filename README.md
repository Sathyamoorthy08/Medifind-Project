# MediFind AI

A full-stack classroom demonstration that lets people search fictional medicine listings, inspect nearby pharmacy locations, and create pickup reservations. Pharmacy accounts can publish a profile, manage inventory, and confirm or decline reservations.

> **Demo data, not a live medicine directory.** Every preloaded pharmacy and its inventory is fictional and marked “Fictional demo inventory” in the interface and API. New pharmacy profiles and stock are self-reported by the account owner; listings are marked pharmacy reported and should be confirmed by phone. This project does not verify stock, prices, licensing, or clinical suitability and is not medical advice.

## Features

- React + Vite responsive search and user/pharmacy dashboards
- Express REST API with Mongoose models for accounts, pharmacies, inventory, and reservations
- Case-insensitive medicine, generic-name, and category search; local AI Availability Assistant using a maintained active-ingredient lookup (no external AI API); city filtering, OSM/Leaflet map, stock and prices
- Registration and login with bcrypt password hashes, signed JWTs, role checks, Helmet, CORS allowlist, JSON size limit, and auth rate limit
- Pharmacy profile setup and inventory create, edit quantity, and delete
- Quantity-based reservation confirmation modal; stock is reserved once on submit; pharmacy accept/reject; user can cancel pending or confirmed reservations before collection; released quantity is restored once
- Fictional seed data: five pharmacies, 21 medicine catalog entries per pharmacy (105 listings), two demo users
- No paid APIs or secret values committed; smart lookup is rule-based, not a trained clinical AI model. Local synonym references are maintained in `server/src/availabilityAssistant.js` (NLM MeSH/DailyMed, NIH ODS, and WHO).

## Prerequisites (Windows)

Install a current Node.js LTS release (npm is included). MongoDB Community Server or a free Atlas cluster is optional: with DEMO_MODE=true, the API automatically switches to fictional in-memory data when it cannot connect. No API keys or paid services are required. Check in PowerShell:

```powershell
node --version
npm --version
mongod --version
```

If `npm` is not recognized after installing Node, close and reopen PowerShell/VS Code and check the Node.js install directory is on PATH.

## Local setup

From the project folder in PowerShell:

```powershell
Copy-Item server/.env.example server/.env
notepad server/.env
npm.cmd install
```

Set `JWT_SECRET` to a unique random value of at least 32 characters. You can generate one without an external service:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste that output into `JWT_SECRET`. Keep `.env` private; it is excluded by `.gitignore`. For MongoDB mode, leave `MONGODB_URI=mongodb://127.0.0.1:27017/medifind_ai`, start MongoDB, then seed the fictional listings. For the zero-setup review demo, leave `DEMO_MODE=true`; MongoDB is optional and the API automatically loads fictional in-memory data if the database is unavailable. In-memory account, stock, and reservation changes reset when the API restarts. In MongoDB mode, seed with:

```powershell
npm.cmd run seed
```

Run the app in development:

```powershell
npm.cmd run dev
```

Open the URL printed by Vite (normally <http://localhost:5173>; Vite selects 5174 if 5173 is already occupied). Vite proxies `/api` requests to the Express API on port 5000. To run separately, use two PowerShell terminals: `npm.cmd run server:dev` and `npm.cmd run client:dev`. For production frontend build, run `npm.cmd run build`; serve the generated `dist` with a static host and deploy the API separately with `CLIENT_ORIGIN` set to the frontend origin. Configure secrets through the host's environment variables.

## Demo accounts

Seeded by `npm.cmd run seed` (both use the same password):

| Role | Email | Password |
| --- | --- | --- |
| Medicine seeker | `user@demo.medifind.test` | `DemoPass123!` |
| Pharmacy manager | `pharmacy@demo.medifind.test` | `DemoPass123!` |

These are demo-only credentials. Do not reuse them for real services. Reseeding deletes/replaces only the seeded demo accounts, demo pharmacies, and demo inventory. Do not use the demo credentials on a public deployment.

## REST API

All JSON endpoints are under `/api`. Authenticated routes use `Authorization: Bearer <token>`.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | API/database/demo status |
| POST | `/auth/register` | Public | Register user or pharmacy account |
| POST | `/auth/login` | Public | Login, returns JWT and user |
| GET | `/auth/me` | Signed in | Current account |
| GET | `/pharmacies?city=Chennai` | Public | List/filter pharmacy locations |
| POST | `/pharmacies` | Pharmacy | Create pharmacy profile (lat/lng required) |
| GET | `/medicines/search?q=paracetamol` | Public | Case-insensitive medicine, generic, and category search |
| GET | `/medicines/availability-assistant?q=tylenol` | Public | Transparent local active-ingredient suggestions when no stock is found |
| GET/POST | `/inventory` | Pharmacy | List/add own inventory |
| PATCH/DELETE | `/inventory/:id` | Pharmacy | Update/delete own item |
| POST | `/reservations` | User | Reserve a validated quantity using inventoryId and quantity |
| GET | `/reservations/mine` | Signed in | User's reservation history |
| GET | `/reservations/pharmacy` | Pharmacy | Incoming reservations |
| PATCH | `/reservations/:id/status` | Pharmacy | Accept or reject a pending request |
| PATCH | `/reservations/:id/cancel` | Reservation owner | Cancel own pending or confirmed reservation before collection; release stock once |

Reservation states shown in the UI are PENDING, CONFIRMED, REJECTED, and CANCELLED. Users may cancel pending requests or confirmed requests before collection begins. The API scopes cancellation to the reservation owner and uses conditional state updates to prevent duplicate release. Pharmacy acceptance never deducts stock again; rejection returns stock.
## Checks

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
```

The Node test suite checks the 21-entry seed catalog, medicine/category search, assistant known/unknown matching, explicit reservation form wiring, exact stock deduction for quantity 3, acceptance without a second deduction, rejection and user cancellation with one-time restoration, ownership boundaries, invalid quantities, and overbooking. The Vite production build compiles the frontend. MongoDB persistence is optional and requires a separately running MongoDB service; in-memory changes reset on API restart.

## Security and scope notes

- Copy `server/.env.example` to `server/.env`; never commit real credentials, database URIs, or production JWT secrets.
- Set a different strong `JWT_SECRET` on every deployment. JWTs are stored in browser localStorage for this classroom demo; for a production health product, review an httpOnly-cookie/session design, CSRF controls, privacy requirements, monitoring, and security testing.
- `DEMO_MODE` labels the environment; demo status comes from each pharmacy/inventory record. New pharmacy submissions are self-reported, not independently verified.
- Search results show available quantity only; distances are not calculated, despite map location pins. City filtering is done in the browser against the returned search results.
- OpenStreetMap tiles require internet access and follow OSM tile usage policy. Google Fonts are optional cosmetic assets and fall back to local sans-serif fonts.
- Smart search is a small local synonym lookup, not a trained AI model or clinical decision system. The demo does not offer diagnosis, dosing recommendations, prescription validation, payments, delivery, or live pharmacy integrations.

## GitHub push instructions

This workspace may not already be a Git checkout. Create an empty repository on GitHub, then in PowerShell from this directory:

```powershell
git init
git add .
git commit -m "Build MediFind AI medicine availability demo"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the remote URL with your repository. Before pushing, verify `.env` files are ignored and no real credentials are staged: `git status --short` and `git check-ignore server/.env`.

## Three-minute review presentation

**0:00–0:25 — Problem and scope**  
“Finding nearby medicine stock can take several calls. MediFind AI is a college-project prototype for searching fictional medicine listings and reserving pickup. It is a workflow demonstration, not a live availability service or medical advice.”

**0:25–0:55 — Search and assistant**  
“Search works by medicine, generic name, and category. Inventory is fictional. If a search has no stock in this city, the AI Availability Assistant checks listed locations and a small, transparent local active-ingredient dataset. It does not choose a dose or substitute treatment.” Search `paracetamol`, then `Tylenol` with a city that has no matching result to demonstrate the assistant.

**0:55–1:35 — Reservation workflow**  
“After signing in as a seeker, I choose a quantity in the reservation review form. Confirming calls the Express API, reserves that amount, and creates a pending request with a pickup code. I can cancel pending requests or confirmed requests before collection.” Reserve three units and show My Reservations with its total and status.

**1:35–2:10 — Pharmacy workflow**  
“Pharmacy managers have a separate role-protected dashboard. They can manage the 21-item fictional seed catalog and review incoming reservations. Accepting does not deduct stock again; rejecting releases the reserved units.” Sign in with the demo pharmacy account and accept or reject a request.

**2:10–2:40 — Engineering**  
“The stack is React and Vite, Express, MongoDB and Mongoose with an in-memory offline demo mode, JWT authentication with bcrypt password hashing, and Leaflet with OpenStreetMap. Availability suggestions use a local, inspectable ingredient map instead of paid or external AI services.”

**2:40–3:00 — Limitations and next step**  
“Seed inventory and map points are fictional; pharmacy-entered listings are self-reported and should be called to confirm. Suggestions are informational, not a prescription or a guarantee of therapeutic equivalence. The next production step would be verified pharmacy onboarding and a reliable stock update process, with privacy and security review.”
