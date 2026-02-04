# Fix Google Sign-In (can’t log in)

You can use **Sign in with Google** (popup) or **Sign in with Google (redirect)** on the login page. If one fails, try the other.

---

## Quick checklist (do all of these)

**1. Firebase – enable Google**

- [Firebase Console](https://console.firebase.google.com) → project **stacky-f7f42** → **Authentication** → **Sign-in method**
- Click **Google** → **Enable** → set support email → **Save**

**2. Firebase – authorized domains**

- **Authentication** → **Settings** → **Authorized domains**
- Add: **localhost** (and **stacky-f7f42.web.app** if you deploy)

**3. Google Cloud – exact URL you use**

- [Google Cloud Console](https://console.cloud.google.com) → project **stacky-f7f42** → **APIs & Services** → **Credentials**
- Open the **Web client** (Firebase uses this)
- Under **Authorized JavaScript origins** click **+ ADD URI** and add the **exact** address you open in the browser, for example:
  - `http://localhost:5173`
  - `http://localhost:5174`
  - (Use the port your dev server shows, e.g. “Local: http://localhost:5174/”)
- Click **Save**

Then try **Sign in with Google** again; if it fails, try **Sign in with Google (redirect)**.

---

## Error: `auth/configuration-not-found`

**Meaning:** Firebase Auth doesn’t have Google sign-in configured for this project.

**Fix:**

1. Open [Firebase Console](https://console.firebase.google.com) → your project **stacky-f7f42**.
2. In the left sidebar click **Build** → **Authentication**.
3. If you see **“Get started”**, click it to turn on Authentication (then continue).
4. Open the **Sign-in method** tab.
5. Click **Google** in the list.
6. Turn **Enable** on, choose a **Project support email**, then click **Save**.

After saving, try signing in again. If the error persists, turn Google **Off** and then **On** again and **Save**.

---

## Error: “The requested action is invalid” or redirect issues

Usually means your app’s domain isn’t allowed. Do the steps below.

## 1. Enable Google sign-in in Firebase

1. Open [Firebase Console](https://console.firebase.google.com) → your project **stacky-f7f42**.
2. Go to **Authentication** → **Sign-in method**.
3. Click **Google** → turn **Enable** on → set a support email → **Save**.

## 2. Add authorized domains in Firebase (critical for redirect)

1. In Firebase Console go to **Authentication** → **Settings** → **Authorized domains**.
2. Click **Add domain** and add:
   - **localhost** (covers `http://localhost:5173` and other ports)
   - **stacky-f7f42.web.app**
   - **stacky-f7f42.firebaseapp.com** (often already there)

Enter only the **domain** (no `http://` or path). Use **localhost**, not **127.0.0.1**.

## 3. (If still failing) Check Google Cloud OAuth client

Firebase uses a Web client in Google Cloud. The **Authorized JavaScript origins** must include the **exact** URL you’re opening the app from.

1. Open [Google Cloud Console](https://console.cloud.google.com) → select project **stacky-f7f42**.
2. Go to **APIs & Services** → **Credentials**.
3. Open the **Web client** used by Firebase (name often includes “Web client” or your app name).
4. Under **Authorized JavaScript origins** add the **full origin** (scheme + host + port, no path):
   - `http://localhost:5173` (Vite default; add the port you actually use)
   - `http://localhost` (if you use port 80)
   - `https://stacky-f7f42.web.app`
   - `https://stacky-f7f42.firebaseapp.com`
5. Under **Authorized redirect URIs** leave the Firebase handler (e.g. `https://stacky-f7f42.firebaseapp.com/__/auth/handler`) — don’t remove it.
6. **Save**.

## 4. Retry

- Restart the dev server (`npm run dev`) if you added `localhost`.
- Try sign-in again in the app.

If it still fails, open the browser **Developer tools → Console** and check the exact error message; that will narrow down redirect/OAuth vs domain issues.
