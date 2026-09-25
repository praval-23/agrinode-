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
