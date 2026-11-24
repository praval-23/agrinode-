# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

### Local backend connection

Copy `.env.example` to `.env.local` and set the backend URL:

```bash
EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:3000
# Optional prototype bearer token when AUTH_REQUIRED=true.
EXPO_PUBLIC_API_TOKEN=
```

Use the development computer's LAN IPv4 address for Expo Go on a physical Android phone, for example `http://192.168.1.25:3000`. The phone and computer must be on the same network. Start the backend with `npm.cmd run dev --prefix backend`, then start Expo with `npx expo start`.

### Government market prices

The backend market adapter uses the data.gov.in AGMARKNET resource. Configure these variables in the backend environment (Render service variables in production, `backend/.env` locally):

```env
MARKET_DATA_PROVIDER=government
GOVERNMENT_MARKET_RESOURCE_ID=35985678-0d79-46b4-9ed6-6f13308a1d24
GOVERNMENT_API_BASE_URL=https://api.data.gov.in/resource
GOVERNMENT_API_KEY=your-data-gov-in-key
```

Keep `GOVERNMENT_API_KEY` only in the backend environment. Do not put it in `.env.local`, any `EXPO_PUBLIC_*` variable, or frontend code. To revert resources, set `GOVERNMENT_MARKET_RESOURCE_ID=9ef84268-d588-465a-a308-a864a43d0070`.

The market response does not include an explicit price-unit field. Until the unit is confirmed in the official metadata for the selected resource, the app retains the raw source prices and does not display a converted ₹/kg price. After confirming the unit, optionally set `GOVERNMENT_MARKET_PRICE_UNIT` to `quintal`, `kg`, `tonne`, or `100kg`; conversion is applied only then. For example, set it to `quintal` only if the resource metadata confirms prices are ₹/quintal.

Optional backend settings:

```env
GOVERNMENT_MARKET_PRICE_UNIT=quintal
GOVERNMENT_API_LIMIT=100
GOVERNMENT_API_TIMEOUT_MS=20000
GOVERNMENT_MARKET_FRESHNESS_DAYS=7
MARKET_DATA_FALLBACK_ENABLED=false
```

The adapter requests one record to read the filtered total, then a bounded candidate page near the dataset tail. It sorts and deduplicates those candidates by reporting date, but the upstream pagination is not chronological, so global newest-record retrieval is not guaranteed. District data older than the freshness window is replaced by statewide results when available. Any enabled mock fallback is labeled as demo data, never government data. For strict production behavior, set `MARKET_DATA_FALLBACK_ENABLED=false`.

Run the backend checks from the repository root:

```powershell
npm.cmd test --prefix backend
npm.cmd run build --prefix backend
```

To safely check the configured upstream connection from Render Shell, run:

```sh
npx tsx backend/diag-market-diagnostics.mts
```

The diagnostic reports provider/resource configuration, HTTP status, response time, record count, reporting dates, and whether returned rows match the expected government fields. It never prints the API key. A tail-page result is evidence of a government response, not proof that it is globally newest.

To check the screen on a phone, set `EXPO_PUBLIC_API_URL` in the root `.env.local` to the backend's reachable URL (`http://<computer-LAN-IP>:3000` for a phone on the same Wi-Fi, or the Render HTTPS URL), start the backend, then run `npx expo start` and scan the QR code with Expo Go. Open Farmer → Market. Government cards show the actual market, district/state, reporting date, freshness, and source; mock fallback cards are explicitly labeled. A ₹/kg amount appears only when the backend price unit is verified and configured.

### Functional MVP boundaries

The buyer marketplace reads active listings from `GET /api/listings` and falls back to local demo listings only when the backend is unavailable. Orders, settlement calculations, and demo logistics are persisted by the backend's explicit local JSON provider. PostgreSQL/Supabase migration SQL is in `backend/src/db/001_commerce.sql`; no production database credentials are configured in this repository.

The backend supports configured bearer-token authentication with `AUTH_REQUIRED=true` and `AUTH_TOKENS=token=userId:role`. Leave it disabled only for local demo mode. Settlement records calculate Farmer 85%, Transporter 10%, and FPO Service Node 5%; `actualTransfer` remains `false` because no payment provider is connected.

ONDC is not integrated. The adapter at `backend/src/integrations/ondc.ts` defines catalog, order, and status mapping points for a future seller-side and buyer-side network integration.

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
